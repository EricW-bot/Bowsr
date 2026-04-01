import {
  MAX_DISPLAY_RESULTS,
  MAX_TRIP_ROUTE_CALCULATIONS,
  MAX_ROUTE_CALCULATIONS,
  ROUTING_CONCURRENCY,
  TRIP_CORRIDOR_KM
} from './constants';
import type { Coordinates, FuelApiData, RankedStation, RouteMetrics, Station } from './Interface';
import {
  fetchRouteDistanceDuration,
  fetchRouteVia,
  planRouteDistanceDuration,
  routeMetricsFromKnownDistanceKm
} from './routingClient';

export const sanitizePositiveNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const haversineStraightLineDistanceKm = (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLon = toRadians(endLon - startLon);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
};

const distancePointToSegmentKm = (
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates
): number => {
  const meanLat = toRadians((segmentStart.latitude + segmentEnd.latitude) / 2);
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(meanLat);

  const ax = segmentStart.longitude * kmPerDegLon;
  const ay = segmentStart.latitude * kmPerDegLat;
  const bx = segmentEnd.longitude * kmPerDegLon;
  const by = segmentEnd.latitude * kmPerDegLat;
  const px = point.longitude * kmPerDegLon;
  const py = point.latitude * kmPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.hypot(dx, dy);
  }

  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY);
};

export async function computeRankedStations(
  data: FuelApiData,
  userLat: number,
  userLon: number,
  neededStr: string,
  economyStr: string
): Promise<RankedStation[]> {
  const { stations, prices } = data;

  const neededLiters = sanitizePositiveNumber(neededStr, 50);
  const economyLper100km = sanitizePositiveNumber(economyStr, 8.0);
  const litersPerKm = economyLper100km / 100;

  const routeCandidateStations = stations.slice(0, MAX_ROUTE_CALCULATIONS);
  const priceByStationCode = new Map(prices.map((p) => [String(p.stationcode), p]));

  /**
   * Algorithmic ranking:
   * - If the API returns `station.location.distance`, we can compute route distance+duration and the exact cost
   *   without OSRM (fast path).
   * - If distance is missing, we compute a straight-line lower bound for pruning, and only then resolve route
   *   metrics (slow path) for plausible contenders.
   */

  type Candidate =
    | {
        station: (typeof routeCandidateStations)[number];
        priceCents: number;
        pricePerLiter: number;
        costLower: number;
        hasExactRoute: true;
        route: RouteMetrics;
      }
    | {
        station: (typeof routeCandidateStations)[number];
        priceCents: number;
        pricePerLiter: number;
        costLower: number;
        hasExactRoute: false;
      };

  const candidates: Candidate[] = routeCandidateStations
    .map((station) => {
      const stationPriceInfo = priceByStationCode.get(String(station.code));
      if (!stationPriceInfo || !Number.isFinite(stationPriceInfo.price)) return null;

      const priceCents = stationPriceInfo.price;
      const pricePerLiter = priceCents / 100;

      const apiDistanceKm = station.location.distance;
      const hasExactRoute = apiDistanceKm !== undefined && Number.isFinite(apiDistanceKm);

      if (hasExactRoute) {
        // Fast path: exact cost using the API-provided distance (no OSRM).
        const route = routeMetricsFromKnownDistanceKm(apiDistanceKm as number);
        const roundTripDistanceKm = route.distanceKm * 2;
        const fuelBurnedOnTrip = roundTripDistanceKm * litersPerKm;
        const totalEffectiveCost = pricePerLiter * (neededLiters + fuelBurnedOnTrip);

        return {
          station,
          priceCents,
          pricePerLiter,
          costLower: totalEffectiveCost,
          hasExactRoute: true,
          route
        };
      }

      // Slow candidate: compute a safe lower bound using straight-line distance.
      const straightKm = haversineStraightLineDistanceKm(
        userLat,
        userLon,
        station.location.latitude,
        station.location.longitude
      );
      const boundedLowerKm = Math.max(straightKm, 0.1);
      const roundTripLowerKm = boundedLowerKm * 2;
      const fuelBurnedLower = roundTripLowerKm * litersPerKm;
      const costLower = pricePerLiter * (neededLiters + fuelBurnedLower);

      return {
        station,
        priceCents,
        pricePerLiter,
        costLower,
        hasExactRoute: false
      };
    })
    .filter((x): x is Candidate => x !== null)
    .sort((a, b) => a.costLower - b.costLower);

  const best: RankedStation[] = [];
  let threshold = Infinity; // worst cost among current best-N

  for (const candidate of candidates) {
    if (best.length >= MAX_DISPLAY_RESULTS && candidate.costLower > threshold) continue;

    const route = candidate.hasExactRoute
      ? candidate.route
      : await planRouteDistanceDuration(
          { latitude: userLat, longitude: userLon },
          {
            latitude: candidate.station.location.latitude,
            longitude: candidate.station.location.longitude
          },
          { knownDistanceKm: candidate.station.location.distance }
        );

    const roundTripDistanceKm = route.distanceKm * 2;
    const fuelBurnedOnTrip = roundTripDistanceKm * litersPerKm;
    const totalEffectiveCost = candidate.pricePerLiter * (neededLiters + fuelBurnedOnTrip);

    best.push({
      ...candidate.station,
      priceCents: candidate.priceCents,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      totalCostDollars: totalEffectiveCost
    });

    best.sort((a, b) => a.totalCostDollars - b.totalCostDollars);
    if (best.length > MAX_DISPLAY_RESULTS) best.length = MAX_DISPLAY_RESULTS;
    threshold = best.length === MAX_DISPLAY_RESULTS ? best[MAX_DISPLAY_RESULTS - 1].totalCostDollars : Infinity;
  }

  // Keep ranking based on the existing strategy, but refresh displayed route
  // distance/duration using live routing providers (with fallbacks).
  const displayRefined = await runWithConcurrency(best, ROUTING_CONCURRENCY, async (station) => {
    const displayRoute = await fetchRouteDistanceDuration(
      { latitude: userLat, longitude: userLon },
      {
        latitude: station.location.latitude,
        longitude: station.location.longitude
      }
    );
    return {
      ...station,
      distanceKm: displayRoute.distanceKm,
      durationMin: displayRoute.durationMin
    };
  });

  return displayRefined;
}

type TripRankingParams = {
  data: FuelApiData;
  start: Coordinates;
  destination: Coordinates;
  neededStr: string;
  economyStr: string;
  maxCandidates?: number;
  corridorKm?: number;
};

type CandidateTripStation = {
  station: Station;
  priceCents: number;
  pricePerLiter: number;
  costLower: number;
};

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const resolvedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: resolvedConcurrency }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
}

export const computeTripNetCostDollars = (
  priceCents: number,
  litersToBuy: number,
  economyLPer100Km: number,
  baselineTripKm: number,
  tripWithStopKm: number
): number => {
  const pricePerLiter = priceCents / 100;
  const litersPerKm = economyLPer100Km / 100;
  const extraKm = Math.max(tripWithStopKm - baselineTripKm, 0);
  return pricePerLiter * (litersToBuy + extraKm * litersPerKm);
};

export const keepFeasibleRankedStations = (stations: (RankedStation | null)[]): RankedStation[] => {
  return stations.filter((item): item is RankedStation => item !== null);
};

export async function computeTripRankedStations(params: TripRankingParams): Promise<RankedStation[]> {
  const {
    data,
    start,
    destination,
    neededStr,
    economyStr,
    maxCandidates = MAX_TRIP_ROUTE_CALCULATIONS,
    corridorKm = TRIP_CORRIDOR_KM
  } = params;

  const baselineRoute = await fetchRouteDistanceDuration(start, destination);

  const neededLiters = sanitizePositiveNumber(neededStr, 50);
  const economyLper100km = sanitizePositiveNumber(economyStr, 8.0);
  const litersPerKm = economyLper100km / 100;
  const directLineKm = haversineStraightLineDistanceKm(
    start.latitude,
    start.longitude,
    destination.latitude,
    destination.longitude
  );

  const priceByStationCode = new Map(data.prices.map((p) => [String(p.stationcode), p]));
  const buildTripCandidates = (corridorLimitKm: number): CandidateTripStation[] =>
    data.stations
      .map((station) => {
        const distToSegmentKm = distancePointToSegmentKm(
          {
            latitude: station.location.latitude,
            longitude: station.location.longitude
          },
          start,
          destination
        );
        if (Number.isFinite(corridorLimitKm) && distToSegmentKm > corridorLimitKm) {
          return null;
        }

        const stationPriceInfo = priceByStationCode.get(String(station.code));
        if (!stationPriceInfo || !Number.isFinite(stationPriceInfo.price)) {
          return null;
        }

        const priceCents = stationPriceInfo.price;
        const pricePerLiter = priceCents / 100;
        const legToStation = haversineStraightLineDistanceKm(
          start.latitude,
          start.longitude,
          station.location.latitude,
          station.location.longitude
        );
        const legToDestination = haversineStraightLineDistanceKm(
          station.location.latitude,
          station.location.longitude,
          destination.latitude,
          destination.longitude
        );
        const lowerBoundExtraKm = Math.max(legToStation + legToDestination - directLineKm, 0);
        const lowerCost = pricePerLiter * (neededLiters + lowerBoundExtraKm * litersPerKm);

        return {
          station,
          priceCents,
          pricePerLiter,
          costLower: lowerCost
        };
      })
      .filter((item): item is CandidateTripStation => item !== null)
      .sort((a, b) => a.costLower - b.costLower)
      .slice(0, Math.max(maxCandidates, 1));

  let corridorCandidates: CandidateTripStation[] = buildTripCandidates(corridorKm);
  if (corridorCandidates.length === 0) {
    // If corridor filtering was too strict, widen to all candidates.
    corridorCandidates = buildTripCandidates(Number.POSITIVE_INFINITY);
  }

  const scored = await runWithConcurrency(corridorCandidates, ROUTING_CONCURRENCY, async (candidate) => {
    const stationPoint = {
      latitude: candidate.station.location.latitude,
      longitude: candidate.station.location.longitude
    };
    const tripWithStopRoute = await fetchRouteVia(start, stationPoint, destination);

    const detourKm = Math.max(tripWithStopRoute.distanceKm - baselineRoute.distanceKm, 0);
    const totalCostDollars = computeTripNetCostDollars(
      candidate.priceCents,
      neededLiters,
      economyLper100km,
      baselineRoute.distanceKm,
      tripWithStopRoute.distanceKm
    );
    return {
      ...candidate.station,
      priceCents: candidate.priceCents,
      distanceKm: tripWithStopRoute.distanceKm,
      durationMin: tripWithStopRoute.durationMin,
      totalCostDollars,
      baselineTripKm: baselineRoute.distanceKm,
      tripWithStopKm: tripWithStopRoute.distanceKm,
      detourKm
    } as RankedStation;
  });

  return keepFeasibleRankedStations(scored)
    .sort((a, b) => a.totalCostDollars - b.totalCostDollars)
    .slice(0, MAX_DISPLAY_RESULTS);
}

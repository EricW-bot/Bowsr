import {
  AVG_CITY_SPEED_KMH,
  MAX_ROUTE_CALCULATIONS,
  // ROUTING_CONCURRENCY intentionally unused after two-stage pruning.
} from './constants';
import type { FuelApiData, RankedStation, RouteMetrics } from './Interface';
import { fetchDrivingRoute } from './routingClient';

export const sanitizePositiveNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const routeMetricsFromNearbyDistanceKm = (distanceKm: number): RouteMetrics => {
  const d = Math.max(distanceKm, 0.1);
  return {
    distanceKm: d,
    durationMin: (d / AVG_CITY_SPEED_KMH) * 60
  };
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

const estimateRoute = (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): RouteMetrics => {
  // Haversine straight-line distance, scaled to approximate real roads.
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLon = toRadians(endLon - startLon);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = earthRadiusKm * c;

  const estimatedRoadKm = Math.max(straightLineKm * 1.3, 0.5);
  const estimatedDurationMin = (estimatedRoadKm / AVG_CITY_SPEED_KMH) * 60;

  return {
    distanceKm: estimatedRoadKm,
    durationMin: estimatedDurationMin
  };
};

async function resolveRouteMetrics(
  userLat: number,
  userLon: number,
  stationLat: number,
  stationLon: number,
  nearbyDistance: number | undefined
): Promise<RouteMetrics | null> {
  if (nearbyDistance !== undefined && Number.isFinite(nearbyDistance)) {
    return routeMetricsFromNearbyDistanceKm(nearbyDistance);
  }

  // Use OSRM when possible, but always fall back to a local estimate so the UI doesn't hang.
  const osrmRoute = await fetchDrivingRoute(userLat, userLon, stationLat, stationLon);
  return osrmRoute ?? estimateRoute(userLat, userLon, stationLat, stationLon);
}

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
        const route = routeMetricsFromNearbyDistanceKm(apiDistanceKm as number);
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
  let threshold = Infinity; // worst cost among current best-5

  for (const candidate of candidates) {
    if (best.length >= 5 && candidate.costLower > threshold) continue;

    const route = candidate.hasExactRoute
      ? candidate.route
      : await resolveRouteMetrics(
          userLat,
          userLon,
          candidate.station.location.latitude,
          candidate.station.location.longitude,
          candidate.station.location.distance
        );

    if (!route) continue;

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
    if (best.length > 5) best.length = 5;
    threshold = best.length === 5 ? best[4].totalCostDollars : Infinity;
  }

  return best;
}

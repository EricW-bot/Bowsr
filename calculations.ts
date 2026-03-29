import {
  AVG_CITY_SPEED_KMH,
  MAX_ROUTE_CALCULATIONS,
  ROUTING_CONCURRENCY
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

export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> => {
  const safeLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

export const routeMetricsFromNearbyDistanceKm = (distanceKm: number): RouteMetrics => {
  const d = Math.max(distanceKm, 0.1);
  return {
    distanceKm: d,
    durationMin: (d / AVG_CITY_SPEED_KMH) * 60
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
  return fetchDrivingRoute(userLat, userLon, stationLat, stationLon);
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

  const rankedCandidates = await mapWithConcurrency(
    routeCandidateStations,
    ROUTING_CONCURRENCY,
    async (station): Promise<RankedStation | null> => {
      const stationPriceInfo = priceByStationCode.get(String(station.code));
      if (!stationPriceInfo || !Number.isFinite(stationPriceInfo.price)) {
        return null;
      }

      const route = await resolveRouteMetrics(
        userLat,
        userLon,
        station.location.latitude,
        station.location.longitude,
        station.location.distance
      );

      if (!route) {
        return null;
      }

      const pricePerLiter = stationPriceInfo.price / 100;
      const roundTripDistance = route.distanceKm * 2;
      const fuelBurnedOnTrip = roundTripDistance * litersPerKm;
      const totalEffectiveCost = pricePerLiter * (neededLiters + fuelBurnedOnTrip);

      return {
        ...station,
        priceCents: stationPriceInfo.price,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        totalCostDollars: totalEffectiveCost
      };
    }
  );

  const mergedList = rankedCandidates.filter((item): item is RankedStation => item !== null);
  mergedList.sort((a, b) => a.totalCostDollars - b.totalCostDollars);
  return mergedList.slice(0, 5);
}

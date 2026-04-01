import type { Coordinates, RouteMetrics } from './Interface';
import { Platform } from 'react-native';
import { AVG_CITY_SPEED_KMH, OPENROUTESERVICE_API_KEY } from './constants';
import { fetchWithTimeout } from './network';

let estimatedRoutingUsedInSession = false;

export function beginRoutingSession(): void {
  estimatedRoutingUsedInSession = false;
}

export function getRoutingSessionSource(): 'live' | 'estimated' {
  return estimatedRoutingUsedInSession ? 'estimated' : 'live';
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(start: Coordinates, end: Coordinates): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(end.latitude - start.latitude);
  const lonDelta = toRadians(end.longitude - start.longitude);
  const startLat = toRadians(start.latitude);
  const endLat = toRadians(end.latitude);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function estimateRouteDistanceDuration(start: Coordinates, end: Coordinates): RouteMetrics {
  const directKm = haversineKm(start, end);
  const adjustedRoadKm = Math.max(directKm * 1.25, 0.5);
  const assumedAvgSpeedKph = 52;
  return {
    distanceKm: adjustedRoadKm,
    durationMin: (adjustedRoadKm / assumedAvgSpeedKph) * 60
  };
}

export function routeMetricsFromKnownDistanceKm(distanceKm: number): RouteMetrics {
  const d = Math.max(distanceKm, 0.1);
  return {
    distanceKm: d,
    durationMin: (d / AVG_CITY_SPEED_KMH) * 60
  };
}

async function fetchOsrmRoute(start: Coordinates, end: Coordinates): Promise<RouteMetrics | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=false`;
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) throw new Error('OSRM request failed');
    const data: unknown = await response.json();
    const routes = (data as { routes?: { distance: number; duration: number }[] }).routes;
    const route = routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error('OSRM response missing route details');
    }
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.warn(`OSRM routing failed: ${message}`);
    return null;
  }
}

async function fetchOpenRouteServiceRoute(start: Coordinates, end: Coordinates): Promise<RouteMetrics | null> {
  if (!OPENROUTESERVICE_API_KEY) {
    console.warn('OpenRouteService routing skipped: EXPO_PUBLIC_OPENROUTESERVICE_API_KEY is missing.');
    return null;
  }

  const parseOrsRoute = (data: unknown): RouteMetrics | null => {
    const asRecord = data as {
      features?: { properties?: { summary?: { distance?: number; duration?: number } } }[];
      routes?: { summary?: { distance?: number; duration?: number } }[];
    };
    const featureSummary = asRecord.features?.[0]?.properties?.summary;
    const routeSummary = asRecord.routes?.[0]?.summary;
    const summary = featureSummary ?? routeSummary;
    if (!summary || !Number.isFinite(summary.distance) || !Number.isFinite(summary.duration)) {
      return null;
    }
    return {
      distanceKm: (summary.distance as number) / 1000,
      durationMin: (summary.duration as number) / 60
    };
  };

  const readErrorBody = async (response: Response): Promise<string> => {
    try {
      const text = await response.text();
      return text.slice(0, 300);
    } catch {
      return '';
    }
  };

  try {
    // Use GET with api_key/start/end to reduce browser CORS/preflight issues.
    const params = new URLSearchParams({
      api_key: OPENROUTESERVICE_API_KEY,
      start: `${start.longitude},${start.latitude}`,
      end: `${end.longitude},${end.latitude}`
    });
    const response = await fetchWithTimeout(
      `https://api.openrouteservice.org/v2/directions/driving-car?${params.toString()}`,
      { method: 'GET' },
      10000
    );

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(`ORS GET request failed (${response.status}) ${details}`.trim());
    }

    const data: unknown = await response.json();
    const parsed = parseOrsRoute(data);
    if (parsed) {
      return parsed;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.warn(`OpenRouteService GET routing failed: ${message}`);
  }

  // Retry with POST + Authorization header for deployments requiring this auth style.
  try {
    const response = await fetchWithTimeout(
      'https://api.openrouteservice.org/v2/directions/driving-car',
      {
        method: 'POST',
        headers: {
          Authorization: OPENROUTESERVICE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coordinates: [
            [start.longitude, start.latitude],
            [end.longitude, end.latitude]
          ]
        })
      },
      10000
    );

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(`ORS POST request failed (${response.status}) ${details}`.trim());
    }

    const data: unknown = await response.json();
    const parsed = parseOrsRoute(data);
    if (!parsed) {
      throw new Error('ORS response missing route summary');
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.warn(`OpenRouteService POST routing failed: ${message}`);
    return null;
  }
}

export async function fetchRouteDistanceDuration(start: Coordinates, end: Coordinates): Promise<RouteMetrics> {
  const osrmRoute = await fetchOsrmRoute(start, end);
  if (osrmRoute) {
    return osrmRoute;
  }

  if (Platform.OS !== 'web') {
    const orsRoute = await fetchOpenRouteServiceRoute(start, end);
    if (orsRoute) {
      return orsRoute;
    }
  } else {
    console.warn('Skipping OpenRouteService on web due to browser CORS restrictions from localhost.');
  }

  console.warn('Live routing provider unavailable, using estimated route.');
  estimatedRoutingUsedInSession = true;
  return estimateRouteDistanceDuration(start, end);
}

export async function fetchRouteVia(
  start: Coordinates,
  via: Coordinates,
  end: Coordinates
) : Promise<RouteMetrics> {
  const firstLeg = await fetchRouteDistanceDuration(start, via);
  const secondLeg = await fetchRouteDistanceDuration(via, end);

  return {
    distanceKm: firstLeg.distanceKm + secondLeg.distanceKm,
    durationMin: firstLeg.durationMin + secondLeg.durationMin
  };
}

export async function fetchDrivingRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<RouteMetrics> {
  return fetchRouteDistanceDuration(
    { latitude: startLat, longitude: startLon },
    { latitude: endLat, longitude: endLon }
  );
}

type RoutePlanOptions = {
  knownDistanceKm?: number;
};

export async function planRouteDistanceDuration(
  start: Coordinates,
  end: Coordinates,
  options: RoutePlanOptions = {}
): Promise<RouteMetrics> {
  if (Number.isFinite(options.knownDistanceKm)) {
    return routeMetricsFromKnownDistanceKm(options.knownDistanceKm as number);
  }
  return fetchRouteDistanceDuration(start, end);
}

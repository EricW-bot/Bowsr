import type { Coordinates, RouteMetrics } from './Interface';
import { fetchWithTimeout } from './network';

export async function fetchRouteDistanceDuration(start: Coordinates, end: Coordinates): Promise<RouteMetrics | null> {
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

export async function fetchRouteVia(
  start: Coordinates,
  via: Coordinates,
  end: Coordinates
): Promise<RouteMetrics | null> {
  const firstLeg = await fetchRouteDistanceDuration(start, via);
  if (!firstLeg) {
    return null;
  }

  const secondLeg = await fetchRouteDistanceDuration(via, end);
  if (!secondLeg) {
    return null;
  }

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
): Promise<RouteMetrics | null> {
  return fetchRouteDistanceDuration(
    { latitude: startLat, longitude: startLon },
    { latitude: endLat, longitude: endLon }
  );
}

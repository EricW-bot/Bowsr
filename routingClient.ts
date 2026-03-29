import type { RouteMetrics } from './Interface';

export async function fetchDrivingRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<RouteMetrics | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('OSRM request failed');
    const data: unknown = await response.json();
    const routes = (data as { routes?: Array<{ distance: number; duration: number }> }).routes;
    const route = routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error('OSRM response missing route details');
    }
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch {
    console.warn('OSRM routing failed for one or more stations.');
    return null;
  }
}

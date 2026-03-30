import type { RouteMetrics } from './Interface';

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDrivingRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<RouteMetrics | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetchWithTimeout(url, 8000);
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

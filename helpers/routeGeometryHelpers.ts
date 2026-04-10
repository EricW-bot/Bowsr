import type { Coordinates } from '../Interface';
import { fetchWithTimeout } from '../clients/network';

type OsrmGeometryResponse = {
  routes?: {
    geometry?: {
      coordinates?: number[][];
    };
  }[];
};

function toCoordinates(points: number[][]): Coordinates[] {
  return points
    .map((point) => {
      const [longitude, latitude] = point;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return { latitude, longitude };
    })
    .filter((point): point is Coordinates => point !== null);
}

async function fetchOsrmRouteGeometry(start: Coordinates, end: Coordinates): Promise<Coordinates[] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;
    const response = await fetchWithTimeout(url, { method: 'GET' }, 10000);
    if (!response.ok) {
      throw new Error(`OSRM geometry request failed (${response.status})`);
    }
    const data = (await response.json()) as OsrmGeometryResponse;
    const points = data.routes?.[0]?.geometry?.coordinates ?? [];
    if (!Array.isArray(points) || points.length === 0) {
      return null;
    }
    const coordinates = toCoordinates(points);
    return coordinates.length > 1 ? coordinates : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`OSRM geometry fetch failed: ${message}`);
    return null;
  }
}

export async function fetchOneWayRouteGeometry(
  start: Coordinates,
  station: Coordinates,
  destination: Coordinates
): Promise<Coordinates[] | null> {
  const firstLeg = await fetchOsrmRouteGeometry(start, station);
  const secondLeg = await fetchOsrmRouteGeometry(station, destination);
  if (!firstLeg || !secondLeg) {
    return null;
  }
  const combined = [...firstLeg];
  const secondStart = secondLeg[0];
  const firstEnd = combined[combined.length - 1];
  if (
    secondStart &&
    firstEnd &&
    secondStart.latitude === firstEnd.latitude &&
    secondStart.longitude === firstEnd.longitude
  ) {
    combined.push(...secondLeg.slice(1));
  } else {
    combined.push(...secondLeg);
  }
  return combined.length > 1 ? combined : null;
}

export async function fetchRoundTripRouteGeometry(start: Coordinates, station: Coordinates): Promise<Coordinates[] | null> {
  const outbound = await fetchOsrmRouteGeometry(start, station);
  const inbound = await fetchOsrmRouteGeometry(station, start);
  if (!outbound || !inbound) {
    return null;
  }
  const combined = [...outbound];
  const inboundStart = inbound[0];
  const outboundEnd = combined[combined.length - 1];
  if (
    inboundStart &&
    outboundEnd &&
    inboundStart.latitude === outboundEnd.latitude &&
    inboundStart.longitude === outboundEnd.longitude
  ) {
    combined.push(...inbound.slice(1));
  } else {
    combined.push(...inbound);
  }
  return combined.length > 1 ? combined : null;
}

import { API_KEY, BASIC_AUTH_HEADER } from './constants';
import type { FuelApiData, Price, Station } from './Interface';
import { normalizeBrands } from './utils';

const ensureFuelCredentials = (): void => {
  if (!API_KEY || !BASIC_AUTH_HEADER) {
    throw new Error(
      'NSW Fuel API credentials are missing. Copy .env.example to .env and set EXPO_PUBLIC_NSW_FUEL_API_KEY and EXPO_PUBLIC_NSW_FUEL_BASIC_AUTH, or define the same variables in CI (see README).'
    );
  }
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getFormattedUTCDateTime = (): string => {
  const d = new Date();

  const pad = (n: number): string => (n < 10 ? `0${n}` : n.toString());

  const day = pad(d.getUTCDate());
  const month = pad(d.getUTCMonth() + 1);
  const year = d.getUTCFullYear();
  let h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const strH = pad(h);
  return `${day}/${month}/${year} ${strH}:${m}:${s} ${ampm}`;
};

export const normalizeFuelApiData = (input: unknown): FuelApiData | null => {
  if (!input || typeof input !== 'object') return null;

  const root = input as Record<string, unknown>;
  const candidateContainers: Record<string, unknown>[] = [
    root,
    (root.data as Record<string, unknown>) || {},
    (root.payload as Record<string, unknown>) || {},
    (root.result as Record<string, unknown>) || {}
  ];

  for (const container of candidateContainers) {
    const rawStations = (container.stations as unknown[]) || [];
    const rawPrices = (container.prices as unknown[]) || [];

    if (!Array.isArray(rawStations) || !Array.isArray(rawPrices)) {
      continue;
    }

    const stations: Station[] = rawStations
      .map<Station | null>((s) => {
        const station = (s || {}) as Record<string, unknown>;
        const locationObj = (station.location || {}) as Record<string, unknown>;

        const code = toStringValue(station.code ?? station.stationcode ?? station.stationCode);
        const name = toStringValue(station.name ?? station.stationname ?? station.stationName);
        const latitude = toNumberValue(locationObj.latitude ?? station.latitude);
        const longitude = toNumberValue(locationObj.longitude ?? station.longitude);
        const distance = toNumberValue(locationObj.distance);

        if (!code || !name || latitude === null || longitude === null) {
          return null;
        }

        return {
          code,
          name,
          brand: toStringValue(station.brand),
          address: toStringValue(station.address),
          state: toStringValue(station.state),
          brandid: toStringValue(station.brandid),
          stationid: toStringValue(station.stationid),
          location: {
            latitude,
            longitude,
            ...(distance !== null ? { distance } : {})
          }
        };
      })
      .filter((item): item is Station => item !== null);

    const prices: Price[] = rawPrices
      .map<Price | null>((p) => {
        const priceObj = (p || {}) as Record<string, unknown>;
        const stationcode = toStringValue(priceObj.stationcode ?? priceObj.stationCode);
        const price = toNumberValue(priceObj.price);
        if (!stationcode || price === null) {
          return null;
        }

        return {
          stationcode,
          price,
          fueltype: toStringValue(priceObj.fueltype ?? priceObj.fuelType),
          lastupdated: toStringValue(priceObj.lastupdated ?? priceObj.lastUpdated),
          state: toStringValue(priceObj.state)
        };
      })
      .filter((item): item is Price => item !== null);

    if (stations.length > 0 && prices.length > 0) {
      return { stations, prices };
    }
  }

  return null;
};

export const fetchNearbyFuelData = async (
  accessToken: string,
  brand: string[],
  latitude: number,
  longitude: number,
  radiusKm: number,
  fueltype: string
): Promise<FuelApiData | null> => {
  ensureFuelCredentials();
  const normalizedBrandArray = Array.from(new Set(normalizeBrands(brand)));
  const requestBody: Record<string, unknown> = {
    fueltype,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    radius: radiusKm.toString(),
    sortby: 'price',
    sortascending: 'true'
  };

  if (normalizedBrandArray.length > 0) {
    requestBody.brand = normalizedBrandArray;
  }

  const response = await fetch('https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/fuel/prices/nearby', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
      apikey: API_KEY,
      transactionid: `req-${Date.now()}-${radiusKm}`,
      requesttimestamp: getFormattedUTCDateTime()
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Nearby API failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  return normalizeFuelApiData(payload);
};

export const getAccessToken = async (): Promise<string> => {
  ensureFuelCredentials();
  const url =
    'https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: BASIC_AUTH_HEADER
    }
  });

  if (!response.ok) {
    throw new Error(`OAuth request failed with status ${response.status}`);
  }

  const data: unknown = await response.json();
  const token = (data as { access_token?: string }).access_token;
  if (!token) {
    throw new Error('OAuth response missing access token');
  }
  return token;
};

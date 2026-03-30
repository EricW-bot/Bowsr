const trimEnvValue = (value: string): string => {
  const t = value.trim();
  if (t.length >= 2) {
    const q = t[0];
    if ((q === '"' || q === "'") && t[t.length - 1] === q) {
      return t.slice(1, -1);
    }
  }
  return t;
};

export const API_KEY = trimEnvValue(process.env.API_KEY ?? '');
export const BASIC_AUTH_HEADER = trimEnvValue(process.env.BASIC_AUTH ?? '');

export const NEARBY_RADIUS_STEPS_KM = [3, 5, 8, 12, 18];
export const TARGET_NEARBY_STATIONS = 40;
export const MAX_ROUTE_CALCULATIONS = 20;
export const DEFAULT_FUEL_TYPE = 'E10';
export const FUEL_TYPE_OPTIONS = ['E10', 'U91', 'P95', 'P98', 'DL'];
export const BRAND_OPTIONS = [
  'Ampol Foodary',
  'Ampol Breeze',
  'BP',
  'Budget',
  'EG Ampol',
  'Enhance',
  'Metro Fuel',
  'Shell',
  'Speedway',
  'United',
  '7-Eleven'
];
export const AVG_CITY_SPEED_KMH = 50;

/** Max parallel OSRM requests when station distance is not in the API payload. */
export const ROUTING_CONCURRENCY = 4;

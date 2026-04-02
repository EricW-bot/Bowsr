import { Platform } from 'react-native';

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

export const API_KEY = trimEnvValue(process.env.EXPO_PUBLIC_API_KEY ?? '');
export const BASIC_AUTH_HEADER = trimEnvValue(
  process.env.EXPO_PUBLIC_BASIC_AUTH ?? ''
);
export const GOOGLE_MAPS_ANDROID_API_KEY = trimEnvValue(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '');
export const GOOGLE_MAPS_IOS_API_KEY = trimEnvValue(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '');
export const GOOGLE_MAPS_WEB_API_KEY = trimEnvValue(process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '');
export const GOOGLE_MAPS_API_KEY =
  Platform.OS === 'ios'
    ? GOOGLE_MAPS_IOS_API_KEY || GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_ANDROID_API_KEY
    : Platform.OS === 'android'
      ? GOOGLE_MAPS_ANDROID_API_KEY || GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_IOS_API_KEY
      : GOOGLE_MAPS_WEB_API_KEY || GOOGLE_MAPS_ANDROID_API_KEY || GOOGLE_MAPS_IOS_API_KEY;
export const OPENROUTESERVICE_API_KEY = trimEnvValue(process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY ?? '');

// Use a single request to NSW API with a fixed radius for performance.
export const NEARBY_RADIUS_KM = 15;
export const MAX_ROUTE_CALCULATIONS = 20;
export const TRIP_SAMPLE_RADIUS_KM = 20;
export const MAX_TRIP_ROUTE_CALCULATIONS = 16;
export const MAX_DISPLAY_RESULTS = 5;
export const TRIP_CORRIDOR_KM = 18;
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

export const DEFAULT_TRIP_START = {
  latitude: -34.0429,
  longitude: 150.8156
};

export const DEFAULT_TRIP_DESTINATION = {
  latitude: -33.5237,
  longitude: 151.204
};

export const DEFAULT_TRIP_DESTINATION_LABEL = 'Mooney Mooney bridge';

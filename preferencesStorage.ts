import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BRAND_OPTIONS,
  DEFAULT_FUEL_TYPE,
  DEFAULT_TRIP_DESTINATION,
  DEFAULT_TRIP_START,
  FUEL_TYPE_OPTIONS
} from './constants';
import type { AppMode, Coordinates } from './Interface';
import { type ThemeMode } from './theme';

const PREFERENCES_KEY = 'fuelnearme.preferences';

export type StoredUserPreferences = {
  themeMode: ThemeMode;
  appMode: AppMode;
  useCurrentLocation: boolean;
  fuelNeeded: string;
  fuelEconomy: string;
  fuelType: string;
  selectedBrands: string[];
  tripStart: Coordinates;
  tripDestination: Coordinates;
  tripStartAddress: string;
  tripDestinationAddress: string;
};

const DEFAULTS: StoredUserPreferences = {
  themeMode: 'light',
  appMode: 'roundTrip',
  useCurrentLocation: true,
  fuelNeeded: '25',
  fuelEconomy: '10.0',
  fuelType: DEFAULT_FUEL_TYPE,
  selectedBrands: [],
  tripStart: DEFAULT_TRIP_START,
  tripDestination: DEFAULT_TRIP_DESTINATION,
  tripStartAddress: '',
  tripDestinationAddress: ''
};

function coerceThemeMode(value: unknown): ThemeMode {
  return value === 'dark' || value === 'light' ? value : DEFAULTS.themeMode;
}

function coerceAppMode(value: unknown): AppMode {
  if (value === 'roundTrip' || value === 'oneWay') {
    return value;
  }
  // Legacy migration from previous mode names.
  if (value === 'nearby') {
    return 'roundTrip';
  }
  if (value === 'trip') {
    return 'oneWay';
  }
  return DEFAULTS.appMode;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceFuelType(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_FUEL_TYPE;
  const t = value.trim().toUpperCase();
  return FUEL_TYPE_OPTIONS.includes(t) ? t : DEFAULT_FUEL_TYPE;
}

function coerceBrands(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(BRAND_OPTIONS);
  return value.filter((item): item is string => typeof item === 'string' && allowed.has(item));
}

function coerceCoordinates(value: unknown, fallback: Coordinates): Coordinates {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  const parsedLat = typeof latitude === 'number' ? latitude : Number.parseFloat(String(latitude ?? ''));
  const parsedLon = typeof longitude === 'number' ? longitude : Number.parseFloat(String(longitude ?? ''));
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
    return fallback;
  }

  return {
    latitude: parsedLat,
    longitude: parsedLon
  };
}

function coerceAddress(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function mergeWithDefaults(raw: Partial<StoredUserPreferences> | null): StoredUserPreferences {
  if (!raw) return { ...DEFAULTS };
  const legacyRaw = raw as Partial<StoredUserPreferences> & { tripDestinationLabel?: unknown };
  return {
    themeMode: coerceThemeMode(raw.themeMode),
    appMode: coerceAppMode(raw.appMode),
    useCurrentLocation: coerceBoolean(raw.useCurrentLocation, DEFAULTS.useCurrentLocation),
    fuelNeeded: typeof raw.fuelNeeded === 'string' && raw.fuelNeeded.length > 0 ? raw.fuelNeeded : DEFAULTS.fuelNeeded,
    fuelEconomy: typeof raw.fuelEconomy === 'string' && raw.fuelEconomy.length > 0 ? raw.fuelEconomy : DEFAULTS.fuelEconomy,
    fuelType: coerceFuelType(raw.fuelType),
    selectedBrands: coerceBrands(raw.selectedBrands),
    tripStart: coerceCoordinates(raw.tripStart, DEFAULTS.tripStart),
    tripDestination: coerceCoordinates(raw.tripDestination, DEFAULTS.tripDestination),
    tripStartAddress: coerceAddress(raw.tripStartAddress),
    tripDestinationAddress: coerceAddress(raw.tripDestinationAddress ?? legacyRaw.tripDestinationLabel)
  };
}

export async function loadUserPreferences(): Promise<StoredUserPreferences> {
  try {
    const json = await AsyncStorage.getItem(PREFERENCES_KEY);
    let parsed: Partial<StoredUserPreferences> | null = null;
    if (json) {
      const data: unknown = JSON.parse(json);
      parsed = typeof data === 'object' && data !== null ? (data as Partial<StoredUserPreferences>) : null;
    }

    const merged = mergeWithDefaults(parsed);

    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveUserPreferences(partial: Partial<StoredUserPreferences>): Promise<void> {
  const current = await loadUserPreferences();
  const next: StoredUserPreferences = {
    themeMode: partial.themeMode !== undefined ? coerceThemeMode(partial.themeMode) : current.themeMode,
    appMode: partial.appMode !== undefined ? coerceAppMode(partial.appMode) : current.appMode,
    useCurrentLocation:
      partial.useCurrentLocation !== undefined ? coerceBoolean(partial.useCurrentLocation, true) : current.useCurrentLocation,
    fuelNeeded:
      partial.fuelNeeded !== undefined && partial.fuelNeeded.length > 0 ? partial.fuelNeeded : current.fuelNeeded,
    fuelEconomy:
      partial.fuelEconomy !== undefined && partial.fuelEconomy.length > 0 ? partial.fuelEconomy : current.fuelEconomy,
    fuelType: partial.fuelType !== undefined ? coerceFuelType(partial.fuelType) : current.fuelType,
    selectedBrands: partial.selectedBrands !== undefined ? coerceBrands(partial.selectedBrands) : current.selectedBrands,
    tripStart: partial.tripStart !== undefined ? coerceCoordinates(partial.tripStart, current.tripStart) : current.tripStart,
    tripDestination:
      partial.tripDestination !== undefined
        ? coerceCoordinates(partial.tripDestination, current.tripDestination)
        : current.tripDestination,
    tripStartAddress:
      partial.tripStartAddress !== undefined ? coerceAddress(partial.tripStartAddress) : current.tripStartAddress,
    tripDestinationAddress:
      partial.tripDestinationAddress !== undefined
        ? coerceAddress(partial.tripDestinationAddress)
        : current.tripDestinationAddress
  };
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
}

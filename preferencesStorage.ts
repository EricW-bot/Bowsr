import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRAND_OPTIONS, DEFAULT_FUEL_TYPE, FUEL_TYPE_OPTIONS } from './constants';
import { type ThemeMode } from './theme';

const PREFERENCES_KEY = 'fuelnearme.preferences';

export type StoredUserPreferences = {
  themeMode: ThemeMode;
  fuelNeeded: string;
  fuelEconomy: string;
  fuelType: string;
  selectedBrands: string[];
};

const DEFAULTS: StoredUserPreferences = {
  themeMode: 'light',
  fuelNeeded: '25',
  fuelEconomy: '10.0',
  fuelType: DEFAULT_FUEL_TYPE,
  selectedBrands: []
};

function coerceThemeMode(value: unknown): ThemeMode {
  return value === 'dark' || value === 'light' ? value : DEFAULTS.themeMode;
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

function mergeWithDefaults(raw: Partial<StoredUserPreferences> | null): StoredUserPreferences {
  if (!raw) return { ...DEFAULTS };
  return {
    themeMode: coerceThemeMode(raw.themeMode),
    fuelNeeded: typeof raw.fuelNeeded === 'string' && raw.fuelNeeded.length > 0 ? raw.fuelNeeded : DEFAULTS.fuelNeeded,
    fuelEconomy: typeof raw.fuelEconomy === 'string' && raw.fuelEconomy.length > 0 ? raw.fuelEconomy : DEFAULTS.fuelEconomy,
    fuelType: coerceFuelType(raw.fuelType),
    selectedBrands: coerceBrands(raw.selectedBrands)
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
    fuelNeeded:
      partial.fuelNeeded !== undefined && partial.fuelNeeded.length > 0 ? partial.fuelNeeded : current.fuelNeeded,
    fuelEconomy:
      partial.fuelEconomy !== undefined && partial.fuelEconomy.length > 0 ? partial.fuelEconomy : current.fuelEconomy,
    fuelType: partial.fuelType !== undefined ? coerceFuelType(partial.fuelType) : current.fuelType,
    selectedBrands: partial.selectedBrands !== undefined ? coerceBrands(partial.selectedBrands) : current.selectedBrands
  };
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
}

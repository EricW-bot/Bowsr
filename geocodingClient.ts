import type { Coordinates } from './Interface';
import { Platform } from 'react-native';
import {
  GOOGLE_MAPS_ANDROID_API_KEY,
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_IOS_API_KEY,
  GOOGLE_MAPS_WEB_API_KEY
} from './constants';
import { fetchWithTimeout } from './network';

export type AddressSuggestion = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

type GeocoderResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GeocoderResult[];
};

type NominatimResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
};

type PlacesApiNewAutocompleteSuggestion = {
  placePrediction?: {
    place?: string;
    placeId?: string;
    text?: {
      text?: string;
    };
  };
};

type PlacesApiNewAutocompleteResponse = {
  suggestions?: PlacesApiNewAutocompleteSuggestion[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type PlacesApiNewPlaceDetailsResponse = {
  id?: string;
  name?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  displayName?: {
    text?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const loggedGoogleDiagnostics = new Set<string>();

const logGoogleDiagnosticOnce = (tag: string, status?: string, errorMessage?: string): void => {
  const key = `${tag}:${status ?? 'unknown'}:${errorMessage ?? ''}`;
  if (loggedGoogleDiagnostics.has(key)) {
    return;
  }
  loggedGoogleDiagnostics.add(key);
  console.warn(`[geocoding] ${tag} status=${status ?? 'unknown'}${errorMessage ? ` (${errorMessage})` : ''}`);
};

export const buildGoogleMapsKeys = (platformOs: string): string[] => {
  const ordered =
    platformOs === 'web'
      ? [GOOGLE_MAPS_WEB_API_KEY, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_ANDROID_API_KEY, GOOGLE_MAPS_IOS_API_KEY]
      : platformOs === 'android'
        ? [GOOGLE_MAPS_ANDROID_API_KEY, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_WEB_API_KEY, GOOGLE_MAPS_IOS_API_KEY]
        : [GOOGLE_MAPS_IOS_API_KEY, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_WEB_API_KEY, GOOGLE_MAPS_ANDROID_API_KEY];
  return Array.from(new Set(ordered.map((value) => value.trim()).filter((value) => value.length > 0)));
};

const getGoogleMapsKeys = (): string[] => buildGoogleMapsKeys(Platform.OS);

const isRetryableGoogleStatus = (status?: string): boolean => {
  return status === 'REQUEST_DENIED' || status === 'OVER_DAILY_LIMIT' || status === 'INVALID_REQUEST';
};

const parseGeocodeResult = (result: GeocoderResult): AddressSuggestion | null => {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = (result.formatted_address ?? '').trim();
  const id = (result.place_id ?? label).trim();
  if (!id || !label) return null;
  return {
    id,
    label,
    coordinates: {
      latitude: lat as number,
      longitude: lng as number
    }
  };
};

const PLACES_AUTOCOMPLETE_FIELD_MASK = 'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text.text';
const PLACE_DETAILS_FIELD_MASK = 'id,name,formattedAddress,location,displayName.text';

async function readGoogleErrorPayload(response: Response): Promise<{ status?: string; message?: string }> {
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    return {
      status: body?.error?.status,
      message: body?.error?.message
    };
  } catch {
    return {};
  }
}

async function searchNativeGeocodeFallback(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || Platform.OS === 'web') {
    return [];
  }
  try {
    const Location = await import('expo-location');
    const nativeResults = await Location.geocodeAsync(trimmed);
    return (nativeResults ?? [])
      .slice(0, 5)
      .map((item, index) => {
        if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
          return null;
        }
        return {
          id: `native-geocode:${trimmed}:${index}`,
          label: trimmed,
          coordinates: {
            latitude: item.latitude,
            longitude: item.longitude
          }
        } as AddressSuggestion;
      })
      .filter((item): item is AddressSuggestion => item !== null);
  } catch {
    return [];
  }
}

async function searchNominatimFallback(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    countrycodes: 'au',
    addressdetails: '1',
    limit: '5'
  });
  const response = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    },
    8000
  );
  if (!response.ok) {
    throw new Error(`Nominatim search failed with status ${response.status}`);
  }
  const data = (await response.json()) as NominatimResult[];
  return (data ?? [])
    .map((item) => {
      const latitude = Number.parseFloat(String(item.lat ?? ''));
      const longitude = Number.parseFloat(String(item.lon ?? ''));
      const label = (item.display_name ?? '').trim();
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !label) {
        return null;
      }
      return {
        id: `nominatim:${String(item.place_id ?? label)}`,
        label,
        coordinates: { latitude, longitude }
      } as AddressSuggestion;
    })
    .filter((item): item is AddressSuggestion => item !== null);
}

async function searchGoogleGeocode(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const keys = getGoogleMapsKeys();
  if (keys.length === 0) {
    return searchNominatimFallback(trimmed);
  }
  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      const params = new URLSearchParams({
        address: trimmed,
        components: 'country:AU',
        key
      });
      const response = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
        { method: 'GET' },
        8000
      );
      if (!response.ok) {
        throw new Error(`Google geocode failed with status ${response.status}`);
      }

      const data = (await response.json()) as GoogleGeocodeResponse;
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        logGoogleDiagnosticOnce('google-geocode', data.status, data.error_message);
        if (isRetryableGoogleStatus(data.status)) {
          throw new Error(`Google geocode rejected key: ${data.status}`);
        }
        const errorDetails = data.error_message ? ` (${data.error_message})` : '';
        throw new Error(`Google geocode status ${data.status}${errorDetails}`);
      }
      const results = data.results ?? [];
      return results
        .map((result) => parseGeocodeResult(result))
        .filter((item): item is AddressSuggestion => item !== null);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Google geocode failed');
    }
  }
  throw lastError ?? new Error('Google geocode failed');
}

export async function resolveAddressByPlaceId(placeId: string): Promise<AddressSuggestion | null> {
  const trimmedId = placeId.trim();
  if (!trimmedId) {
    return null;
  }
  if (trimmedId.startsWith('nominatim:') || trimmedId.startsWith('native-geocode:')) {
    return null;
  }
  const keys = getGoogleMapsKeys();
  if (keys.length === 0) {
    return null;
  }
  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      const response = await fetchWithTimeout(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(trimmedId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK
          }
        },
        8000
      );
      if (!response.ok) {
        const err = await readGoogleErrorPayload(response);
        logGoogleDiagnosticOnce('google-place-details-new', err.status ?? String(response.status), err.message);
        throw new Error(`Google place details failed with status ${response.status}`);
      }

      const data = (await response.json()) as PlacesApiNewPlaceDetailsResponse;
      if (data.error?.status) {
        logGoogleDiagnosticOnce('google-place-details-new', data.error.status, data.error.message);
        throw new Error(`Google place details status ${data.error.status}`);
      }
      const latitude = data.location?.latitude;
      const longitude = data.location?.longitude;
      const label = (data.formattedAddress ?? data.displayName?.text ?? '').trim();
      if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        id: (data.id ?? trimmedId).trim(),
        label,
        coordinates: {
          latitude: latitude as number,
          longitude: longitude as number
        }
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Google place details failed');
    }
  }
  throw lastError ?? new Error('Google place details failed');
}

export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const keys = getGoogleMapsKeys();
  if (keys.length === 0) {
    return searchNominatimFallback(trimmed);
  }

  for (const key of keys) {
    try {
      const response = await fetchWithTimeout(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': PLACES_AUTOCOMPLETE_FIELD_MASK
          },
          body: JSON.stringify({
            input: trimmed,
            includedRegionCodes: ['au'],
            regionCode: 'au'
          })
        },
        8000
      );
      if (!response.ok) {
        const err = await readGoogleErrorPayload(response);
        logGoogleDiagnosticOnce('google-autocomplete-new', err.status ?? String(response.status), err.message);
        throw new Error(`Google places autocomplete failed with status ${response.status}`);
      }

      const data = (await response.json()) as PlacesApiNewAutocompleteResponse;
      if (data.error?.status) {
        logGoogleDiagnosticOnce('google-autocomplete-new', data.error.status, data.error.message);
        throw new Error(`Google autocomplete status ${data.error.status}`);
      }
      const suggestions = data.suggestions ?? [];
      const parsedPredictions = suggestions
        .map((suggestion) => {
          const prediction = suggestion.placePrediction;
          if (!prediction) return null;
          const label = (prediction.text?.text ?? '').trim();
          const id = (prediction.placeId ?? prediction.place ?? label).trim();
          if (!id || !label) return null;
          return {
            id,
            label,
            coordinates: { latitude: 0, longitude: 0 }
          } as AddressSuggestion;
        })
        .filter((item): item is AddressSuggestion => item !== null);

      if (parsedPredictions.length > 0) {
        return parsedPredictions.slice(0, 5);
      }
    } catch {
      // Try the next available key.
    }
  }

  // Fallback for environments where Places Autocomplete is unavailable/restricted.
  try {
    return (await searchGoogleGeocode(trimmed)).slice(0, 5);
  } catch (err) {
    // Any platform can hit key restriction/quotas; use a resilient fallback.
    try {
      const nominatimResults = await searchNominatimFallback(trimmed);
      if (nominatimResults.length > 0) {
        return nominatimResults;
      }
      const nativeResults = await searchNativeGeocodeFallback(trimmed);
      if (nativeResults.length > 0) {
        return nativeResults;
      }
    } catch {
      // Ignore; we'll throw the original Google error below.
    }
    throw err;
  }
}

export async function resolveAddress(query: string): Promise<AddressSuggestion | null> {
  let results: AddressSuggestion[] = [];
  try {
    results = await searchGoogleGeocode(query);
  } catch {
    // If Google is unavailable/restricted, try native geocoding first on device.
    const nativeResults = await searchNativeGeocodeFallback(query);
    if (nativeResults.length > 0) {
      results = nativeResults;
    } else {
      results = await searchNominatimFallback(query);
    }
  }
  return results[0] ?? null;
}

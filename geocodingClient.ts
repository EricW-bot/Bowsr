import type { Coordinates } from './Interface';
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

type GoogleAutocompletePrediction = {
  description?: string;
  place_id?: string;
};

type GoogleAutocompleteResponse = {
  status?: string;
  error_message?: string;
  predictions?: GoogleAutocompletePrediction[];
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GeocoderResult[];
};

type GooglePlaceDetailsResponse = {
  status?: string;
  error_message?: string;
  result?: GeocoderResult;
};

type NominatimResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
};

const GOOGLE_MAPS_KEYS = Array.from(
  new Set(
    [
      GOOGLE_MAPS_WEB_API_KEY,
      GOOGLE_MAPS_API_KEY,
      GOOGLE_MAPS_ANDROID_API_KEY,
      GOOGLE_MAPS_IOS_API_KEY
    ].filter((value) => value.trim().length > 0)
  )
);

const ensureGoogleMapsKey = (): string[] => {
  if (GOOGLE_MAPS_KEYS.length === 0) {
    throw new Error(
      'Google Maps API key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY for Places/Geocoding requests.'
    );
  }
  return GOOGLE_MAPS_KEYS;
};

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
  const keys = ensureGoogleMapsKey();
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
  const keys = ensureGoogleMapsKey();
  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      const params = new URLSearchParams({
        place_id: trimmedId,
        fields: 'formatted_address,geometry,place_id',
        key
      });
      const response = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
        { method: 'GET' },
        8000
      );
      if (!response.ok) {
        throw new Error(`Google place details failed with status ${response.status}`);
      }

      const data = (await response.json()) as GooglePlaceDetailsResponse;
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        if (isRetryableGoogleStatus(data.status)) {
          throw new Error(`Google place details rejected key: ${data.status}`);
        }
        const errorDetails = data.error_message ? ` (${data.error_message})` : '';
        throw new Error(`Google place details status ${data.status}${errorDetails}`);
      }

      return data.result ? parseGeocodeResult(data.result) : null;
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
  const keys = ensureGoogleMapsKey();

  for (const key of keys) {
    try {
      const params = new URLSearchParams({
        input: trimmed,
        components: 'country:au',
        types: 'address',
        key
      });
      const response = await fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
        { method: 'GET' },
        8000
      );
      if (!response.ok) {
        throw new Error(`Google places autocomplete failed with status ${response.status}`);
      }

      const data = (await response.json()) as GoogleAutocompleteResponse;
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        if (isRetryableGoogleStatus(data.status)) {
          throw new Error(`Google autocomplete rejected key: ${data.status}`);
        }
        const errorDetails = data.error_message ? ` (${data.error_message})` : '';
        throw new Error(`Google autocomplete status ${data.status}${errorDetails}`);
      }
      const predictions = data.predictions ?? [];
      const parsedPredictions = predictions
        .map((prediction) => {
          const label = (prediction.description ?? '').trim();
          const id = (prediction.place_id ?? label).trim();
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
      return await searchNominatimFallback(trimmed);
    } catch {
      // Ignore; we'll throw the original Google error below.
    }
    throw err;
  }
}

export async function resolveAddress(query: string): Promise<AddressSuggestion | null> {
  const results = await searchGoogleGeocode(query);
  return results[0] ?? null;
}

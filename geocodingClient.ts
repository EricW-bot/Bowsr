import type { Coordinates } from './Interface';
import { GOOGLE_MAPS_API_KEY } from './constants';
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

const ensureGoogleMapsKey = (): void => {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }
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

async function searchGoogleGeocode(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  ensureGoogleMapsKey();

  const params = new URLSearchParams({
    address: trimmed,
    components: 'country:AU',
    key: GOOGLE_MAPS_API_KEY
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
    const errorDetails = data.error_message ? ` (${data.error_message})` : '';
    throw new Error(`Google geocode status ${data.status}${errorDetails}`);
  }
  const results = data.results ?? [];
  return results
    .map((result) => parseGeocodeResult(result))
    .filter((item): item is AddressSuggestion => item !== null);
}

export async function resolveAddressByPlaceId(placeId: string): Promise<AddressSuggestion | null> {
  const trimmedId = placeId.trim();
  if (!trimmedId) {
    return null;
  }
  ensureGoogleMapsKey();

  const params = new URLSearchParams({
    place_id: trimmedId,
    fields: 'formatted_address,geometry,place_id',
    key: GOOGLE_MAPS_API_KEY
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
    const errorDetails = data.error_message ? ` (${data.error_message})` : '';
    throw new Error(`Google place details status ${data.status}${errorDetails}`);
  }

  return data.result ? parseGeocodeResult(data.result) : null;
}

export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  ensureGoogleMapsKey();

  const params = new URLSearchParams({
    input: trimmed,
    components: 'country:au',
    types: 'address',
    key: GOOGLE_MAPS_API_KEY
  });

  try {
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
    // Ignore and fall through to geocode fallback.
  }

  // Fallback for environments where Places Autocomplete is unavailable/restricted.
  return searchGoogleGeocode(trimmed).then((results) => results.slice(0, 5));
}

export async function resolveAddress(query: string): Promise<AddressSuggestion | null> {
  const results = await searchGoogleGeocode(query);
  return results[0] ?? null;
}

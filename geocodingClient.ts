import type { Coordinates } from './Interface';
import { GOOGLE_MAPS_API_KEY } from './constants';
import { fetchWithTimeout } from './network';

export type AddressSuggestion = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

type GoogleAutocompletePrediction = {
  description?: string;
  place_id?: string;
};

type GoogleAutocompleteResponse = {
  status?: string;
  predictions?: GoogleAutocompletePrediction[];
};

type GoogleGeocodeResult = {
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
  results?: GoogleGeocodeResult[];
};

const ensureGoogleMapsKey = (): void => {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }
};

const parseGeocodeResult = (result: GoogleGeocodeResult): AddressSuggestion | null => {
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
  if (trimmed.length < 3) {
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
  const results = data.results ?? [];
  return results
    .map((result) => parseGeocodeResult(result))
    .filter((item): item is AddressSuggestion => item !== null);
}

export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }
  ensureGoogleMapsKey();

  const params = new URLSearchParams({
    input: trimmed,
    components: 'country:au',
    types: 'address',
    key: GOOGLE_MAPS_API_KEY
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
  const predictions = data.predictions ?? [];
  return predictions
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
    .filter((item): item is AddressSuggestion => item !== null)
    .slice(0, 5);
}

export async function resolveAddress(query: string): Promise<AddressSuggestion | null> {
  const results = await searchGoogleGeocode(query);
  return results[0] ?? null;
}

/* eslint-disable import/first */
jest.mock('../constants', () => ({
  GOOGLE_MAPS_WEB_API_KEY: '',
  GOOGLE_MAPS_API_KEY: 'test-google-key',
  GOOGLE_MAPS_ANDROID_API_KEY: '',
  GOOGLE_MAPS_IOS_API_KEY: ''
}));

jest.mock('../clients/network', () => ({
  fetchWithTimeout: jest.fn()
}));

import { fetchWithTimeout } from '../clients/network';
import { fetchAddressSuggestions, resolveAddressByPlaceId } from '../clients/geocodingClient';

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const mockResponse = (payload: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => payload
  }) as Response;

describe('geocoding suggestions', () => {
  beforeEach(() => {
    mockedFetchWithTimeout.mockReset();
  });

  it('returns Google autocomplete suggestions when available', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      mockResponse({
        suggestions: [
          {
            placePrediction: {
              place: 'places/abc123',
              placeId: 'abc123',
              text: { text: '1 Test St, Sydney NSW, Australia' }
            }
          }
        ]
      })
    );

    const results = await fetchAddressSuggestions('1 test');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'abc123',
      label: '1 Test St, Sydney NSW, Australia'
    });

    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetchWithTimeout.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-google-key');
    expect((init?.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('suggestions.placePrediction');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      input: '1 test',
      includedRegionCodes: ['au'],
      regionCode: 'au'
    });
  });

  it('falls back to geocoding when autocomplete is denied', async () => {
    mockedFetchWithTimeout
      .mockResolvedValueOnce(mockResponse({ error: { status: 'REQUEST_DENIED' } }, false, 403))
      .mockResolvedValueOnce(
        mockResponse({
          status: 'OK',
          results: [
            {
              place_id: 'geo-1',
              formatted_address: '80 Croydon Rd, Croydon NSW 2132, Australia',
              geometry: { location: { lat: -33.88, lng: 151.12 } }
            }
          ]
        })
      );

    const results = await fetchAddressSuggestions('80 Croydon Road');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('geo-1');
    expect(results[0].coordinates.latitude).toBeCloseTo(-33.88, 5);
  });

  it('falls back to Nominatim when Google services fail', async () => {
    mockedFetchWithTimeout
      .mockResolvedValueOnce(mockResponse({ error: { status: 'REQUEST_DENIED' } }, false, 403))
      .mockResolvedValueOnce(mockResponse({ status: 'REQUEST_DENIED' }))
      .mockResolvedValueOnce(
        mockResponse([
          {
            place_id: 987,
            display_name: '10 High St, Penrith NSW 2750, Australia',
            lat: '-33.751',
            lon: '150.694'
          }
        ])
      );

    const results = await fetchAddressSuggestions('10 High St');
    expect(results).toHaveLength(1);
    expect(results[0].id).toContain('nominatim');
  });

  it('resolves place details successfully with Places API (New)', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      mockResponse({
        id: 'abc123',
        formattedAddress: '1 Test St, Sydney NSW, Australia',
        location: {
          latitude: -33.86,
          longitude: 151.2
        }
      })
    );

    const result = await resolveAddressByPlaceId('abc123');
    expect(result).toEqual({
      id: 'abc123',
      label: '1 Test St, Sydney NSW, Australia',
      coordinates: {
        latitude: -33.86,
        longitude: 151.2
      }
    });

    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetchWithTimeout.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/abc123');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-google-key');
    expect((init?.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('formattedAddress');
  });

  it('returns null early for non-Google place ids', async () => {
    const result = await resolveAddressByPlaceId('nominatim:123');
    expect(result).toBeNull();
    expect(mockedFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('falls back to geocode when autocomplete returns no suggestions', async () => {
    mockedFetchWithTimeout
      .mockResolvedValueOnce(mockResponse({ suggestions: [] }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 'OK',
          results: [
            {
              place_id: 'geo-empty-fallback',
              formatted_address: '2 Empty Suggestion Rd, Sydney NSW, Australia',
              geometry: { location: { lat: -33.9, lng: 151.3 } }
            }
          ]
        })
      );

    const results = await fetchAddressSuggestions('2 Empty');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('geo-empty-fallback');
    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('returns null when place details lacks location or label', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      mockResponse({
        id: 'abc123',
        formattedAddress: '1 Missing Coords St',
        location: {}
      })
    );

    const result = await resolveAddressByPlaceId('abc123');
    expect(result).toBeNull();
  });
});

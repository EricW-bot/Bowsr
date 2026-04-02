/* eslint-disable import/first */
jest.mock('../constants', () => ({
  GOOGLE_MAPS_API_KEY: 'test-google-key',
  GOOGLE_MAPS_ANDROID_API_KEY: '',
  GOOGLE_MAPS_IOS_API_KEY: ''
}));

jest.mock('../network', () => ({
  fetchWithTimeout: jest.fn()
}));

import { fetchWithTimeout } from '../network';
import { fetchAddressSuggestions } from '../geocodingClient';

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
        status: 'OK',
        predictions: [{ description: '1 Test St, Sydney NSW, Australia', place_id: 'abc123' }]
      })
    );

    const results = await fetchAddressSuggestions('1 test');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'abc123',
      label: '1 Test St, Sydney NSW, Australia'
    });
  });

  it('falls back to geocoding when autocomplete is denied', async () => {
    mockedFetchWithTimeout
      .mockResolvedValueOnce(mockResponse({ status: 'REQUEST_DENIED' }))
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
      .mockResolvedValueOnce(mockResponse({ status: 'REQUEST_DENIED' }))
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
});

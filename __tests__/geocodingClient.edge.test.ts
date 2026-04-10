/* eslint-disable @typescript-eslint/no-require-imports */

describe('geocoding edge behavior', () => {
  const mockResponse = (payload: unknown, ok = true, status = 200): Response =>
    ({
      ok,
      status,
      json: async () => payload
    }) as Response;

  it('uses Nominatim when no Google keys are configured', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest.fn().mockResolvedValueOnce(
      mockResponse([
        {
          place_id: 555,
          display_name: 'No Key Rd, Sydney NSW, Australia',
          lat: '-33.8',
          lon: '151.2'
        }
      ])
    );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' }
    }));
    jest.doMock('../constants', () => ({
      GOOGLE_MAPS_WEB_API_KEY: '',
      GOOGLE_MAPS_API_KEY: '',
      GOOGLE_MAPS_ANDROID_API_KEY: '',
      GOOGLE_MAPS_IOS_API_KEY: ''
    }));
    jest.doMock('../clients/network', () => ({
      fetchWithTimeout
    }));

    const { fetchAddressSuggestions } = require('../clients/geocodingClient') as typeof import('../clients/geocodingClient');
    const results = await fetchAddressSuggestions('No Key');
    expect(results).toHaveLength(1);
    expect(results[0].id).toContain('nominatim');
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('throws original Google error when both geocode and Nominatim fail', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest
      .fn()
      .mockResolvedValueOnce(mockResponse({ error: { status: 'REQUEST_DENIED' } }, false, 403))
      .mockResolvedValueOnce(mockResponse({ status: 'REQUEST_DENIED', error_message: 'Denied' }))
      .mockResolvedValueOnce(mockResponse({}, false, 503));

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' }
    }));
    jest.doMock('../constants', () => ({
      GOOGLE_MAPS_WEB_API_KEY: 'web-key',
      GOOGLE_MAPS_API_KEY: '',
      GOOGLE_MAPS_ANDROID_API_KEY: '',
      GOOGLE_MAPS_IOS_API_KEY: ''
    }));
    jest.doMock('../clients/network', () => ({
      fetchWithTimeout
    }));

    const { fetchAddressSuggestions } = require('../clients/geocodingClient') as typeof import('../clients/geocodingClient');
    await expect(fetchAddressSuggestions('Broken Path')).rejects.toThrow('Google geocode rejected key: REQUEST_DENIED');
  });
});

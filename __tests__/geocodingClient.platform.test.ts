/* eslint-disable @typescript-eslint/no-require-imports */
describe('geocoding platform behavior', () => {
  const mockResponse = (payload: unknown, ok = true, status = 200): Response =>
    ({
      ok,
      status,
      json: async () => payload
    }) as Response;

  it('uses Android key first and falls back to iOS key', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest
      .fn()
      .mockResolvedValueOnce(mockResponse({ error: { status: 'REQUEST_DENIED' } }, false, 403))
      .mockResolvedValueOnce(
        mockResponse({
          suggestions: [
            {
              placePrediction: {
                placeId: 'android-success',
                text: { text: '1 Android St, Sydney NSW, Australia' }
              }
            }
          ]
        })
      );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' }
    }));
    jest.doMock('../constants', () => ({
      GOOGLE_MAPS_WEB_API_KEY: '',
      GOOGLE_MAPS_API_KEY: '',
      GOOGLE_MAPS_ANDROID_API_KEY: 'android-key',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    }));
    jest.doMock('../clients/network', () => ({
      fetchWithTimeout
    }));

    const { fetchAddressSuggestions } = require('../clients/geocodingClient') as typeof import('../clients/geocodingClient');
    const results = await fetchAddressSuggestions('1 android');
    expect(results[0].id).toBe('android-success');

    const firstHeaders = fetchWithTimeout.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchWithTimeout.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders['X-Goog-Api-Key']).toBe('android-key');
    expect(secondHeaders['X-Goog-Api-Key']).toBe('ios-key');
  });

  it('uses iOS key first and falls back to Android key', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest
      .fn()
      .mockResolvedValueOnce(mockResponse({ error: { status: 'REQUEST_DENIED' } }, false, 403))
      .mockResolvedValueOnce(
        mockResponse({
          suggestions: [
            {
              placePrediction: {
                placeId: 'ios-success',
                text: { text: '1 iOS St, Sydney NSW, Australia' }
              }
            }
          ]
        })
      );

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' }
    }));
    jest.doMock('../constants', () => ({
      GOOGLE_MAPS_WEB_API_KEY: '',
      GOOGLE_MAPS_API_KEY: '',
      GOOGLE_MAPS_ANDROID_API_KEY: 'android-key',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    }));
    jest.doMock('../clients/network', () => ({
      fetchWithTimeout
    }));

    const { fetchAddressSuggestions } = require('../clients/geocodingClient') as typeof import('../clients/geocodingClient');
    const results = await fetchAddressSuggestions('1 ios');
    expect(results[0].id).toBe('ios-success');

    const firstHeaders = fetchWithTimeout.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchWithTimeout.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders['X-Goog-Api-Key']).toBe('ios-key');
    expect(secondHeaders['X-Goog-Api-Key']).toBe('android-key');
  });
});

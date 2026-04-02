/* eslint-disable @typescript-eslint/no-require-imports */

describe('routing client fallback behavior', () => {
  const mockResponse = (payload: unknown, ok = true, status = 200): Response =>
    ({
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }) as Response;

  it('marks session as estimated when web falls back', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest.fn().mockRejectedValue(new Error('network down'));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' }
    }));
    jest.doMock('../constants', () => ({
      AVG_CITY_SPEED_KMH: 50,
      OPENROUTESERVICE_API_KEY: 'ors-key'
    }));
    jest.doMock('../network', () => ({
      fetchWithTimeout
    }));

    const {
      beginRoutingSession,
      fetchRouteDistanceDuration,
      getRoutingSessionSource
    } = require('../routingClient') as typeof import('../routingClient');

    beginRoutingSession();
    const route = await fetchRouteDistanceDuration(
      { latitude: -33.86, longitude: 151.2 },
      { latitude: -33.9, longitude: 151.25 }
    );

    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.durationMin).toBeGreaterThan(0);
    expect(getRoutingSessionSource()).toBe('estimated');
  });

  it('uses ORS summary response when OSRM fails on native', async () => {
    jest.resetModules();
    const fetchWithTimeout = jest
      .fn()
      .mockRejectedValueOnce(new Error('osrm fail'))
      .mockResolvedValueOnce(
        mockResponse({
          routes: [
            {
              summary: {
                distance: 12000,
                duration: 900
              }
            }
          ]
        })
      );
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' }
    }));
    jest.doMock('../constants', () => ({
      AVG_CITY_SPEED_KMH: 50,
      OPENROUTESERVICE_API_KEY: 'ors-key'
    }));
    jest.doMock('../network', () => ({
      fetchWithTimeout
    }));

    const { fetchRouteDistanceDuration } = require('../routingClient') as typeof import('../routingClient');
    const route = await fetchRouteDistanceDuration(
      { latitude: -33.86, longitude: 151.2 },
      { latitude: -33.9, longitude: 151.25 }
    );
    expect(route.distanceKm).toBeCloseTo(12, 5);
    expect(route.durationMin).toBeCloseTo(15, 5);
  });

  it('provides minimum clamp for known distance metrics', async () => {
    const { routeMetricsFromKnownDistanceKm } = require('../routingClient') as typeof import('../routingClient');
    const metrics = routeMetricsFromKnownDistanceKm(0);
    expect(metrics.distanceKm).toBe(0.1);
    expect(metrics.durationMin).toBeGreaterThan(0);
  });
});

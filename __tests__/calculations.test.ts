import { computeTripNetCostDollars, keepFeasibleRankedStations, sanitizePositiveNumber } from '../calculations';

describe('calculations helpers', () => {
  it('sanitizes invalid or non-positive numbers to fallback', () => {
    expect(sanitizePositiveNumber('abc', 8)).toBe(8);
    expect(sanitizePositiveNumber('0', 8)).toBe(8);
    expect(sanitizePositiveNumber('-3', 8)).toBe(8);
    expect(sanitizePositiveNumber('12.5', 8)).toBe(12.5);
  });

  it('computes trip net cost using only extra detour fuel burn', () => {
    const total = computeTripNetCostDollars(200, 25, 10, 100, 120);
    // $2/L * (25L + (20km * 0.1L/km)) = $54
    expect(total).toBeCloseTo(54, 5);
  });

  it('filters out null stations safely', () => {
    const kept = keepFeasibleRankedStations([
      null,
      {
        code: 'A',
        name: 'Station A',
        location: { latitude: -33.8, longitude: 151.1 },
        priceCents: 189.9,
        distanceKm: 5,
        durationMin: 8,
        totalCostDollars: 51.2
      },
      null
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].code).toBe('A');
  });
});

describe('computeTripRankedStations candidate staging', () => {
  it('routes only the tighter shortlist and still returns top results', async () => {
    jest.resetModules();
    const fetchRouteDistanceDuration = jest.fn().mockResolvedValue({
      distanceKm: 100,
      durationMin: 120
    });
    const fetchRouteVia = jest.fn().mockResolvedValue({
      distanceKm: 110,
      durationMin: 130
    });

    jest.doMock('../routingClient', () => ({
      fetchRouteDistanceDuration,
      fetchRouteVia,
      planRouteDistanceDuration: jest.fn(),
      routeMetricsFromKnownDistanceKm: jest.fn()
    }));

    const { computeTripRankedStations } = require('../calculations') as typeof import('../calculations');
    const stations = Array.from({ length: 12 }, (_, index) => ({
      code: `S${index + 1}`,
      name: `Station ${index + 1}`,
      location: {
        latitude: -33.9,
        longitude: 151.2
      }
    }));
    const prices = stations.map((station, index) => ({
      stationcode: station.code,
      price: 170 + index
    }));

    const ranked = await computeTripRankedStations({
      data: { stations, prices },
      start: { latitude: -34.0, longitude: 151.0 },
      destination: { latitude: -33.8, longitude: 151.4 },
      neededStr: '50',
      economyStr: '8',
      maxCandidates: 10,
      corridorKm: Number.POSITIVE_INFINITY
    });

    expect(fetchRouteDistanceDuration).toHaveBeenCalledTimes(1);
    expect(fetchRouteVia).toHaveBeenCalledTimes(8);
    expect(ranked).toHaveLength(5);
    expect(ranked.map((item: { code: string }) => item.code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
  });
});

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

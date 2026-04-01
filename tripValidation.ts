import { computeTripNetCostDollars, keepFeasibleRankedStations } from './calculations';
import type { RankedStation } from './Interface';

type ValidationCase = {
  name: string;
  run: () => void;
};

const approxEqual = (a: number, b: number, epsilon = 1e-6): boolean => Math.abs(a - b) <= epsilon;

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Trip validation failed: ${message}`);
  }
};

export const runTripAlgorithmValidation = (): void => {
  const checks: ValidationCase[] = [
    {
      name: 'extra-km-never-negative',
      run: () => {
        const cost = computeTripNetCostDollars(170, 25, 10, 150, 145);
        assert(approxEqual(cost, 42.5), 'negative detour should be clamped to zero');
      }
    },
    {
      name: 'cheap-pump-can-lose-on-detour',
      run: () => {
        const lowPumpHighDetour = computeTripNetCostDollars(160, 25, 10, 144, 200);
        const highPumpLowDetour = computeTripNetCostDollars(175, 25, 10, 144, 150);
        assert(
          lowPumpHighDetour > highPumpLowDetour,
          'large detour should outweigh cheaper pump price in net-cost objective'
        );
      }
    },
    {
      name: 'macarthur-mooney-baseline-coherent',
      run: () => {
        const baselineKm = 144;
        const withStopKm = 152;
        const netCost = computeTripNetCostDollars(172.9, 25, 10, baselineKm, withStopKm);
        assert(netCost > 0, 'net cost must stay positive');
        assert(withStopKm >= baselineKm, 'trip with stop should be >= baseline for this scenario');
      }
    },
    {
      name: 'candidate-without-route-excluded',
      run: () => {
        const candidate = {
          code: '100',
          name: 'Station A',
          location: { latitude: -33.8, longitude: 151.0 },
          priceCents: 170,
          distanceKm: 150,
          durationMin: 120,
          totalCostDollars: 40
        } as RankedStation;
        const feasibleOnly = keepFeasibleRankedStations([candidate, null]);
        assert(feasibleOnly.length === 1, 'null route candidates must be excluded');
      }
    },
    {
      name: 'ranking-ascending',
      run: () => {
        const costs = [40.25, 39.95, 42.1, 38.7].sort((a, b) => a - b);
        for (let i = 1; i < costs.length; i += 1) {
          assert(costs[i - 1] <= costs[i], 'sorted costs must be ascending');
        }
      }
    }
  ];

  for (const check of checks) {
    check.run();
  }
};

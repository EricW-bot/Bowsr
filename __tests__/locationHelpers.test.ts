import * as Location from 'expo-location';
import { getCurrentLocationWithTimeout } from '../helpers/locationHelpers';

jest.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3
  },
  getCurrentPositionAsync: jest.fn()
}));

describe('locationHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns current location when provider resolves', async () => {
    const expected = {
      coords: {
        latitude: -33.86,
        longitude: 151.2
      }
    } as unknown as Location.LocationObject;
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce(expected);

    const result = await getCurrentLocationWithTimeout(500);
    expect(result).toBe(expected);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('times out when provider hangs', async () => {
    jest.useFakeTimers();
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(
      () => new Promise<Location.LocationObject>(() => undefined)
    );

    const pending = getCurrentLocationWithTimeout(10);
    jest.advanceTimersByTime(11);

    await expect(pending).rejects.toThrow('Location timed out');
  });
});

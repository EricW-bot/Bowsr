import * as Location from 'expo-location';
import { LOCATION_TIMEOUT_MS } from './appHelpers';

export async function getCurrentLocationWithTimeout(
  timeoutMs: number = LOCATION_TIMEOUT_MS,
  accuracy: Location.Accuracy = Location.Accuracy.Balanced
): Promise<Location.LocationObject> {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location timed out')), timeoutMs))
  ]);
}

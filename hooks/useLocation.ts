import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { getCurrentLocationWithTimeout } from '../helpers/locationHelpers';

type RefreshLocationResult = {
  success: boolean;
  errorMsg?: string;
  location: Location.LocationObject | null;
};

export function useLocation() {
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);

  const fetchLocation = useCallback(async (requirePermission: boolean): Promise<RefreshLocationResult> => {
    try {
      if (requirePermission) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return {
            success: false,
            errorMsg: 'Permission to access location was denied.',
            location: null
          };
        }
        const loc = await getCurrentLocationWithTimeout();
        setUserLocation(loc);
        return { success: true, location: loc };
      } else {
        // Soft fetch: only grab if permitted already, don't fail if not
        const permissions = await Location.getForegroundPermissionsAsync();
        if (permissions.status === 'granted') {
          const loc = await getCurrentLocationWithTimeout();
          if (loc) {
            setUserLocation(loc);
            return { success: true, location: loc };
          }
        }
        return { success: true, location: null };
      }
    } catch (err) {
      if (requirePermission) {
        return {
          success: false,
          errorMsg: 'Could not get current location. Try again or use start address.',
          location: null
        };
      }
      return { success: true, location: null }; // Soft fail in address mode
    }
  }, []);

  return {
    userLocation,
    setUserLocation,
    fetchLocation
  };
}

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  type LayoutChangeEvent,
  useColorScheme
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as SystemUI from 'expo-system-ui';
import { computeRankedStations, computeTripRankedStations } from './calculations';
import { beginRoutingSession } from './routingClient';
import {
  BRAND_OPTIONS,
  DEFAULT_FUEL_TYPE,
  DEFAULT_TRIP_DESTINATION,
  FUEL_TYPE_OPTIONS,
  NEARBY_RADIUS_KM,
  TRIP_SAMPLE_RADIUS_KM
} from './constants';
import { fetchNearbyFuelData, getAccessToken } from './clients/fuelApiClient';
import { fetchAddressSuggestions, resolveAddress, resolveAddressByPlaceId, type AddressSuggestion } from './clients/geocodingClient';
import type { AppMode, AppTab, Coordinates, FuelApiData, RankedStation, TabDefinition } from './Interface';
import { loadUserPreferences, saveUserPreferences } from './preferencesStorage';
import { createThemedStyles, getPalette } from './theme';
import { runTripAlgorithmValidation } from './tripValidation';
import { getErrorMessage, normalizeBrands, normalizeFuelType, sameOrderedStringArray } from './helpers/utils';
import {
  buildExternalMapUrl,
  buildWebMapEmbedUrl,
  buildWebOneWayMapEmbedUrl,
  getRoundTripStartMissingMessage,
  getTripAddressMissingMessage,
  LIVE_DATA_TIMEOUT_MS
} from './helpers/appHelpers';
import { getCurrentLocationWithTimeout } from './helpers/locationHelpers';
import { fetchOneWayRouteGeometry, fetchRoundTripRouteGeometry } from './helpers/routeGeometryHelpers';
import { FloatingBottomNav } from './components/FloatingBottomNav';
import { PricesTab } from './tabs/PricesTab';
import { SettingsTab } from './tabs/SettingsTab';

type ExpoMapMarker = {
  id: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  title?: string;
  snippet?: string;
};

type ExpoMapPolyline = {
  id: string;
  coordinates: {
    latitude: number;
    longitude: number;
  }[];
  color?: string;
  width?: number;
};

type SettingsSnapshot = {
  appMode: AppMode;
  useCurrentLocation: boolean;
  fuelNeeded: string;
  fuelEconomy: string;
  fuelType: string;
  selectedBrands: string[];
  tripStartAddress: string;
  tripDestinationAddress: string;
};

type SaveSettingsOptions = {
  switchToPrices?: boolean;
  silentValidation?: boolean;
};

/** One-shot text expansion typical of OS keyboard autocomplete or paste (not single-character typing). */
function isLikelyImeAddressCommit(prev: string, value: string): boolean {
  const trimmed = value.trim();
  const prevTrim = prev.trim();
  if (trimmed.length < 5 || prev === value) {
    return false;
  }
  if (value.length <= prev.length) {
    return false;
  }
  if (value.length - prev.length >= 4) {
    return true;
  }
  return prevTrim.length >= 2 && trimmed.startsWith(prevTrim) && trimmed.length - prevTrim.length >= 5;
}

export default function App() {
  const colorScheme = useColorScheme();
  const themeMode = colorScheme === 'dark' ? 'dark' : 'light';
  const [activeTab, setActiveTab] = useState<AppTab>('prices');
  const [headerContentHeight, setHeaderContentHeight] = useState(84);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('roundTrip');
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [rankedStations, setRankedStations] = useState<RankedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [fuelNeeded, setFuelNeeded] = useState('25');
  const [fuelEconomy, setFuelEconomy] = useState('10.0');
  const [fuelType, setFuelType] = useState(DEFAULT_FUEL_TYPE);
  const [appliedFuelType, setAppliedFuelType] = useState(DEFAULT_FUEL_TYPE);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [tripDestination, setTripDestination] = useState<Coordinates>(DEFAULT_TRIP_DESTINATION);
  const [tripStartAddress, setTripStartAddress] = useState('');
  const [tripDestinationAddress, setTripDestinationAddress] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<AddressSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const [mapStation, setMapStation] = useState<RankedStation | null>(null);
  const [expoMapsModule, setExpoMapsModule] = useState<typeof import('expo-maps') | null>(null);
  const [isStartInputFocused, setIsStartInputFocused] = useState(false);
  const [isDestinationInputFocused, setIsDestinationInputFocused] = useState(false);
  const [selectedStartAddress, setSelectedStartAddress] = useState<AddressSuggestion | null>(null);
  const [selectedDestinationAddress, setSelectedDestinationAddress] = useState<AddressSuggestion | null>(null);
  const [oneWayRouteGeometry, setOneWayRouteGeometry] = useState<Coordinates[] | null>(null);
  const [roundTripRouteGeometry, setRoundTripRouteGeometry] = useState<Coordinates[] | null>(null);
  const isMountedRef = useRef(true);
  const isSelectingSuggestionRef = useRef(false);
  const settingsSaveInFlightRef = useRef(false);
  const prevStartAddressForImeRef = useRef('');
  const prevDestinationAddressForImeRef = useRef('');
  const suppressStartSuggestionFetchRef = useRef(false);
  const suppressDestinationSuggestionFetchRef = useRef(false);
  const latestRankingRequestIdRef = useRef(0);
  const AppleMapsView = expoMapsModule?.AppleMaps?.View;
  const GoogleMapsView = expoMapsModule?.GoogleMaps?.View;

  const palette = useMemo(() => getPalette(themeMode), [themeMode]);
  const styles = useMemo(() => createThemedStyles(palette), [palette]);
  const isSettingsTabActive = activeTab === 'settings';
  const bottomNavInset = Platform.OS === 'ios' ? 8 : 6;
  const bottomNavHeight = 58 + bottomNavInset;
  const statusBarInset = Constants.statusBarHeight ?? 0;
  const headerTopOffset = statusBarInset;
  const topHeaderHeight = headerTopOffset + headerContentHeight + 20;
  const canUseLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.bg);
  }, [palette.bg]);

  useEffect(() => {
    if (__DEV__) {
      runTripAlgorithmValidation();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    let cancelled = false;
    void import('expo-maps')
      .then((mod) => {
        if (!cancelled) {
          setExpoMapsModule(mod);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExpoMapsModule(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processAndRank = useCallback(
    async (data: FuelApiData, userLat: number, userLon: number, neededStr: string, economyStr: string): Promise<number> => {
      const requestId = ++latestRankingRequestIdRef.current;
      const topStations = await computeRankedStations(data, userLat, userLon, neededStr, economyStr);

      if (!isMountedRef.current || requestId !== latestRankingRequestIdRef.current) {
        return -1;
      }

      if (topStations.length > 0) {
        setRankedStations(topStations);
      }
      setLoading(false);
      return topStations.length;
    },
    []
  );

  const fetchAndRankFuelData = useCallback(
    async (userLat: number, userLon: number, needed: string, economy: string, fuelTypeInput: string, brandsInput: string[]) => {
      const watchdog = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Live data timed out after ${LIVE_DATA_TIMEOUT_MS / 1000}s`));
        }, LIVE_DATA_TIMEOUT_MS);
      });

      const doWork = (async () => {
        beginRoutingSession();
        const requestFuelType = normalizeFuelType(fuelTypeInput);
        const requestBrands = normalizeBrands(brandsInput);

        const accessToken = await getAccessToken();

        const selectedData = await fetchNearbyFuelData(
          accessToken,
          requestBrands,
          userLat,
          userLon,
          NEARBY_RADIUS_KM,
          requestFuelType
        );

        if (!selectedData) {
          throw new Error('Nearby API returned no usable stations for the selected radius.');
        }

        setAppliedFuelType(requestFuelType);
        setErrorMsg(null);

        const rankedCount = await processAndRank(selectedData, userLat, userLon, needed, economy);
        if (rankedCount === -1) {
          return;
        }
        if (rankedCount === 0) {
          setLoading(false);
          setErrorMsg('No rankable stations were returned for that fuel type/radius. Existing results kept.');
          return;
        }
      })();

      try {
        await Promise.race([doWork, watchdog]);
      } catch (err) {
        const liveError = getErrorMessage(err, 'Live data request failed.');
        console.warn(`Live data failed: ${liveError}`);
        setLoading(false);
        setErrorMsg('Could not refresh live fuel prices right now. Please try again in a moment.');
      }
    },
    [processAndRank]
  );

  const midpointBetween = (start: Coordinates, end: Coordinates): Coordinates => ({
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2
  });

  const fetchTripCandidatePool = useCallback(
    async (
      accessToken: string,
      start: Coordinates,
      destination: Coordinates,
      fuelTypeInput: string,
      brandsInput: string[]
    ) => {
      const normalizedFuelType = normalizeFuelType(fuelTypeInput);
      const normalizedBrands = normalizeBrands(brandsInput);
      const samples: Coordinates[] = [start, midpointBetween(start, destination), destination];
      const responses = await Promise.allSettled(
        samples.map((sample) =>
          fetchNearbyFuelData(
            accessToken,
            normalizedBrands,
            sample.latitude,
            sample.longitude,
            TRIP_SAMPLE_RADIUS_KM,
            normalizedFuelType
          )
        )
      );

      const stationByCode = new Map<string, FuelApiData['stations'][number]>();
      const priceByCode = new Map<string, FuelApiData['prices'][number]>();

      for (const response of responses) {
        if (response.status !== 'fulfilled' || !response.value) continue;
        for (const station of response.value.stations) {
          if (!stationByCode.has(station.code)) {
            stationByCode.set(station.code, station);
          }
        }
        for (const price of response.value.prices) {
          const current = priceByCode.get(String(price.stationcode));
          if (!current || price.price < current.price) {
            priceByCode.set(String(price.stationcode), price);
          }
        }
      }

      if (stationByCode.size === 0) {
        // If all sampled calls failed or returned empty, do one broader fallback around start.
        const fallbackData = await fetchNearbyFuelData(
          accessToken,
          normalizedBrands,
          start.latitude,
          start.longitude,
          TRIP_SAMPLE_RADIUS_KM * 2,
          normalizedFuelType
        );
        if (fallbackData) {
          for (const station of fallbackData.stations) {
            if (!stationByCode.has(station.code)) {
              stationByCode.set(station.code, station);
            }
          }
          for (const price of fallbackData.prices) {
            const current = priceByCode.get(String(price.stationcode));
            if (!current || price.price < current.price) {
              priceByCode.set(String(price.stationcode), price);
            }
          }
        }
      }

      return {
        stations: Array.from(stationByCode.values()),
        prices: Array.from(priceByCode.values())
      } as FuelApiData;
    },
    []
  );

  const fetchAndRankTripData = useCallback(
    async (start: Coordinates, destination: Coordinates, needed: string, economy: string, fuelTypeInput: string, brandsInput: string[]) => {
      const watchdog = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Live data timed out after ${LIVE_DATA_TIMEOUT_MS / 1000}s`));
        }, LIVE_DATA_TIMEOUT_MS);
      });

      const doWork = (async () => {
        beginRoutingSession();
        const requestId = ++latestRankingRequestIdRef.current;
        const normalizedFuelType = normalizeFuelType(fuelTypeInput);
        const normalizedBrands = normalizeBrands(brandsInput);
        const accessToken = await getAccessToken();
        const tripData = await fetchTripCandidatePool(
          accessToken,
          start,
          destination,
          normalizedFuelType,
          normalizedBrands
        );
        if (tripData.stations.length === 0) {
          throw new Error('No stations returned for trip sampling. Please retry in a moment.');
        }
        const topStations = await computeTripRankedStations({
          data: tripData,
          start,
          destination,
          neededStr: needed,
          economyStr: economy
        });

        if (!isMountedRef.current || requestId !== latestRankingRequestIdRef.current) {
          return;
        }

        setAppliedFuelType(normalizedFuelType);
        setErrorMsg(null);
        if (topStations.length > 0) {
          setRankedStations(topStations);
          setLoading(false);
          return;
        }

        setLoading(false);
        setErrorMsg(
          'No feasible one-stop stations found for this trip. Live routing may be unavailable, so try again shortly or broaden brands/fuel type.'
        );
      })();

      try {
        await Promise.race([doWork, watchdog]);
      } catch (err) {
        const liveError = getErrorMessage(err, 'Trip mode request failed.');
        console.warn(`Trip mode failed: ${liveError}`);
        setLoading(false);
        setErrorMsg('Could not refresh live trip routing right now. Please try again shortly.');
      }
    },
    [fetchTripCandidatePool]
  );

  const fetchAndRankFuelDataRef = useRef(fetchAndRankFuelData);
  fetchAndRankFuelDataRef.current = fetchAndRankFuelData;
  const fetchAndRankTripDataRef = useRef(fetchAndRankTripData);
  fetchAndRankTripDataRef.current = fetchAndRankTripData;

  const applyStartFromSuggestion = useCallback((suggestion: AddressSuggestion, source: 'list' | 'inline', initialText?: string) => {
    const text = initialText ?? suggestion.label;
    if (source === 'list') {
      isSelectingSuggestionRef.current = true;
    }
    setTripStartAddress(text);
    setSelectedStartAddress(suggestion);
    let latestLabelForIme = text;
    void (async () => {
      try {
        const resolved = await resolveAddressByPlaceId(suggestion.id);
        if (resolved) {
          latestLabelForIme = resolved.label;
          setTripStartAddress(resolved.label);
          setSelectedStartAddress(resolved);
        }
      } catch {
        // Keep optimistic label; coordinates are validated on save.
      } finally {
        prevStartAddressForImeRef.current = latestLabelForIme;
        if (source === 'list') {
          isSelectingSuggestionRef.current = false;
        }
        setStartSuggestions([]);
        setSearchingStart(false);
        if (source === 'list') {
          setIsStartInputFocused(false);
          Keyboard.dismiss();
        }
      }
    })();
  }, []);

  const applyDestinationFromSuggestion = useCallback((suggestion: AddressSuggestion, source: 'list' | 'inline', initialText?: string) => {
    const text = initialText ?? suggestion.label;
    if (source === 'list') {
      isSelectingSuggestionRef.current = true;
    }
    setTripDestinationAddress(text);
    setSelectedDestinationAddress(suggestion);
    let latestLabelForIme = text;
    void (async () => {
      try {
        const resolved = await resolveAddressByPlaceId(suggestion.id);
        if (resolved) {
          latestLabelForIme = resolved.label;
          setTripDestinationAddress(resolved.label);
          setSelectedDestinationAddress(resolved);
        }
      } catch {
        // Keep optimistic label; coordinates are validated on save.
      } finally {
        prevDestinationAddressForImeRef.current = latestLabelForIme;
        if (source === 'list') {
          isSelectingSuggestionRef.current = false;
        }
        setDestinationSuggestions([]);
        setSearchingDestination(false);
        if (source === 'list') {
          setIsDestinationInputFocused(false);
          Keyboard.dismiss();
        }
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const shouldFetchStartSuggestions =
      isSettingsTabActive && !useCurrentLocation && (Platform.OS !== 'web' || isStartInputFocused);
    if (!shouldFetchStartSuggestions) {
      setStartSuggestions([]);
      setSearchingStart(false);
      return () => {
        cancelled = true;
      };
    }
    const q = tripStartAddress.trim();
    if (selectedStartAddress && selectedStartAddress.label.trim() === q) {
      setStartSuggestions([]);
      setSearchingStart(false);
      return () => {
        cancelled = true;
      };
    }
    if (suppressStartSuggestionFetchRef.current) {
      return () => {
        cancelled = true;
      };
    }
    if (q.length < 2) {
      setStartSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingStart(true);
        const results = await fetchAddressSuggestions(q);
        if (!cancelled) {
          setStartSuggestions(results);
        }
      } catch {
        if (!cancelled) {
          setStartSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingStart(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSettingsTabActive, useCurrentLocation, tripStartAddress, isStartInputFocused, selectedStartAddress]);

  useEffect(() => {
    let cancelled = false;
    const shouldFetchDestinationSuggestions =
      isSettingsTabActive && appMode === 'oneWay' && (Platform.OS !== 'web' || isDestinationInputFocused);
    if (!shouldFetchDestinationSuggestions) {
      setDestinationSuggestions([]);
      setSearchingDestination(false);
      return () => {
        cancelled = true;
      };
    }
    const q = tripDestinationAddress.trim();
    if (selectedDestinationAddress && selectedDestinationAddress.label.trim() === q) {
      setDestinationSuggestions([]);
      setSearchingDestination(false);
      return () => {
        cancelled = true;
      };
    }
    if (suppressDestinationSuggestionFetchRef.current) {
      return () => {
        cancelled = true;
      };
    }
    if (q.length < 2) {
      setDestinationSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingDestination(true);
        const results = await fetchAddressSuggestions(q);
        if (!cancelled) {
          setDestinationSuggestions(results);
        }
      } catch {
        if (!cancelled) {
          setDestinationSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingDestination(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isSettingsTabActive, appMode, tripDestinationAddress, isDestinationInputFocused, selectedDestinationAddress]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await loadUserPreferences();
        if (cancelled) return;

        const fuelTypeNorm = normalizeFuelType(prefs.fuelType);
        const brandsNorm = normalizeBrands(prefs.selectedBrands);

        setAppMode(prefs.appMode);
        setUseCurrentLocation(prefs.useCurrentLocation);
        setFuelNeeded(prefs.fuelNeeded);
        setFuelEconomy(prefs.fuelEconomy);
        setFuelType(fuelTypeNorm);
        setAppliedFuelType(fuelTypeNorm);
        setSelectedBrands(brandsNorm);
        setTripDestination(prefs.tripDestination);
        setTripStartAddress(prefs.tripStartAddress);
        setTripDestinationAddress(prefs.tripDestinationAddress);
        setSavedSettingsSnapshot({
          appMode: prefs.appMode,
          useCurrentLocation: prefs.useCurrentLocation,
          fuelNeeded: prefs.fuelNeeded.trim(),
          fuelEconomy: prefs.fuelEconomy.trim(),
          fuelType: fuelTypeNorm,
          selectedBrands: brandsNorm,
          tripStartAddress: prefs.tripStartAddress.trim(),
          tripDestinationAddress: prefs.tripDestinationAddress.trim()
        });
        prevStartAddressForImeRef.current = prefs.tripStartAddress;
        prevDestinationAddressForImeRef.current = prefs.tripDestinationAddress;
        setSelectedStartAddress(
          prefs.tripStartAddress.trim().length > 0
            ? {
                id: `saved-start-${prefs.tripStartAddress.trim().toLowerCase()}`,
                label: prefs.tripStartAddress.trim(),
                coordinates: prefs.tripStart
              }
            : null
        );
        setSelectedDestinationAddress(
          prefs.tripDestinationAddress.trim().length > 0
            ? {
                id: `saved-dest-${prefs.tripDestinationAddress.trim().toLowerCase()}`,
                label: prefs.tripDestinationAddress.trim(),
                coordinates: prefs.tripDestination
              }
            : null
        );

        let location: Location.LocationObject | null = null;
        if (prefs.useCurrentLocation) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status !== 'granted') {
            setErrorMsg('Permission to access location was denied');
            setLoading(false);
            return;
          }

          // Avoid an infinite spinner if GPS/permissions are slow or unavailable in TestFlight.
          location = await getCurrentLocationWithTimeout();
          if (cancelled) return;
          setUserLocation(location);
        } else {
          // Address mode should still try to show current-location pin on maps when permission
          // was already granted, but this must never block initialization.
          try {
            const permissions = await Location.getForegroundPermissionsAsync();
            if (!cancelled && permissions.status === 'granted') {
              location = await getCurrentLocationWithTimeout();
              if (!cancelled) {
                setUserLocation(location);
              }
            }
          } catch {
            // Ignore best-effort location failures in address mode.
          }
        }

        if (prefs.appMode === 'oneWay') {
          const missingMessage = getTripAddressMissingMessage(
            prefs.tripStartAddress,
            prefs.tripDestinationAddress,
            prefs.useCurrentLocation
          );
          if (missingMessage) {
            setErrorMsg(missingMessage);
            setLoading(false);
            return;
          }

          const oneWayStart = prefs.useCurrentLocation
            ? {
                latitude: location?.coords.latitude ?? 0,
                longitude: location?.coords.longitude ?? 0
              }
            : prefs.tripStart;

          await fetchAndRankTripDataRef.current(
            oneWayStart,
            prefs.tripDestination,
            prefs.fuelNeeded,
            prefs.fuelEconomy,
            fuelTypeNorm,
            brandsNorm
          );
        } else {
          const missingMessage = getRoundTripStartMissingMessage(prefs.tripStartAddress, prefs.useCurrentLocation);
          if (missingMessage) {
            setErrorMsg(missingMessage);
            setLoading(false);
            return;
          }

          const roundTripStart = prefs.useCurrentLocation
            ? {
                latitude: location?.coords.latitude ?? 0,
                longitude: location?.coords.longitude ?? 0
              }
            : prefs.tripStart;

          await fetchAndRankFuelDataRef.current(
            roundTripStart.latitude,
            roundTripStart.longitude,
            prefs.fuelNeeded,
            prefs.fuelEconomy,
            fuelTypeNorm,
            brandsNorm
          );
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(getErrorMessage(err, 'An error occurred while initializing.'));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSettings = async (options: SaveSettingsOptions = {}) => {
    const { switchToPrices = true, silentValidation = false } = options;
    if (settingsSaveInFlightRef.current) {
      return;
    }
    settingsSaveInFlightRef.current = true;

    const nextFuelType = normalizeFuelType(fuelType);
    const nextBrands = normalizeBrands(selectedBrands);
    setFuelType(nextFuelType);
    setSelectedBrands(nextBrands);

    const startAddress = tripStartAddress.trim();
    const destinationAddress = tripDestinationAddress.trim();

    const missingMessage =
      appMode === 'oneWay'
        ? getTripAddressMissingMessage(startAddress, destinationAddress, useCurrentLocation)
        : getRoundTripStartMissingMessage(startAddress, useCurrentLocation);
    if (missingMessage) {
      if (!silentValidation) {
        setErrorMsg(missingMessage);
        setLoading(false);
      }
      settingsSaveInFlightRef.current = false;
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    let resolvedUserLocation = userLocation;
    if (useCurrentLocation && !resolvedUserLocation) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!silentValidation) {
            setErrorMsg('Location permission is required when "Use my location" is enabled.');
            setLoading(false);
          }
          settingsSaveInFlightRef.current = false;
          return;
        }
        resolvedUserLocation = await getCurrentLocationWithTimeout();
        setUserLocation(resolvedUserLocation);
      } catch (err) {
        if (!silentValidation) {
          setErrorMsg(getErrorMessage(err, 'Could not get current location. Try again or use start address.'));
          setLoading(false);
        }
        settingsSaveInFlightRef.current = false;
        return;
      }
    }

    let nextTripStart = {
      latitude: resolvedUserLocation?.coords.latitude ?? 0,
      longitude: resolvedUserLocation?.coords.longitude ?? 0
    };
    let nextTripDestination = tripDestination;
    const hasResolvedCoords = (candidate: AddressSuggestion | null): boolean => {
      if (!candidate) return false;
      const { latitude, longitude } = candidate.coordinates;
      return Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
    };
    const ensureResolvedSelection = async (candidate: AddressSuggestion | null): Promise<AddressSuggestion | null> => {
      if (!candidate) return null;
      if (hasResolvedCoords(candidate)) {
        return candidate;
      }
      try {
        const byPlaceId = await resolveAddressByPlaceId(candidate.id);
        if (byPlaceId && hasResolvedCoords(byPlaceId)) {
          return byPlaceId;
        }
      } catch (err) {
        // Some Android keys are app-restricted and block Places Details requests.
        // Fall through to label-based geocoding so save/recalculate can still proceed.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Place details fallback triggered: ${message}`);
      }
      try {
        return await resolveAddress(candidate.label);
      } catch {
        return null;
      }
    };

    try {
      if (!useCurrentLocation) {
        const resolvedStart = await ensureResolvedSelection(
          selectedStartAddress && selectedStartAddress.label === startAddress ? selectedStartAddress : null
        );
        if (!resolvedStart) {
          if (!silentValidation) {
            setErrorMsg('Please click a Start Address suggestion, then pick a valid result.');
            setLoading(false);
          }
          settingsSaveInFlightRef.current = false;
          return;
        }
        setSelectedStartAddress(resolvedStart);
        nextTripStart = resolvedStart.coordinates;
      }

      if (appMode === 'oneWay') {
        const resolvedDestination = await ensureResolvedSelection(
          selectedDestinationAddress && selectedDestinationAddress.label === destinationAddress
            ? selectedDestinationAddress
            : null
        );
        if (!resolvedDestination) {
          if (!silentValidation) {
            setErrorMsg('Please click a Destination Address suggestion, then pick a valid result.');
            setLoading(false);
          }
          settingsSaveInFlightRef.current = false;
          return;
        }
        setSelectedDestinationAddress(resolvedDestination);
        nextTripDestination = resolvedDestination.coordinates;
      }

      await saveUserPreferences({
        appMode,
        useCurrentLocation,
        fuelNeeded,
        fuelEconomy,
        fuelType: nextFuelType,
        selectedBrands: nextBrands,
        tripDestination: nextTripDestination,
        tripStartAddress: startAddress,
        tripDestinationAddress: destinationAddress,
        tripStart: nextTripStart
      });
      setTripDestination(nextTripDestination);
      setSavedSettingsSnapshot({
        appMode,
        useCurrentLocation,
        fuelNeeded: fuelNeeded.trim(),
        fuelEconomy: fuelEconomy.trim(),
        fuelType: nextFuelType,
        selectedBrands: nextBrands,
        tripStartAddress: startAddress,
        tripDestinationAddress: destinationAddress
      });
    } catch (err) {
      if (!silentValidation) {
        setErrorMsg(getErrorMessage(err, 'Address validation failed. Please try again.'));
        setLoading(false);
      }
      settingsSaveInFlightRef.current = false;
      return;
    }
    if (switchToPrices) {
      setActiveTab('prices');
    }
    setIsStartInputFocused(false);
    setIsDestinationInputFocused(false);
    setStartSuggestions([]);
    setDestinationSuggestions([]);

    if (missingMessage) {
      settingsSaveInFlightRef.current = false;
      return;
    }

    if (appMode === 'oneWay') {
      fetchAndRankTripDataRef.current(
        nextTripStart,
        nextTripDestination,
        fuelNeeded,
        fuelEconomy,
        nextFuelType,
        nextBrands
      );
    } else {
      fetchAndRankFuelDataRef.current(
        nextTripStart.latitude,
        nextTripStart.longitude,
        fuelNeeded,
        fuelEconomy,
        nextFuelType,
        nextBrands
      );
    }
    settingsSaveInFlightRef.current = false;
  };
  const renderItem = ({ item, index }: { item: RankedStation; index: number }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => setMapStation(item)}>
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.stationInfo}>
          <Text style={styles.stationName}>{item.name}</Text>
          <Text style={styles.stationAddress}>{item.address || 'Address unavailable'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <View style={styles.statLabelRow}>
            <Ionicons name="pricetag-outline" size={12} color={palette.metaHint} />
            <Text style={styles.statLabel}>Pump Price</Text>
          </View>
          <Text style={styles.statValue}>{item.priceCents.toFixed(1)}¢</Text>
        </View>
        <View style={styles.statBox}>
          <View style={styles.statLabelRow}>
            <Ionicons name="navigate-outline" size={12} color={palette.metaHint} />
            <Text style={styles.statLabel}>{appMode === 'oneWay' ? 'Trip Route' : 'Route'}</Text>
          </View>
            <Text style={styles.statValue}>
              {appMode === 'oneWay'
                ? `${item.tripWithStopKm?.toFixed(1) ?? item.distanceKm.toFixed(1)} km`
                : `${item.distanceKm.toFixed(1)} km`}
              {appMode === 'oneWay' && item.detourKm !== undefined ? `\n(+${item.detourKm.toFixed(1)} detour)` : ''}
              {item.durationMin > 0 ? `\n(${Math.round(item.durationMin)} min)` : ''}
            </Text>
        </View>
        <View style={[styles.statBox, styles.highlightBox]}>
          <View style={styles.statLabelRow}>
            <Ionicons name="cash-outline" size={12} color={palette.metaHint} />
            <Text style={styles.statLabel}>Total Net Cost</Text>
          </View>
          <Text style={styles.costValue}>${item.totalCostDollars.toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const toggleBrandSelection = (brand: string) => {
    setSelectedBrands((prev) => {
      const next = prev.includes(brand) ? prev.filter((value) => value !== brand) : [...prev, brand];

      return BRAND_OPTIONS.filter((option) => next.includes(option));
    });
  };

  const startAddressSelected = !!(selectedStartAddress && selectedStartAddress.label === tripStartAddress.trim());
  const destinationAddressSelected = !!(
    selectedDestinationAddress && selectedDestinationAddress.label === tripDestinationAddress.trim()
  );

  const startStatusText = useCurrentLocation
    ? 'Using current location'
    : tripStartAddress.trim().length === 0
      ? 'Start address required'
      : startAddressSelected
        ? 'Start address selected'
        : 'Select a start suggestion';

  const destinationStatusText =
    appMode !== 'oneWay'
      ? null
      : tripDestinationAddress.trim().length === 0
        ? 'Destination address required'
        : destinationAddressSelected
          ? 'Destination address selected'
          : 'Select a destination suggestion';

  const openExternalMapForStation = useCallback((station: RankedStation) => {
    void Linking.openURL(buildExternalMapUrl(station));
  }, []);

  const renderMapExternalButton = useCallback(
    (label: string) => (
      <TouchableOpacity
        style={styles.mapOpenExternalButton}
        onPress={() => {
          if (mapStation) {
            openExternalMapForStation(mapStation);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {canUseLiquidGlass ? (
          <GlassView style={styles.mapOpenExternalButtonGlass} glassEffectStyle="regular">
            <Text style={[styles.mapOpenExternalButtonText, styles.mapOpenExternalButtonTextGlass]}>
              {label}
            </Text>
          </GlassView>
        ) : (
          <View style={styles.mapOpenExternalButtonFallback}>
            <Text style={styles.mapOpenExternalButtonText}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    ),
    [canUseLiquidGlass, mapStation, openExternalMapForStation, styles]
  );

  const stationMarker = useMemo<ExpoMapMarker | null>(() => {
    if (!mapStation) {
      return null;
    }
    return {
      id: 'station',
      coordinates: {
        latitude: mapStation.location.latitude,
        longitude: mapStation.location.longitude
      },
      title: mapStation.name,
      snippet: mapStation.address || 'Fuel station'
    };
  }, [mapStation]);

  const userMarker = useMemo<ExpoMapMarker | null>(() => {
    if (!userLocation) {
      return null;
    }
    return {
      id: 'user-location',
      coordinates: {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude
      },
      title: 'Your Location',
      snippet: 'Current position'
    };
  }, [userLocation]);

  const oneWayStartPoint = useMemo<Coordinates | null>(() => {
    if (appMode !== 'oneWay') {
      return null;
    }
    if (useCurrentLocation) {
      if (!userLocation) {
        return null;
      }
      return {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude
      };
    }
    return selectedStartAddress?.coordinates ?? null;
  }, [appMode, useCurrentLocation, userLocation, selectedStartAddress]);

  const destinationMarker = useMemo<ExpoMapMarker | null>(() => {
    if (appMode !== 'oneWay') {
      return null;
    }
    return {
      id: 'destination',
      coordinates: {
        latitude: tripDestination.latitude,
        longitude: tripDestination.longitude
      },
      title: 'Destination',
      snippet: tripDestinationAddress.trim() || 'Trip destination'
    };
  }, [appMode, tripDestination, tripDestinationAddress]);

  const roundTripStartPoint = useMemo<Coordinates | null>(() => {
    if (appMode !== 'roundTrip') {
      return null;
    }
    if (useCurrentLocation) {
      if (!userLocation) {
        return null;
      }
      return {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude
      };
    }
    return selectedStartAddress?.coordinates ?? null;
  }, [appMode, selectedStartAddress, useCurrentLocation, userLocation]);

  const roundTripStartMarker = useMemo<ExpoMapMarker | null>(() => {
    if (!roundTripStartPoint) {
      return null;
    }
    return {
      id: 'round-trip-start',
      coordinates: roundTripStartPoint,
      title: useCurrentLocation ? 'Start (GPS)' : 'Start',
      snippet: useCurrentLocation ? 'Current location' : tripStartAddress.trim() || 'Trip start'
    };
  }, [roundTripStartPoint, tripStartAddress, useCurrentLocation]);

  const startMarker = useMemo<ExpoMapMarker | null>(() => {
    if (!oneWayStartPoint) {
      return null;
    }
    return {
      id: 'trip-start',
      coordinates: oneWayStartPoint,
      title: useCurrentLocation ? 'Start (GPS)' : 'Start',
      snippet: useCurrentLocation ? 'Current location' : tripStartAddress.trim() || 'Trip start'
    };
  }, [oneWayStartPoint, useCurrentLocation, tripStartAddress]);

  useEffect(() => {
    let cancelled = false;
    const stationPoint = mapStation
      ? {
          latitude: mapStation.location.latitude,
          longitude: mapStation.location.longitude
        }
      : null;

    if (Platform.OS === 'web' || appMode !== 'oneWay' || !oneWayStartPoint || !stationPoint) {
      setOneWayRouteGeometry(null);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const geometry = await fetchOneWayRouteGeometry(oneWayStartPoint, stationPoint, tripDestination);
      if (!cancelled) {
        setOneWayRouteGeometry(geometry);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appMode, mapStation, oneWayStartPoint, tripDestination]);

  useEffect(() => {
    let cancelled = false;
    const stationPoint = mapStation
      ? {
          latitude: mapStation.location.latitude,
          longitude: mapStation.location.longitude
        }
      : null;

    if (Platform.OS === 'web' || appMode !== 'roundTrip' || !roundTripStartPoint || !stationPoint) {
      setRoundTripRouteGeometry(null);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const geometry = await fetchRoundTripRouteGeometry(roundTripStartPoint, stationPoint);
      if (!cancelled) {
        setRoundTripRouteGeometry(geometry);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appMode, mapStation, roundTripStartPoint]);

  const mapMarkers = useMemo<ExpoMapMarker[]>(
    () =>
      appMode === 'oneWay'
        ? [startMarker, stationMarker, destinationMarker].filter((marker): marker is ExpoMapMarker => marker !== null)
        : [roundTripStartMarker, stationMarker, userMarker].filter((marker): marker is ExpoMapMarker => marker !== null),
    [appMode, destinationMarker, roundTripStartMarker, startMarker, stationMarker, userMarker]
  );

  const mapPolylines = useMemo<ExpoMapPolyline[]>(
    () =>
      appMode === 'oneWay' && oneWayStartPoint && mapStation
        ? [
            {
              id: 'one-way-route',
              coordinates: [
                ...(oneWayRouteGeometry ?? [
                  oneWayStartPoint,
                  {
                    latitude: mapStation.location.latitude,
                    longitude: mapStation.location.longitude
                  },
                  {
                    latitude: tripDestination.latitude,
                    longitude: tripDestination.longitude
                  }
                ])
              ],
              color: palette.primary,
              width: 4
            }
          ]
        : appMode === 'roundTrip' && roundTripStartPoint && mapStation
          ? [
              {
                id: 'round-trip-route',
                coordinates: [
                  ...(roundTripRouteGeometry ?? [
                    roundTripStartPoint,
                    {
                      latitude: mapStation.location.latitude,
                      longitude: mapStation.location.longitude
                    },
                    roundTripStartPoint
                  ])
                ],
                color: palette.primary,
                width: 4
              }
            ]
        : [],
    [
      appMode,
      mapStation,
      oneWayRouteGeometry,
      oneWayStartPoint,
      palette.primary,
      roundTripRouteGeometry,
      roundTripStartPoint,
      tripDestination
    ]
  );

  const mapCameraPosition = useMemo(() => {
    if (!mapStation) {
      return {
        coordinates: { latitude: 0, longitude: 0 },
        zoom: 14
      };
    }

    if (appMode === 'oneWay' && oneWayStartPoint) {
      const latitudes = [oneWayStartPoint.latitude, mapStation.location.latitude, tripDestination.latitude];
      const longitudes = [oneWayStartPoint.longitude, mapStation.location.longitude, tripDestination.longitude];
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLon = Math.min(...longitudes);
      const maxLon = Math.max(...longitudes);
      const span = Math.max(maxLat - minLat, maxLon - minLon);
      const zoom =
        span > 1 ? 7 : span > 0.5 ? 8 : span > 0.2 ? 9 : span > 0.1 ? 10 : span > 0.05 ? 11 : span > 0.02 ? 12 : 13;

      return {
        coordinates: {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2
        },
        zoom
      };
    }

    if (appMode === 'roundTrip' && roundTripStartPoint) {
      const latitudes = [roundTripStartPoint.latitude, mapStation.location.latitude];
      const longitudes = [roundTripStartPoint.longitude, mapStation.location.longitude];
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLon = Math.min(...longitudes);
      const maxLon = Math.max(...longitudes);
      const span = Math.max(maxLat - minLat, maxLon - minLon);
      const zoom =
        span > 1 ? 7 : span > 0.5 ? 8 : span > 0.2 ? 9 : span > 0.1 ? 10 : span > 0.05 ? 11 : span > 0.02 ? 12 : 13;

      return {
        coordinates: {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2
        },
        zoom
      };
    }

    return {
      coordinates: {
        latitude: mapStation.location.latitude,
        longitude: mapStation.location.longitude
      },
      zoom: 14
    };
  }, [appMode, mapStation, oneWayStartPoint, roundTripStartPoint, tripDestination]);

  const bottomNavTabs: TabDefinition[] = [
    { key: 'prices' as const, label: 'Prices', icon: 'pricetag-outline' as const },
    { key: 'settings' as const, label: 'Settings', icon: 'settings-outline' as const }
  ];

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (Number.isFinite(nextHeight) && nextHeight > 0 && Math.abs(nextHeight - headerContentHeight) > 1) {
      setHeaderContentHeight(nextHeight);
    }
  }, [headerContentHeight]);

  const currentSettingsSnapshot = useMemo<SettingsSnapshot>(() => {
    return {
      appMode,
      useCurrentLocation,
      fuelNeeded: fuelNeeded.trim(),
      fuelEconomy: fuelEconomy.trim(),
      fuelType: normalizeFuelType(fuelType),
      selectedBrands: normalizeBrands(selectedBrands),
      tripStartAddress: tripStartAddress.trim(),
      tripDestinationAddress: tripDestinationAddress.trim()
    };
  }, [appMode, useCurrentLocation, fuelNeeded, fuelEconomy, fuelType, selectedBrands, tripStartAddress, tripDestinationAddress]);

  const hasPendingSettingsChanges = useMemo(() => {
    if (!savedSettingsSnapshot) return false;
    return !(
      savedSettingsSnapshot.appMode === currentSettingsSnapshot.appMode &&
      savedSettingsSnapshot.useCurrentLocation === currentSettingsSnapshot.useCurrentLocation &&
      savedSettingsSnapshot.fuelNeeded === currentSettingsSnapshot.fuelNeeded &&
      savedSettingsSnapshot.fuelEconomy === currentSettingsSnapshot.fuelEconomy &&
      savedSettingsSnapshot.fuelType === currentSettingsSnapshot.fuelType &&
      sameOrderedStringArray(savedSettingsSnapshot.selectedBrands, currentSettingsSnapshot.selectedBrands) &&
      savedSettingsSnapshot.tripStartAddress === currentSettingsSnapshot.tripStartAddress &&
      savedSettingsSnapshot.tripDestinationAddress === currentSettingsSnapshot.tripDestinationAddress
    );
  }, [savedSettingsSnapshot, currentSettingsSnapshot]);

  return (
    <SafeAreaProvider>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} backgroundColor="transparent" />
      <SafeAreaView style={styles.container} edges={['left', 'right']}>

        <Modal
          visible={!!mapStation}
          animationType="slide"
          transparent={true}
          presentationStyle="overFullScreen"
          onRequestClose={() => setMapStation(null)}
        >
          <View style={styles.mapModalOverlay}>
            <View style={styles.mapModalContent}>
              <View style={styles.mapModalHeader}>
                <View style={styles.mapModalTitleWrap}>
                  <Text style={styles.mapModalTitle}>{mapStation?.name ?? 'Station'}</Text>
                  <Text style={styles.mapModalSubtitle}>{mapStation?.address || 'Address unavailable'}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setMapStation(null)}
                  style={styles.mapModalCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close map"
                >
                  <Ionicons name="close" size={20} color={palette.modalTitle} />
                </TouchableOpacity>
              </View>
              {mapStation && Platform.OS === 'web' ? (
                <View style={styles.mapWebWrap}>
                  {React.createElement('iframe', {
                    title: `map-${mapStation.code}`,
                    src:
                      appMode === 'oneWay' && oneWayStartPoint
                        ? buildWebOneWayMapEmbedUrl(
                            oneWayStartPoint,
                            {
                              latitude: mapStation.location.latitude,
                              longitude: mapStation.location.longitude
                            },
                            tripDestination
                          )
                        : buildWebMapEmbedUrl(mapStation.location.latitude, mapStation.location.longitude, userLocation?.coords),
                    style: {
                      width: '100%',
                      height: '100%',
                      border: 0
                    },
                    loading: 'lazy'
                  })}
                  {renderMapExternalButton('Open in Google Maps')}
                </View>
              ) : mapStation && Platform.OS === 'ios' && AppleMapsView ? (
                <View style={styles.mapWebWrap}>
                  <AppleMapsView
                    style={styles.mapView}
                    cameraPosition={mapCameraPosition}
                    markers={mapMarkers}
                    polylines={mapPolylines}
                  />
                  {renderMapExternalButton('Open in Apple Maps')}
                </View>
              ) : mapStation && Platform.OS === 'android' && GoogleMapsView ? (
                <View style={styles.mapWebWrap}>
                  <GoogleMapsView
                    style={styles.mapView}
                    cameraPosition={mapCameraPosition}
                    markers={mapMarkers}
                    polylines={mapPolylines}
                  />
                  {renderMapExternalButton('Open in Google Maps')}
                </View>
              ) : (
                <View style={styles.mapUnavailableBox}>
                  <Ionicons name="map-outline" size={24} color={palette.metaHint} />
                  <Text style={styles.mapUnavailableText}>Map preview is available on iOS and Android builds.</Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {activeTab === 'prices' ? (
          errorMsg ? (
            <View style={[styles.centerBox, { paddingTop: topHeaderHeight }]}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : loading ? (
            <View style={[styles.centerBox, { paddingTop: topHeaderHeight }]}>
              <ActivityIndicator size="large" color={palette.primaryMuted} />
              <Text style={styles.loadingText}>Calculating optimal routes...</Text>
            </View>
          ) : (
            <PricesTab style={[styles.listContainer, { paddingTop: topHeaderHeight, paddingBottom: 0 }]}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.resultsListContent,
                  rankedStations.length === 0 && styles.resultsListContentEmpty,
                  { paddingBottom: bottomNavHeight + 8 }
                ]}
              >
                {rankedStations.length === 0 ? (
                  <Text style={styles.emptyText}>No stations available right now. Try recalculating.</Text>
                ) : (
                  rankedStations.map((item, index) => (
                    <React.Fragment key={`${item.code}-${index}`}>{renderItem({ item, index })}</React.Fragment>
                  ))
                )}
              </ScrollView>
            </PricesTab>
          )
        ) : (
          <SettingsTab style={[styles.settingsPageWrap, { paddingTop: topHeaderHeight }]}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
              style={styles.settingsPageWrap}
            >
              <ScrollView
                style={styles.settingsPageScroll}
                contentContainerStyle={[styles.settingsPageContent, { paddingBottom: bottomNavHeight + 8 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                nestedScrollEnabled
              >
              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <Ionicons name="map-outline" size={16} color={palette.title} />
                  <Text style={styles.settingsSectionTitle}>Trip Mode</Text>
                </View>
                <Text style={styles.inputLabel}>Mode</Text>
                <View style={styles.modeCardRow}>
                  {(['roundTrip', 'oneWay'] as AppMode[]).map((modeOption) => {
                    const selected = appMode === modeOption;
                    return (
                      <TouchableOpacity
                        key={modeOption}
                        style={[styles.modeCard, selected && styles.modeCardSelected]}
                        onPress={() => setAppMode(modeOption)}
                      >
                        <Ionicons
                          name={modeOption === 'roundTrip' ? 'repeat-outline' : 'navigate-outline'}
                          size={18}
                          color={selected ? palette.chipTextSelected : palette.chipText}
                        />
                        <Text style={[styles.modeCardTitle, selected && styles.fuelTypeChipTextSelected]}>
                          {modeOption === 'roundTrip' ? 'Round-trip' : 'One-way'}
                        </Text>
                        <Text style={[styles.modeCardHint, selected && styles.fuelTypeChipTextSelected]}>
                          {modeOption === 'roundTrip' ? 'Nearby station ranking' : 'Route-aware stop planning'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>Start Point Source</Text>
                <View style={styles.sourceToggleRow}>
                  {[true, false].map((option) => {
                    const selected = useCurrentLocation === option;
                    return (
                      <TouchableOpacity
                        key={option ? 'use-location' : 'use-addresses'}
                        style={[styles.sourceToggleButton, selected && styles.sourceToggleButtonSelected]}
                        onPress={() => setUseCurrentLocation(option)}
                      >
                        <Text style={[styles.sourceToggleText, selected && styles.sourceToggleTextSelected]}>
                          {option ? 'Use my location' : 'Use start address'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {!useCurrentLocation ? (
                <View style={styles.settingsSection}>
                  <View style={styles.settingsSectionHeader}>
                    <Ionicons name="pin-outline" size={16} color={palette.title} />
                    <Text style={styles.settingsSectionTitle}>Start Address</Text>
                  </View>
                  <Text style={styles.inputLabel}>Start Address</Text>
                  <TextInput
                    style={styles.input}
                    value={tripStartAddress}
                    onChangeText={(value) => {
                      const prev = prevStartAddressForImeRef.current;
                      prevStartAddressForImeRef.current = value;
                      const trimmed = value.trim();

                      const exact = startSuggestions.find((s) => s.label.trim() === trimmed);
                      if (exact) {
                        applyStartFromSuggestion(exact, 'inline', value);
                        return;
                      }

                      if (isLikelyImeAddressCommit(prev, value)) {
                        suppressStartSuggestionFetchRef.current = true;
                        setTripStartAddress(value);
                        setSelectedStartAddress(null);
                        setStartSuggestions([]);
                        setSearchingStart(true);
                        void (async () => {
                          try {
                            const resolved = await resolveAddress(trimmed);
                            if (resolved) {
                              setTripStartAddress(resolved.label);
                              setSelectedStartAddress(resolved);
                              prevStartAddressForImeRef.current = resolved.label;
                            }
                          } catch {
                            // Leave text; user can pick from the list after the next fetch.
                          } finally {
                            setSearchingStart(false);
                            suppressStartSuggestionFetchRef.current = false;
                          }
                        })();
                        return;
                      }

                      setTripStartAddress(value);
                      setSelectedStartAddress(null);
                    }}
                    onFocus={() => setIsStartInputFocused(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        if (isSelectingSuggestionRef.current) {
                          return;
                        }
                        setIsStartInputFocused(false);
                      }, Platform.OS === 'web' ? 220 : 120);
                    }}
                    placeholder="Enter start address"
                    placeholderTextColor={palette.placeholder}
                  />
                  {searchingStart ? <Text style={styles.metaHint}>Searching addresses...</Text> : null}
                  <View style={[styles.addressStatusPill, startAddressSelected && styles.addressStatusPillOk]}>
                    <Text style={[styles.addressStatusText, startAddressSelected && styles.addressStatusTextOk]}>{startStatusText}</Text>
                  </View>
                  {startSuggestions.length > 0 && (Platform.OS !== 'web' || isStartInputFocused) ? (
                    <View style={styles.suggestionsList}>
                      {startSuggestions.map((suggestion) => (
                        <TouchableOpacity
                          key={`start-${suggestion.id}`}
                          style={styles.suggestionItem}
                          onPressIn={() => {
                            isSelectingSuggestionRef.current = true;
                          }}
                          onPress={() => {
                            applyStartFromSuggestion(suggestion, 'list');
                          }}
                        >
                          <Text style={styles.suggestionText}>{suggestion.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {appMode === 'oneWay' ? (
                <View style={styles.settingsSection}>
                  <View style={styles.settingsSectionHeader}>
                    <Ionicons name="flag-outline" size={16} color={palette.title} />
                    <Text style={styles.settingsSectionTitle}>Destination</Text>
                  </View>
                  <Text style={styles.inputLabel}>Destination Address</Text>
                  <TextInput
                    style={styles.input}
                    value={tripDestinationAddress}
                    onChangeText={(value) => {
                      const prev = prevDestinationAddressForImeRef.current;
                      prevDestinationAddressForImeRef.current = value;
                      const trimmed = value.trim();

                      const exact = destinationSuggestions.find((s) => s.label.trim() === trimmed);
                      if (exact) {
                        applyDestinationFromSuggestion(exact, 'inline', value);
                        return;
                      }

                      if (isLikelyImeAddressCommit(prev, value)) {
                        suppressDestinationSuggestionFetchRef.current = true;
                        setTripDestinationAddress(value);
                        setSelectedDestinationAddress(null);
                        setDestinationSuggestions([]);
                        setSearchingDestination(true);
                        void (async () => {
                          try {
                            const resolved = await resolveAddress(trimmed);
                            if (resolved) {
                              setTripDestinationAddress(resolved.label);
                              setSelectedDestinationAddress(resolved);
                              prevDestinationAddressForImeRef.current = resolved.label;
                            }
                          } catch {
                            // Leave text; user can pick from the list after the next fetch.
                          } finally {
                            setSearchingDestination(false);
                            suppressDestinationSuggestionFetchRef.current = false;
                          }
                        })();
                        return;
                      }

                      setTripDestinationAddress(value);
                      setSelectedDestinationAddress(null);
                    }}
                    onFocus={() => setIsDestinationInputFocused(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        if (isSelectingSuggestionRef.current) {
                          return;
                        }
                        setIsDestinationInputFocused(false);
                      }, Platform.OS === 'web' ? 220 : 120);
                    }}
                    placeholder="Enter destination address"
                    placeholderTextColor={palette.placeholder}
                  />
                  {searchingDestination ? <Text style={styles.metaHint}>Searching addresses...</Text> : null}
                  {destinationStatusText ? (
                    <View style={[styles.addressStatusPill, destinationAddressSelected && styles.addressStatusPillOk]}>
                      <Text style={[styles.addressStatusText, destinationAddressSelected && styles.addressStatusTextOk]}>
                        {destinationStatusText}
                      </Text>
                    </View>
                  ) : null}
                  {destinationSuggestions.length > 0 && (Platform.OS !== 'web' || isDestinationInputFocused) ? (
                    <View style={styles.suggestionsList}>
                      {destinationSuggestions.map((suggestion) => (
                        <TouchableOpacity
                          key={`dest-${suggestion.id}`}
                          style={styles.suggestionItem}
                          onPressIn={() => {
                            isSelectingSuggestionRef.current = true;
                          }}
                          onPress={() => {
                            applyDestinationFromSuggestion(suggestion, 'list');
                          }}
                        >
                          <Text style={styles.suggestionText}>{suggestion.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.settingsSection}>
                <View style={styles.settingsSectionHeader}>
                  <Ionicons name="car-sport-outline" size={16} color={palette.title} />
                  <Text style={styles.settingsSectionTitle}>Vehicle & Fuel</Text>
                </View>
                <View style={styles.inlineInputsRow}>
                  <View style={styles.inlineInputCol}>
                    <Text style={[styles.inputLabel, styles.inlineInputLabel]}>Fuel Needed (Litres)</Text>
                    <TextInput
                      style={styles.inlineInput}
                      keyboardType="numeric"
                      value={fuelNeeded}
                      onChangeText={setFuelNeeded}
                      placeholder="e.g. 50"
                      placeholderTextColor={palette.placeholder}
                    />
                  </View>
                  <View style={styles.inlineInputCol}>
                    <Text style={[styles.inputLabel, styles.inlineInputLabel]}>Fuel Economy (L/100km)</Text>
                    <TextInput
                      style={styles.inlineInput}
                      keyboardType="numeric"
                      value={fuelEconomy}
                      onChangeText={setFuelEconomy}
                      placeholder="e.g. 8.0"
                      placeholderTextColor={palette.placeholder}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Fuel Type</Text>
                <View style={styles.fuelTypeRow}>
                  {FUEL_TYPE_OPTIONS.map((option) => {
                    const selected = fuelType === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.fuelTypeChip, selected && styles.fuelTypeChipSelected]}
                        onPress={() => setFuelType(option)}
                      >
                        <Text style={[styles.fuelTypeChipText, selected && styles.fuelTypeChipTextSelected]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>Brands (Optional)</Text>
                <View style={styles.fuelTypeRow}>
                  {BRAND_OPTIONS.map((option) => {
                    const selected = selectedBrands.includes(option);
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.fuelTypeChip, selected && styles.fuelTypeChipSelected]}
                        onPress={() => toggleBrandSelection(option)}
                      >
                        <Text style={[styles.fuelTypeChipText, selected && styles.fuelTypeChipTextSelected]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              </ScrollView>
            </KeyboardAvoidingView>
          </SettingsTab>
        )}

        <View pointerEvents="box-none" style={[styles.headerOverlayContainer, { top: headerTopOffset }]}>
          <View style={styles.headerPlainContent} onLayout={handleHeaderLayout}>
            {activeTab === 'prices' ? (
              <>
                <Text style={styles.title}>OnlyFuel</Text>
                <Text style={styles.subtitle}>{appMode === 'oneWay' ? 'One-way one-stop planner' : 'Round-trip nearby ranking'}</Text>
                <View style={styles.summarySingleRow}>
                  {canUseLiquidGlass ? (
                    <>
                      <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                        <Text style={styles.summaryChipText}>{fuelNeeded}L</Text>
                      </GlassView>
                      <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                        <Text style={styles.summaryChipText}>{appliedFuelType}</Text>
                      </GlassView>
                      <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                        <Text style={styles.summaryChipText}>{appMode === 'oneWay' ? 'One-way' : 'Round-trip'}</Text>
                      </GlassView>
                    </>
                  ) : (
                    <>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryChipText}>{fuelNeeded}L</Text>
                      </View>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryChipText}>{appliedFuelType}</Text>
                      </View>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryChipText}>{appMode === 'oneWay' ? 'One-way' : 'Round-trip'}</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={styles.settingsHeaderRow}>
                  <View style={styles.settingsHeaderTextWrap}>
                    <Text style={styles.title}>Preferences</Text>
                    <Text style={styles.subtitle}>Scroll to see all options.</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Save settings"
                    onPress={() => {
                      if (hasPendingSettingsChanges) {
                        void handleSaveSettings();
                      } else {
                        setActiveTab('prices');
                      }
                    }}
                    disabled={loading}
                    style={styles.headerSaveButton}
                  >
                    {canUseLiquidGlass ? (
                      <GlassView style={styles.headerSaveGlass} glassEffectStyle={loading ? 'clear' : 'regular'}>
                        <Text style={[styles.headerSaveButtonText, loading ? styles.headerSaveButtonTextDisabled : styles.headerSaveButtonTextEnabled]}>
                          Save
                        </Text>
                      </GlassView>
                    ) : (
                      <View style={[styles.headerSaveButtonFallback, loading ? styles.headerSaveButtonDisabled : styles.headerSaveButtonEnabled]}>
                        <Text style={[styles.headerSaveButtonText, loading ? styles.headerSaveButtonTextDisabled : styles.headerSaveButtonTextEnabled]}>
                          Save
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        <FloatingBottomNav
          tabs={bottomNavTabs}
          activeTab={activeTab}
          onTabPress={setActiveTab}
          canUseLiquidGlass={canUseLiquidGlass}
          bottomInset={bottomNavInset}
          selectedColor={palette.primary}
          unselectedColor={palette.metaHint}
          styles={styles}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

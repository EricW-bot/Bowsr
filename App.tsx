import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Linking,
  Platform,
  type LayoutChangeEvent,
  useColorScheme
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemedGlassView, canUseLiquidGlass } from './components/ThemedGlassView';
import { GlassView } from 'expo-glass-effect';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
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
import type {
  AppMode,
  AppTab,
  Coordinates,
  ExpoMapMarker,
  ExpoMapPolyline,
  FuelApiData,
  RankedStation,
  SettingsSnapshot,
  SettingsSnapshotInput,
  TabDefinition
} from './Interface';
import { loadUserPreferences, saveUserPreferences } from './preferencesStorage';
import { createThemedStyles, getPalette } from './theme';
import { runTripAlgorithmValidation } from './tripValidation';
import { getErrorMessage, normalizeBrands, normalizeFuelType, sameOrderedStringArray } from './helpers/utils';
import {
  buildExternalMapUrl,
  getRoundTripStartMissingMessage,
  getTripAddressMissingMessage,
  LIVE_DATA_TIMEOUT_MS
} from './helpers/appHelpers';
import { getCurrentLocationWithTimeout } from './helpers/locationHelpers';
import { fetchOneWayRouteGeometry, fetchRoundTripRouteGeometry } from './helpers/routeGeometryHelpers';
import { FloatingBottomNav } from './components/FloatingBottomNav';
import { SettingsHeader } from './components/SettingsHeader';
import { MapStationModal } from './components/MapStationModal';
import { AddressSuggestionInput } from './components/AddressSuggestionInput';
import { RoundedNumericInput } from './components/RoundedNumericInput';
import { PricesTab } from './tabs/PricesTab';
import { SettingsTab } from './tabs/SettingsTab';

import { roundToTwoDecimalPlaces } from './helpers/numberFormatting';
import { useAddressPicker } from './hooks/useAddressPicker';
import { useLocation } from './hooks/useLocation';

type AppProps = {
  initialTab?: AppTab;
  hideBottomNav?: boolean;
  onNavigateToTab?: (tab: AppTab) => void;
  onSettingsSaved?: () => void;
};

function createSettingsSnapshot(input: SettingsSnapshotInput): SettingsSnapshot {
  return {
    appMode: input.appMode,
    useCurrentLocation: input.useCurrentLocation,
    fuelNeeded: input.fuelNeeded.trim(),
    fuelEconomy: input.fuelEconomy.trim(),
    fuelType: normalizeFuelType(input.fuelType),
    selectedBrands: normalizeBrands(input.selectedBrands),
    tripStartAddress: input.tripStartAddress.trim(),
    tripDestinationAddress: input.tripDestinationAddress.trim()
  };
}

function hasSettingsSnapshotChanges(saved: SettingsSnapshot | null, current: SettingsSnapshot): boolean {
  if (!saved) return false;
  return !(
    saved.appMode === current.appMode &&
    saved.useCurrentLocation === current.useCurrentLocation &&
    saved.fuelNeeded === current.fuelNeeded &&
    saved.fuelEconomy === current.fuelEconomy &&
    saved.fuelType === current.fuelType &&
    sameOrderedStringArray(saved.selectedBrands, current.selectedBrands) &&
    saved.tripStartAddress === current.tripStartAddress &&
    saved.tripDestinationAddress === current.tripDestinationAddress
  );
}

export default function App({ initialTab = 'prices', hideBottomNav = false, onNavigateToTab, onSettingsSaved }: AppProps) {
  return (
    <SafeAreaProvider>
      <AppContent
        initialTab={initialTab}
        hideBottomNav={hideBottomNav}
        onNavigateToTab={onNavigateToTab}
        onSettingsSaved={onSettingsSaved}
      />
    </SafeAreaProvider>
  );
}

function AppContent({ initialTab = 'prices', hideBottomNav = false, onNavigateToTab, onSettingsSaved }: AppProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const themeMode = colorScheme === 'dark' ? 'dark' : 'light';
  const [activeTabState, setActiveTabState] = useState<AppTab>(initialTab);
  // In NativeTabs mode, each route renders its own screen (and this app instance never needs to swap tiles).
  // Keep `activeTab` derived to avoid redundant internal state updates.
  const activeTab: AppTab = hideBottomNav ? initialTab : activeTabState;
  const [headerContentHeights, setHeaderContentHeights] = useState<Record<AppTab, number>>({
    prices: 84,
    settings: 84
  });
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('roundTrip');
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [rankedStations, setRankedStations] = useState<RankedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { userLocation, setUserLocation, fetchLocation } = useLocation();
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

  const [refreshing, setRefreshing] = useState(false);

  const handleListRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      let nextUserLocation = userLocation;
      if (useCurrentLocation) {
        const res = await fetchLocation(false);
        if (res.location) {
          nextUserLocation = res.location;
        }
      }

      let nextTripStart = {
        latitude: nextUserLocation?.coords.latitude ?? 0,
        longitude: nextUserLocation?.coords.longitude ?? 0
      };

      if (!useCurrentLocation) {
         if (!selectedStartAddress?.coordinates) return;
         nextTripStart = selectedStartAddress.coordinates;
      }

      if (appMode === 'oneWay') {
        if (!selectedDestinationAddress?.coordinates) return;
        await fetchAndRankTripDataRef.current(
          nextTripStart,
          selectedDestinationAddress.coordinates,
          fuelNeeded,
          fuelEconomy,
          appliedFuelType,
          selectedBrands
        );
      } else {
        await fetchAndRankFuelDataRef.current(
          nextTripStart.latitude,
          nextTripStart.longitude,
          fuelNeeded,
          fuelEconomy,
          appliedFuelType,
          selectedBrands
        );
      }
    } catch {
      // Ignore errors on refresh
    } finally {
      setRefreshing(false);
    }
  }, [userLocation, useCurrentLocation, appMode, selectedStartAddress, selectedDestinationAddress, fuelNeeded, fuelEconomy, appliedFuelType, selectedBrands]);

  const isSelectingSuggestionRef = useRef(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const latestRankingRequestIdRef = useRef(0);
  const AppleMapsView = expoMapsModule?.AppleMaps?.View;
  const GoogleMapsView = expoMapsModule?.GoogleMaps?.View;

  const palette = useMemo(() => getPalette(themeMode), [themeMode]);
  const styles = useMemo(() => createThemedStyles(palette), [palette]);
  const isSettingsTabActive = activeTab === 'settings';

  const startShouldFetchSuggestions =
    isSettingsTabActive && !useCurrentLocation && (Platform.OS !== 'web' || isStartInputFocused);

  const destinationShouldFetchSuggestions =
    isSettingsTabActive && appMode === 'oneWay' && (Platform.OS !== 'web' || isDestinationInputFocused);

  const startAddressPicker = useAddressPicker({
    shouldFetch: startShouldFetchSuggestions,
    value: tripStartAddress,
    setValue: setTripStartAddress,
    selected: selectedStartAddress,
    setSelected: setSelectedStartAddress,
    suggestions: startSuggestions,
    setSuggestions: setStartSuggestions,
    searching: searchingStart,
    setSearching: setSearchingStart,
    isFocused: isStartInputFocused,
    setIsFocused: setIsStartInputFocused,
    isSelectingSuggestionRef,
    fetchAddressSuggestions,
    resolveAddress,
    resolveAddressByPlaceId
  });

  const destinationAddressPicker = useAddressPicker({
    shouldFetch: destinationShouldFetchSuggestions,
    value: tripDestinationAddress,
    setValue: setTripDestinationAddress,
    selected: selectedDestinationAddress,
    setSelected: setSelectedDestinationAddress,
    suggestions: destinationSuggestions,
    setSuggestions: setDestinationSuggestions,
    searching: searchingDestination,
    setSearching: setSearchingDestination,
    isFocused: isDestinationInputFocused,
    setIsFocused: setIsDestinationInputFocused,
    isSelectingSuggestionRef,
    fetchAddressSuggestions,
    resolveAddress,
    resolveAddressByPlaceId
  });

  const navigateToTab = useCallback(
    (tab: AppTab) => {
      // When using NativeTabs, routing remounts the correct screen.
      // Avoid changing internal `activeTab` to reduce redundant renders/flicker.
      if (!hideBottomNav) {
        setActiveTabState(tab);
      }
      onNavigateToTab?.(tab);
    },
    [hideBottomNav, onNavigateToTab]
  );
  const bottomNavInset = Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 6;
  const bottomNavHeight = 58 + bottomNavInset;
  // In NativeTabs mode, use the system safe-area bottom inset directly.
  // This prevents overscroll blank space while still leaving enough space
  // for the native tab bar.
  const scrollBottomPadding = hideBottomNav ? insets.bottom : bottomNavHeight + 8;
  const statusBarInset = Constants.statusBarHeight ?? 0;
  const headerTopOffset = statusBarInset;
  const topHeaderHeight = headerTopOffset + (headerContentHeights[activeTab] ?? 84) + 20;

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
        setSavedSettingsSnapshot(
          createSettingsSnapshot({
            appMode: prefs.appMode,
            useCurrentLocation: prefs.useCurrentLocation,
            fuelNeeded: prefs.fuelNeeded,
            fuelEconomy: prefs.fuelEconomy,
            fuelType: fuelTypeNorm,
            selectedBrands: brandsNorm,
            tripStartAddress: prefs.tripStartAddress,
            tripDestinationAddress: prefs.tripDestinationAddress
          })
        );
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

        const { success, errorMsg, location: newLoc } = await fetchLocation(prefs.useCurrentLocation);
        if (cancelled) return;
        if (!success) {
          setErrorMsg(errorMsg || 'Failed to get location');
          setLoading(false);
          return;
        }
        let location = newLoc;

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

  const handleSaveSettings = async () => {
    if (!hasPendingSettingsChanges || isSavingSettings) {
      return;
    }
    setIsSavingSettings(true);

    const roundedFuelNeeded = roundToTwoDecimalPlaces(fuelNeeded);
    const roundedFuelEconomy = roundToTwoDecimalPlaces(fuelEconomy);
    setFuelNeeded(roundedFuelNeeded);
    setFuelEconomy(roundedFuelEconomy);
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
      setErrorMsg(missingMessage);
      setLoading(false);
      setIsSavingSettings(false);
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    let resolvedUserLocation = userLocation;
    if (useCurrentLocation && !resolvedUserLocation) {
      const res = await fetchLocation(true);
      if (!res.success) {
        setErrorMsg('Location permission is required when "Use my location" is enabled.');
        setLoading(false);
        setIsSavingSettings(false);
        return;
      }
      resolvedUserLocation = res.location;
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
          setErrorMsg('Please click a Start Address suggestion, then pick a valid result.');
          setLoading(false);
          setIsSavingSettings(false);
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
          setErrorMsg('Please click a Destination Address suggestion, then pick a valid result.');
          setLoading(false);
          setIsSavingSettings(false);
          return;
        }
        setSelectedDestinationAddress(resolvedDestination);
        nextTripDestination = resolvedDestination.coordinates;
      }

      await saveUserPreferences({
        appMode,
        useCurrentLocation,
        fuelNeeded: roundedFuelNeeded,
        fuelEconomy: roundedFuelEconomy,
        fuelType: nextFuelType,
        selectedBrands: nextBrands,
        tripDestination: nextTripDestination,
        tripStartAddress: startAddress,
        tripDestinationAddress: destinationAddress,
        tripStart: nextTripStart
      });
      setTripDestination(nextTripDestination);
      setSavedSettingsSnapshot(
        createSettingsSnapshot({
          appMode,
          useCurrentLocation,
          fuelNeeded: roundedFuelNeeded,
          fuelEconomy: roundedFuelEconomy,
          fuelType: nextFuelType,
          selectedBrands: nextBrands,
          tripStartAddress: startAddress,
          tripDestinationAddress: destinationAddress
        })
      );
      onSettingsSaved?.();
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Address validation failed. Please try again.'));
      setLoading(false);
      setIsSavingSettings(false);
      return;
    }
    setIsStartInputFocused(false);
    setIsDestinationInputFocused(false);
    setStartSuggestions([]);
    setDestinationSuggestions([]);

    if (appMode === 'oneWay') {
      fetchAndRankTripDataRef.current(
        nextTripStart,
        nextTripDestination,
        roundedFuelNeeded,
        roundedFuelEconomy,
        nextFuelType,
        nextBrands
      );
    } else {
      fetchAndRankFuelDataRef.current(
        nextTripStart.latitude,
        nextTripStart.longitude,
        roundedFuelNeeded,
        roundedFuelEconomy,
        nextFuelType,
        nextBrands
      );
    }
    setIsSavingSettings(false);
  };
  const renderItem = ({ item, index }: { item: RankedStation; index: number }) => {
    const cardContent = (
      <>
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
      </>
    );

    return (
      <View style={styles.cardShell}>
        <TouchableOpacity style={styles.cardTouchable} activeOpacity={0.9} onPress={() => setMapStation(item)}>
          {canUseLiquidGlass ? (
            <View style={styles.cardGlass}>
              <GlassView style={styles.cardGlassBackground} glassEffectStyle="regular" />
              <View style={styles.cardContent}>{cardContent}</View>
            </View>
          ) : (
            <View style={styles.card}>{cardContent}</View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

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

  const renderSettingsSection = useCallback(
    (children: React.ReactNode) => {
      return canUseLiquidGlass ? (
          <View style={styles.settingsSectionGlass}>
            <GlassView style={styles.settingsSectionGlassBackground} glassEffectStyle="regular" />
            <View style={styles.settingsSectionContent}>{children}</View>
          </View>
        ) : (
          <View style={styles.settingsSection}>{children}</View>
        );
    },
    [styles]
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
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }
    setHeaderContentHeights((prev) => {
      const currentHeight = prev[activeTab] ?? 0;
      if (Math.abs(nextHeight - currentHeight) <= 1) {
        return prev;
      }
      return {
        ...prev,
        [activeTab]: nextHeight
      };
    });
  }, [activeTab]);

  const currentSettingsSnapshot = useMemo<SettingsSnapshot>(
    () =>
      createSettingsSnapshot({
        appMode,
        useCurrentLocation,
        fuelNeeded,
        fuelEconomy,
        fuelType,
        selectedBrands,
        tripStartAddress,
        tripDestinationAddress
      }),
    [appMode, useCurrentLocation, fuelNeeded, fuelEconomy, fuelType, selectedBrands, tripStartAddress, tripDestinationAddress]
  );

  const hasPendingSettingsChanges = useMemo(
    () => hasSettingsSnapshotChanges(savedSettingsSnapshot, currentSettingsSnapshot),
    [savedSettingsSnapshot, currentSettingsSnapshot]
  );

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} backgroundColor="transparent" />
      <SafeAreaView style={styles.container} edges={['left', 'right']}>

        <MapStationModal
          visible={!!mapStation}
          mapStation={mapStation}
          palette={palette}
          styles={styles}
          appMode={appMode}
          oneWayStartPoint={oneWayStartPoint}
          tripDestination={tripDestination}
          userLocation={userLocation}
          AppleMapsView={AppleMapsView}
          GoogleMapsView={GoogleMapsView}
          mapCameraPosition={mapCameraPosition}
          mapMarkers={mapMarkers}
          mapPolylines={mapPolylines}
          onClose={() => setMapStation(null)}
          onOpenExternal={openExternalMapForStation}
        />

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
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleListRefresh}
                    tintColor={palette.primaryMuted}
                    colors={[palette.primary]}
                  />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.resultsListContent,
                  rankedStations.length === 0 && styles.resultsListContentEmpty,
                  { paddingBottom: scrollBottomPadding }
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
          <SettingsTab style={[styles.listContainer, { paddingTop: topHeaderHeight, paddingBottom: 0 }]}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[styles.settingsPageContent, { paddingTop: 0, paddingBottom: 16 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                nestedScrollEnabled
              >
              {renderSettingsSection(
                <>
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
                  <View style={[styles.sourceToggleRow, { marginBottom: 0 }]}>
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
                </>
              )}

              {!useCurrentLocation ? (
                renderSettingsSection(
                <>
                  <View style={styles.settingsSectionHeader}>
                    <Ionicons name="pin-outline" size={16} color={palette.title} />
                    <Text style={styles.settingsSectionTitle}>Start Address</Text>
                  </View>
                  <Text style={styles.inputLabel}>Start Address</Text>
                  <AddressSuggestionInput
                    ui={{
                      value: tripStartAddress,
                      isFocused: isStartInputFocused,
                      suggestions: startSuggestions,
                      statusText: startStatusText,
                      statusOk: startAddressSelected,
                      metaHintText: searchingStart ? "Searching addresses..." : null
                    }}
                    onChangeText={startAddressPicker.handleChangeText}
                    onFocus={() => setIsStartInputFocused(true)}
                    onBlur={startAddressPicker.handleBlur}
                    placeholder="Enter start address"
                    placeholderTextColor={palette.placeholder}
                    inputStyle={styles.input}
                    statusOkTextStyle={styles.addressStatusTextOk}
                    styles={styles}
                    keyPrefix="start"
                    onPressInSuggestion={() => {
                      isSelectingSuggestionRef.current = true;
                    }}
                    onSelectSuggestion={(suggestion) => {
                      startAddressPicker.applySuggestion(suggestion, 'list');
                    }}
                  />
                </>
                )
              ) : null}

              {appMode === 'oneWay' ? (
                renderSettingsSection(
                <>
                  <View style={styles.settingsSectionHeader}>
                    <Ionicons name="flag-outline" size={16} color={palette.title} />
                    <Text style={styles.settingsSectionTitle}>Destination</Text>
                  </View>
                  <Text style={styles.inputLabel}>Destination Address</Text>
                  <AddressSuggestionInput
                    ui={{
                      value: tripDestinationAddress,
                      isFocused: isDestinationInputFocused,
                      suggestions: destinationSuggestions,
                      statusText: destinationStatusText ?? "",
                      statusOk: destinationAddressSelected,
                      metaHintText: searchingDestination ? "Searching addresses..." : null
                    }}
                    onChangeText={destinationAddressPicker.handleChangeText}
                    onFocus={() => setIsDestinationInputFocused(true)}
                    onBlur={destinationAddressPicker.handleBlur}
                    placeholder="Enter destination address"
                    placeholderTextColor={palette.placeholder}
                    inputStyle={styles.input}
                    statusOkTextStyle={styles.addressStatusTextOk}
                    styles={styles}
                    keyPrefix="dest"
                    onPressInSuggestion={() => {
                      isSelectingSuggestionRef.current = true;
                    }}
                    onSelectSuggestion={(suggestion) => {
                      destinationAddressPicker.applySuggestion(suggestion, 'list');
                    }}
                  />
                </>
                )
              ) : null}

              {renderSettingsSection(
              <>
                <View style={styles.settingsSectionHeader}>
                  <Ionicons name="car-sport-outline" size={16} color={palette.title} />
                  <Text style={styles.settingsSectionTitle}>Vehicle & Fuel</Text>
                </View>
                <View style={styles.inlineInputsRow}>
                  <View style={styles.inlineInputCol}>
                    <Text style={[styles.inputLabel, styles.inlineInputLabel]}>Fuel Needed (Litres)</Text>
                      <RoundedNumericInput
                        value={fuelNeeded}
                        onChangeText={setFuelNeeded}
                        inputStyle={styles.inlineInput}
                        keyboardAppearance={themeMode}
                        placeholder="e.g. 50"
                        placeholderTextColor={palette.placeholder}
                      />
                  </View>
                  <View style={styles.inlineInputCol}>
                    <Text style={[styles.inputLabel, styles.inlineInputLabel]}>Fuel Economy (L/100km)</Text>
                      <RoundedNumericInput
                        value={fuelEconomy}
                        onChangeText={setFuelEconomy}
                        inputStyle={styles.inlineInput}
                        keyboardAppearance={themeMode}
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
                <View style={[styles.fuelTypeRow, { marginBottom: 0 }]}>
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
              </>
              )}

              </ScrollView>
            </KeyboardAvoidingView>
          </SettingsTab>
        )}

        <View pointerEvents="none" style={[styles.headerVignette, { height: topHeaderHeight + 40 }]}>
          <MaskedView
            style={{ flex: 1 }}
            maskElement={
              <LinearGradient
                colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
                locations={[0, 0.7, 1]}
                style={{ flex: 1 }}
              />
            }
          >
            <ThemedGlassView style={{ flex: 1 }} glassEffectStyle="regular" fallbackStyle={{ backgroundColor: palette.bg }} />
          </MaskedView>
        </View>

        <View pointerEvents="box-none" style={[styles.headerOverlayContainer, { top: headerTopOffset }]}>
          <View style={styles.headerPlainContent} onLayout={handleHeaderLayout}>
            {activeTab === 'prices' ? (
              <>
                <Text style={styles.title}>OnlyFuel</Text>
                <Text style={styles.subtitle}>{appMode === 'oneWay' ? 'One-way one-stop planner' : 'Round-trip nearby ranking'}</Text>
                <View style={styles.summarySingleRow}>
                  {canUseLiquidGlass ? (
                    <>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                          <Text style={[styles.summaryChipText]}>{fuelNeeded}L</Text>
                        </GlassView>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                          <Text style={[styles.summaryChipText]}>{appliedFuelType}</Text>
                        </GlassView>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <GlassView style={styles.summaryChipGlass} glassEffectStyle="regular">
                          <Text style={[styles.summaryChipText]}>{appMode === 'oneWay' ? 'One-way' : 'Round-trip'}</Text>
                        </GlassView>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <View style={styles.summaryChip}>
                          <Text style={styles.summaryChipText}>{fuelNeeded}L</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <View style={styles.summaryChip}>
                          <Text style={styles.summaryChipText}>{appliedFuelType}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigateToTab('settings')} accessibilityRole="button" accessibilityLabel="Open settings">
                        <View style={styles.summaryChip}>
                          <Text style={styles.summaryChipText}>{appMode === 'oneWay' ? 'One-way' : 'Round-trip'}</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                <SettingsHeader
                  hasPendingSettingsChanges={hasPendingSettingsChanges}
                  isSavingSettings={isSavingSettings}
                  themeMode={themeMode}
                  styles={styles}
                  onSave={() => {
                    void handleSaveSettings();
                  }}
                />
              </>
            )}
            </View>
        </View>

        {!hideBottomNav ? (
          <FloatingBottomNav
            tabs={bottomNavTabs}
            activeTab={activeTab}
            onTabPress={navigateToTab}
            bottomInset={bottomNavInset}
            selectedColor={palette.primary}
            unselectedColor={palette.metaHint}
            styles={styles}
          />
        ) : null}
      </SafeAreaView>
    </>
  );
}

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { computeRankedStations, computeTripRankedStations } from './calculations';
import {
  BRAND_OPTIONS,
  DEFAULT_FUEL_TYPE,
  DEFAULT_TRIP_DESTINATION,
  FUEL_TYPE_OPTIONS,
  NEARBY_RADIUS_KM,
  TRIP_SAMPLE_RADIUS_KM
} from './constants';
import { fetchNearbyFuelData, getAccessToken } from './fuelApiClient';
import { fetchAddressSuggestions, resolveAddressByPlaceId, type AddressSuggestion } from './geocodingClient';
import type { AppMode, Coordinates, FuelApiData, RankedStation } from './Interface';
import { loadUserPreferences, saveUserPreferences } from './preferencesStorage';
import { createThemedStyles, getPalette, type ThemeMode } from './theme';
import { runTripAlgorithmValidation } from './tripValidation';
import { getErrorMessage, normalizeBrands, normalizeFuelType } from './utils';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [appMode, setAppMode] = useState<AppMode>('roundTrip');
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [rankedStations, setRankedStations] = useState<RankedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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
  const [isStartInputFocused, setIsStartInputFocused] = useState(false);
  const [isDestinationInputFocused, setIsDestinationInputFocused] = useState(false);
  const [selectedStartAddress, setSelectedStartAddress] = useState<AddressSuggestion | null>(null);
  const [selectedDestinationAddress, setSelectedDestinationAddress] = useState<AddressSuggestion | null>(null);
  const isMountedRef = useRef(true);
  const latestRankingRequestIdRef = useRef(0);
  const { width } = useWindowDimensions();
  const isCompactHeader = width < 390;

  const palette = useMemo(() => getPalette(themeMode), [themeMode]);
  const styles = useMemo(() => createThemedStyles(palette), [palette]);

  useEffect(() => {
    if (__DEV__) {
      runTripAlgorithmValidation();
    }
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
      const LIVE_DATA_TIMEOUT_MS = 180000; // 3 minutes watchdog (prevents "Loading..." forever)
      const watchdog = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Live data timed out after ${LIVE_DATA_TIMEOUT_MS / 1000}s`));
        }, LIVE_DATA_TIMEOUT_MS);
      });

      const doWork = (async () => {
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
        setErrorMsg(`Live data failed: ${liveError}`);
      }
    },
    [processAndRank]
  );

  const midpointBetween = (start: Coordinates, end: Coordinates): Coordinates => ({
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2
  });

  const getTripAddressMissingMessage = useCallback(
    (startAddress: string, destinationAddress: string, useGpsForStart: boolean): string | null => {
      const missing: string[] = [];
      if (!useGpsForStart && startAddress.trim().length === 0) {
        missing.push('start address');
      }
      if (destinationAddress.trim().length === 0) {
        missing.push('destination address');
      }
      if (missing.length === 0) {
        return null;
      }
      return `One-way mode needs ${missing.join(' and ')}. Please set the missing address(es) in Settings.`;
    },
    []
  );

  const getRoundTripStartMissingMessage = useCallback((startAddress: string, useGpsForStart: boolean): string | null => {
    if (useGpsForStart || startAddress.trim().length > 0) {
      return null;
    }
    return 'Round-trip mode needs a start address when GPS start is off. Please set Start Address in Settings.';
  }, []);

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
      const LIVE_DATA_TIMEOUT_MS = 180000;
      const watchdog = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Live data timed out after ${LIVE_DATA_TIMEOUT_MS / 1000}s`));
        }, LIVE_DATA_TIMEOUT_MS);
      });

      const doWork = (async () => {
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
        setErrorMsg('No feasible one-stop stations found for this trip. Try broader brands/fuel type.');
      })();

      try {
        await Promise.race([doWork, watchdog]);
      } catch (err) {
        const liveError = getErrorMessage(err, 'Trip mode request failed.');
        console.warn(`Trip mode failed: ${liveError}`);
        setLoading(false);
        setErrorMsg(`Trip mode failed: ${liveError}`);
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
    if (!showSettings || useCurrentLocation || !isStartInputFocused) {
      setStartSuggestions([]);
      return () => {
        cancelled = true;
      };
    }
    const q = tripStartAddress.trim();
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
  }, [showSettings, useCurrentLocation, tripStartAddress, isStartInputFocused]);

  useEffect(() => {
    let cancelled = false;
    if (!showSettings || appMode !== 'oneWay' || !isDestinationInputFocused) {
      setDestinationSuggestions([]);
      return () => {
        cancelled = true;
      };
    }
    const q = tripDestinationAddress.trim();
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
  }, [showSettings, appMode, tripDestinationAddress, isDestinationInputFocused]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await loadUserPreferences();
        if (cancelled) return;

        const fuelTypeNorm = normalizeFuelType(prefs.fuelType);
        const brandsNorm = normalizeBrands(prefs.selectedBrands);

        setThemeMode(prefs.themeMode);
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

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setLoading(false);
          return;
        }

        // Avoid an infinite spinner if GPS/permissions are slow or unavailable in TestFlight.
        const location = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location timed out')), 15000))
        ]);
        if (cancelled) return;
        setUserLocation(location);

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

          await fetchAndRankTripDataRef.current(
            {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            },
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
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
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
  }, [getRoundTripStartMissingMessage, getTripAddressMissingMessage]);

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => {
      const next: ThemeMode = current === 'light' ? 'dark' : 'light';
      void saveUserPreferences({ themeMode: next });
      return next;
    });
  }, []);

  const handleSaveSettings = async () => {
    if (!userLocation) {
      return;
    }

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
    } else {
      setErrorMsg(null);
      setLoading(true);
    }

    let nextTripStart = {
      latitude: userLocation.coords.latitude,
      longitude: userLocation.coords.longitude
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
      return resolveAddressByPlaceId(candidate.id);
    };

    try {
      if (!useCurrentLocation) {
        const resolvedStart = await ensureResolvedSelection(
          selectedStartAddress && selectedStartAddress.label === startAddress ? selectedStartAddress : null
        );
        if (!resolvedStart) {
          setErrorMsg('Please click a Start Address suggestion, then pick a valid result.');
          setLoading(false);
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
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Address validation failed. Please try again.'));
      setLoading(false);
      return;
    }
    setShowSettings(false);
    setIsStartInputFocused(false);
    setIsDestinationInputFocused(false);
    setStartSuggestions([]);
    setDestinationSuggestions([]);

    if (missingMessage) {
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
  };

  const renderItem = ({ item, index }: { item: RankedStation; index: number }) => (
    <View style={styles.card}>
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
    </View>
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

  return (
    <SafeAreaProvider>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.headerRow, isCompactHeader && styles.headerRowCompact]}>
            <View style={styles.headerMain}>
              <Text style={styles.title}>Bowsr</Text>
              <Text style={styles.subtitle}>{appMode === 'oneWay' ? 'One-way one-stop planner' : 'Round-trip nearby ranking'}</Text>
              <View style={styles.headerMetaRow}>
                <View style={styles.fuelTypeBadge}>
                  <Text style={styles.fuelTypeBadgeText}>{appliedFuelType}</Text>
                </View>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{useCurrentLocation ? 'Start: GPS' : 'Start: Address'}</Text>
                </View>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>
                    {appMode === 'oneWay' ? 'Destination: Address' : `Nearby ${NEARBY_RADIUS_KM}km`}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{appMode === 'oneWay' ? 'One-way' : 'Round-trip'}</Text>
                </View>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{fuelNeeded}L</Text>
                </View>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{fuelEconomy}L/100km</Text>
                </View>
              </View>
            </View>
            <View style={[styles.headerActionRail, isCompactHeader && styles.headerActionRailCompact]}>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={toggleTheme}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel={themeMode === 'dark' ? 'Use light theme' : 'Use dark theme'}
                >
                  <Ionicons
                    name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
                    size={22}
                    color={palette.title}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowSettings(true)}
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Open settings"
                >
                  <Ionicons name="settings-outline" size={22} color={palette.title} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <Modal visible={showSettings} animationType="slide" transparent={true} presentationStyle="overFullScreen">
          <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => undefined}>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : Platform.OS === 'android' ? 8 : 0}
                  style={styles.modalKeyboardWrap}
                >
                <View style={styles.modalContent}>
                  <View style={styles.modalHandle} />
                  <View style={styles.modalHeaderRow}>
                    <Ionicons name="settings-outline" size={20} color={palette.title} />
                    <View style={styles.modalTitleWrap}>
                      <Text style={styles.modalTitle}>Settings</Text>
                      <Text style={styles.modalSubtitle}>Tune trip mode, addresses, and vehicle preferences.</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowSettings(false)}
                      style={styles.modalCloseButton}
                      accessibilityRole="button"
                      accessibilityLabel="Close settings"
                    >
                      <Ionicons name="close" size={20} color={palette.modalTitle} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
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
                            {option ? "Use my location" : 'Use start address'}
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
                          setTripStartAddress(value);
                          setSelectedStartAddress(null);
                        }}
                            onFocus={() => setIsStartInputFocused(true)}
                            onBlur={() => {
                              setTimeout(() => {
                                setIsStartInputFocused(false);
                              }, 120);
                            }}
                        placeholder="Enter start address"
                        placeholderTextColor={palette.placeholder}
                      />
                      {searchingStart ? <Text style={styles.metaHint}>Searching addresses...</Text> : null}
                      <View style={[styles.addressStatusPill, startAddressSelected && styles.addressStatusPillOk]}>
                        <Text style={[styles.addressStatusText, startAddressSelected && styles.addressStatusTextOk]}>
                          {startStatusText}
                        </Text>
                      </View>
                      {startSuggestions.length > 0 ? (
                        <View style={styles.suggestionsList}>
                          {startSuggestions.map((suggestion) => (
                            <TouchableOpacity
                                  key={`start-${suggestion.id}`}
                              style={styles.suggestionItem}
                              onPress={() => {
                                void (async () => {
                                  // Optimistically apply the selected label so tap always feels responsive.
                                  setTripStartAddress(suggestion.label);
                                  setSelectedStartAddress(suggestion);
                                  try {
                                    const resolved = await resolveAddressByPlaceId(suggestion.id);
                                    if (resolved) {
                                      setTripStartAddress(resolved.label);
                                      setSelectedStartAddress(resolved);
                                    }
                                  } catch {
                                    // Keep optimistic label; final coordinates are validated on save.
                                  } finally {
                                    setStartSuggestions([]);
                                    setIsStartInputFocused(false);
                                    Keyboard.dismiss();
                                  }
                                })();
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
                          setTripDestinationAddress(value);
                          setSelectedDestinationAddress(null);
                        }}
                        onFocus={() => setIsDestinationInputFocused(true)}
                        onBlur={() => {
                          setTimeout(() => {
                            setIsDestinationInputFocused(false);
                          }, 120);
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
                      {destinationSuggestions.length > 0 ? (
                        <View style={styles.suggestionsList}>
                          {destinationSuggestions.map((suggestion) => (
                            <TouchableOpacity
                              key={`dest-${suggestion.id}`}
                              style={styles.suggestionItem}
                              onPress={() => {
                                void (async () => {
                                  // Optimistically apply the selected label so tap always feels responsive.
                                  setTripDestinationAddress(suggestion.label);
                                  setSelectedDestinationAddress(suggestion);
                                  try {
                                    const resolved = await resolveAddressByPlaceId(suggestion.id);
                                    if (resolved) {
                                      setTripDestinationAddress(resolved.label);
                                      setSelectedDestinationAddress(resolved);
                                    }
                                  } catch {
                                    // Keep optimistic label; final coordinates are validated on save.
                                  } finally {
                                    setDestinationSuggestions([]);
                                    setIsDestinationInputFocused(false);
                                    Keyboard.dismiss();
                                  }
                                })();
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
                  <View style={styles.modalFooter}>
                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
                      <View style={styles.saveButtonRow}>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.saveButtonText}>Save & Recalculate</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {errorMsg ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={palette.primaryMuted} />
            <Text style={styles.loadingText}>Calculating optimal routes...</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {rankedStations.length === 0 ? (
              <Text style={styles.emptyText}>No stations available right now. Try recalculating.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultsListContent}>
                {rankedStations.map((item, index) => renderItem({ item, index }))}
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

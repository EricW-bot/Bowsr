import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { computeRankedStations } from './calculations';
import {
  BRAND_OPTIONS,
  DEFAULT_FUEL_TYPE,
  FUEL_TYPE_OPTIONS,
  NEARBY_RADIUS_STEPS_KM,
  TARGET_NEARBY_STATIONS
} from './constants';
import { fetchNearbyFuelData, getAccessToken } from './fuelApiClient';
import type { FuelApiData, RankedStation } from './Interface';
import { loadUserPreferences, saveUserPreferences } from './preferencesStorage';
import { createThemedStyles, getPalette, type ThemeMode } from './theme';
import {
  getErrorMessage,
  normalizeBrands,
  normalizeFuelType,
  sameOrderedStringArray
} from './utils';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [rankedStations, setRankedStations] = useState<RankedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);

  const [apiData, setApiData] = useState<FuelApiData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fuelNeeded, setFuelNeeded] = useState('50');
  const [fuelEconomy, setFuelEconomy] = useState('8.0');
  const [fuelType, setFuelType] = useState(DEFAULT_FUEL_TYPE);
  const [appliedFuelType, setAppliedFuelType] = useState(DEFAULT_FUEL_TYPE);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [appliedBrands, setAppliedBrands] = useState<string[]>([]);
  const isMountedRef = useRef(true);
  const latestRankingRequestIdRef = useRef(0);

  const palette = useMemo(() => getPalette(themeMode), [themeMode]);
  const styles = useMemo(() => createThemedStyles(palette), [palette]);

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
      try {
        const requestFuelType = normalizeFuelType(fuelTypeInput);
        const requestBrands = normalizeBrands(brandsInput);

        const accessToken = await getAccessToken();

        let selectedData: FuelApiData | null = null;
        for (const radiusKm of NEARBY_RADIUS_STEPS_KM) {
          const nearbyData = await fetchNearbyFuelData(
            accessToken,
            requestBrands,
            userLat,
            userLon,
            radiusKm,
            requestFuelType
          );

          if (nearbyData && nearbyData.stations.length > 0 && nearbyData.prices.length > 0) {
            selectedData = nearbyData;
          }

          if ((nearbyData?.stations.length || 0) >= TARGET_NEARBY_STATIONS) {
            selectedData = nearbyData;
            break;
          }
        }

        if (!selectedData) {
          throw new Error('Nearby API returned no usable stations for selected radii.');
        }

        setApiData(selectedData);
        setAppliedFuelType(requestFuelType);
        setAppliedBrands(requestBrands);
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
      } catch (err) {
        const liveError = getErrorMessage(err, 'Live data request failed.');
        console.warn(`Live data failed: ${liveError}`);
        setLoading(false);
        setErrorMsg(`Live data failed: ${liveError}`);
      }
    },
    [processAndRank]
  );

  const fetchAndRankFuelDataRef = useRef(fetchAndRankFuelData);
  fetchAndRankFuelDataRef.current = fetchAndRankFuelData;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await loadUserPreferences();
        if (cancelled) return;

        const fuelTypeNorm = normalizeFuelType(prefs.fuelType);
        const brandsNorm = normalizeBrands(prefs.selectedBrands);

        setThemeMode(prefs.themeMode);
        setFuelNeeded(prefs.fuelNeeded);
        setFuelEconomy(prefs.fuelEconomy);
        setFuelType(fuelTypeNorm);
        setAppliedFuelType(fuelTypeNorm);
        setSelectedBrands(brandsNorm);
        setAppliedBrands(brandsNorm);

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

        await fetchAndRankFuelDataRef.current(
          location.coords.latitude,
          location.coords.longitude,
          prefs.fuelNeeded,
          prefs.fuelEconomy,
          fuelTypeNorm,
          brandsNorm
        );
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

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => {
      const next: ThemeMode = current === 'light' ? 'dark' : 'light';
      void saveUserPreferences({ themeMode: next });
      return next;
    });
  }, []);

  const handleSaveSettings = () => {
    setShowSettings(false);
    if (!userLocation) {
      return;
    }

    const nextFuelType = normalizeFuelType(fuelType);
    const nextBrands = normalizeBrands(selectedBrands);
    const brandsChanged = !sameOrderedStringArray(nextBrands, appliedBrands);
    setFuelType(nextFuelType);
    setSelectedBrands(nextBrands);
    void saveUserPreferences({
      fuelNeeded,
      fuelEconomy,
      fuelType: nextFuelType,
      selectedBrands: nextBrands
    });
    setLoading(true);

    if (nextFuelType !== appliedFuelType || brandsChanged) {
      fetchAndRankFuelData(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        fuelNeeded,
        fuelEconomy,
        nextFuelType,
        nextBrands
      );
      return;
    }

    if (apiData) {
      setLoading(true);
      processAndRank(apiData, userLocation.coords.latitude, userLocation.coords.longitude, fuelNeeded, fuelEconomy).then(
        (rankedCount) => {
          if (rankedCount === -1) {
            return;
          }
          if (rankedCount === 0) {
            setLoading(false);
            setErrorMsg('No rankable stations found for current settings. Previous results are still shown.');
          }
        }
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
          <Text style={styles.statLabel}>Pump Price</Text>
          <Text style={styles.statValue}>{item.priceCents.toFixed(1)}¢</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Route</Text>
          <Text style={styles.statValue}>
            {item.distanceKm.toFixed(1)} km
            {item.durationMin > 0 ? `\n(${Math.round(item.durationMin)} min)` : ''}
          </Text>
        </View>
        <View style={[styles.statBox, styles.highlightBox]}>
          <Text style={styles.statLabel}>Total Net Cost</Text>
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

  return (
    <SafeAreaProvider>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Bowsr</Text>
              <Text style={styles.subtitle}>Top 5 stops based on price & distance</Text>
              <View style={styles.headerMetaRow}>
                <View style={styles.fuelTypeBadge}>
                  <Text style={styles.fuelTypeBadgeText}>{appliedFuelType}</Text>
                </View>
                <Text style={styles.metaHint}>Nearby smart radius</Text>
              </View>
            </View>
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

        <Modal visible={showSettings} animationType="fade" transparent={true}>
          <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => undefined}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Vehicle Settings</Text>

                  <Text style={styles.inputLabel}>Fuel Needed (Liters)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={fuelNeeded}
                    onChangeText={setFuelNeeded}
                    placeholder="e.g. 50"
                    placeholderTextColor={palette.placeholder}
                  />

                  <Text style={styles.inputLabel}>Fuel Economy (L/100km)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={fuelEconomy}
                    onChangeText={setFuelEconomy}
                    placeholder="e.g. 8.0"
                    placeholderTextColor={palette.placeholder}
                  />

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

                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
                    <Text style={styles.saveButtonText}>Save & Recalculate</Text>
                  </TouchableOpacity>
                </View>
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
              <ScrollView showsVerticalScrollIndicator={false}>
                {rankedStations.map((item, index) => renderItem({ item, index }))}
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

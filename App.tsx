import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
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
import {
  getErrorMessage,
  normalizeBrands,
  normalizeFuelType,
  sameOrderedStringArray
} from './utils';

export default function App() {
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

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);

        await fetchAndRankFuelData(location.coords.latitude, location.coords.longitude, '50', '8.0', DEFAULT_FUEL_TYPE, []);
      } catch (err) {
        setErrorMsg(getErrorMessage(err, 'An error occurred while initializing.'));
        setLoading(false);
      }
    })();
  }, [fetchAndRankFuelData]);

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
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
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
                  />

                  <Text style={styles.inputLabel}>Fuel Economy (L/100km)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={fuelEconomy}
                    onChangeText={setFuelEconomy}
                    placeholder="e.g. 8.0"
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
            <ActivityIndicator size="large" color="#0066cc" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f7'
  },
  header: {
    padding: 20,
    paddingBottom: 18,
    backgroundColor: '#fbfdff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbe5ef'
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.2
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 6
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10
  },
  fuelTypeBadge: {
    backgroundColor: '#e0edff',
    borderColor: '#b7d2ff',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  fuelTypeBadgeText: {
    color: '#0b4bb3',
    fontSize: 12,
    fontWeight: '700'
  },
  metaHint: {
    marginLeft: 8,
    fontSize: 12,
    color: '#64748b'
  },
  settingsButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8eef7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1dbea'
  },
  settingsIcon: {
    fontSize: 19
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155'
  },
  errorText: {
    color: '#b42318',
    fontSize: 16,
    textAlign: 'center'
  },
  listContainer: {
    flex: 1,
    padding: 16,
    paddingBottom: 10
  },
  emptyText: {
    marginTop: 24,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e4f2',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  rankBadge: {
    backgroundColor: '#0b67d1',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  rankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  stationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1
  },
  stationInfo: {
    flex: 1
  },
  stationAddress: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#edf2f7',
    paddingTop: 12
  },
  statBox: {
    flex: 1,
    paddingRight: 8
  },
  highlightBox: {
    alignItems: 'flex-end',
    paddingRight: 0
  },
  statLabel: {
    fontSize: 12,
    color: '#7b8ba1',
    marginBottom: 4
  },
  statValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#243447'
  },
  costValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f7a40'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fdfefe',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dce6f3',
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 5
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
    color: '#1e293b',
    textAlign: 'center'
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#c5d4e6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#f8fbff'
  },
  fuelTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20
  },
  fuelTypeChip: {
    borderWidth: 1,
    borderColor: '#c2cfdf',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#f8fbff'
  },
  fuelTypeChipSelected: {
    borderColor: '#0b67d1',
    backgroundColor: '#e7f1ff'
  },
  fuelTypeChipText: {
    color: '#516273',
    fontSize: 13,
    fontWeight: '600'
  },
  fuelTypeChipTextSelected: {
    color: '#0b67d1'
  },
  saveButton: {
    backgroundColor: '#0b67d1',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0b67d1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800'
  }
});

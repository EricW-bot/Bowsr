import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

// --- API Configuration ---
const API_KEY = '4ICQizjkv8QmJpSEDoQ7Aq1a2ZwHT3G5';
const BASIC_AUTH_HEADER = 'Basic NElDUWl6amt2OFFtSnBTRURvUTdBcTFhMlp3SFQzRzU6eVN5Z3JCZnhIV0M2RFRoSQ==';

type Station = {
  brandid?: string;
  stationid?: string;
  brand?: string;
  code: string;
  name: string;
  address?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  state?: string;
};

type Price = {
  stationcode: string;
  fueltype?: string;
  price: number;
  lastupdated?: string;
  state?: string;
};

type FuelApiData = {
  stations: Station[];
  prices: Price[];
};

type RankedStation = Station & {
  priceCents: number;
  distanceKm: number;
  durationMin: number;
  totalCostDollars: number;
};

const getErrorMessage = (err: unknown, fallback: string): string => {
  return err instanceof Error ? err.message : fallback;
};

const sanitizePositiveNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const estimateRoute = (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): { distanceKm: number; durationMin: number } => {
  // Haversine straight-line distance, scaled to approximate real roads.
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLon = toRadians(endLon - startLon);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = earthRadiusKm * c;

  const estimatedRoadKm = Math.max(straightLineKm * 1.3, 0.5);
  const avgCitySpeedKmh = 45;
  const estimatedDurationMin = (estimatedRoadKm / avgCitySpeedKmh) * 60;

  return {
    distanceKm: estimatedRoadKm,
    durationMin: estimatedDurationMin
  };
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> => {
  const safeLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

const isFuelApiData = (input: unknown): input is FuelApiData => {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const candidate = input as { stations?: unknown; prices?: unknown };
  return Array.isArray(candidate.stations) && Array.isArray(candidate.prices);
};

/**
 * Fetch temporary OAuth Access Token
 * @returns {Promise<string>}
 */
const getAccessToken = async () => {
  const url = 'https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': BASIC_AUTH_HEADER
    }
  });
  
  if (!response.ok) {
    throw new Error(`OAuth request failed with status ${response.status}`);
  }
  
  const data: unknown = await response.json();
  const token = (data as { access_token?: string }).access_token;
  if (!token) {
    throw new Error('OAuth response missing access token');
  }
  return token;
};

// --- Helper Functions (Moved outside component to prevent ESLint warnings) ---
const getFormattedUTCDateTime = (): string => {
  const d = new Date();
  
  /**
   * @param {number} n
   * @returns {string | number}
   */
  const pad = (n: number): string => (n < 10 ? `0${n}` : n.toString());
  
  const day = pad(d.getUTCDate());
  const month = pad(d.getUTCMonth() + 1);
  const year = d.getUTCFullYear();
  let h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12; // 0 becomes 12
  const strH = pad(h);
  return `${day}/${month}/${year} ${strH}:${m}:${s} ${ampm}`;
};

/**
 * Fetch actual driving distance and time from OSRM
 * @param {number} startLat
 * @param {number} startLon
 * @param {number} endLat
 * @param {number} endLon
 * @returns {Promise<{distanceKm: number, durationMin: number} | null>}
 */
const getDrivingRoute = async (startLat: number, startLon: number, endLat: number, endLon: number): Promise<{ distanceKm: number; durationMin: number; }|null> => {
  try {
    // OSRM expects coordinates in longitude,latitude format
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('OSRM request failed');
    const data: unknown = await response.json();
    const routes = (data as { routes?: Array<{ distance: number; duration: number }> }).routes;
    const route = routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error('OSRM response missing route details');
    }
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch (err) {
    console.warn('OSRM routing failed. Using estimated route instead.');
    return estimateRoute(startLat, startLon, endLat, endLon);
  }
};

/**
 * @param {number} baseLat
 * @param {number} baseLon
 * @returns {{ stations: any[], prices: any[] }}
 */
const generateMockData = (baseLat: number, baseLon: number): FuelApiData => {
  const stations: Station[] = [];
  const prices: Price[] = [];
  const brands = ['7-Eleven', 'BP', 'Ampol', 'Shell', 'United'];

  for (let i = 1; i <= 15; i++) {
    const code = i.toString();
    // Generate locations slightly offset from the user (1km to ~20km away)
    const latOffset = (Math.random() - 0.5) * 0.3;
    const lonOffset = (Math.random() - 0.5) * 0.3;
    
    stations.push({
      brandid: `brand_${i}`,
      stationid: `stat_${i}`,
      brand: brands[i % brands.length],
      code: code,
      name: `${brands[i % brands.length]} Test Station ${i}`,
      address: `${100 + i} Fake St, Sydney`,
      location: { latitude: baseLat + latOffset, longitude: baseLon + lonOffset },
      state: "NSW"
    });

    // Generate random prices between 180.0 and 220.0 cents
    const randomPrice = 180 + Math.random() * 40;
    prices.push({
      stationcode: code,
      fueltype: "E10",
      price: parseFloat(randomPrice.toFixed(1)),
      lastupdated: new Date().toISOString(),
      state: "NSW"
    });
  }
  return { stations, prices };
};

export default function App() {
  const [rankedStations, setRankedStations] = useState<RankedStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  
  // --- New State for Settings ---
  const [apiData, setApiData] = useState<FuelApiData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fuelNeeded, setFuelNeeded] = useState('50');
  const [fuelEconomy, setFuelEconomy] = useState('8.0');
  const isMountedRef = useRef(true);
  const latestRankingRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * @param {{ stations: any[], prices: any[] }} data
   * @param {number} userLat
   * @param {number} userLon
   * @param {string} neededStr
   * @param {string} economyStr
   */
  const processAndRank = useCallback(async (data: FuelApiData, userLat: number, userLon: number, neededStr: string, economyStr: string) => {
    const requestId = ++latestRankingRequestIdRef.current;
    const { stations, prices } = data;
    
    // Parse user settings, fallback to defaults if empty
    const neededLiters = sanitizePositiveNumber(neededStr, 50);
    const economyLper100km = sanitizePositiveNumber(economyStr, 8.0);
    const litersPerKm = economyLper100km / 100;

    // Avoid flooding public routing APIs with too many parallel requests.
    const rankedCandidates = await mapWithConcurrency(stations, 5, async (station): Promise<RankedStation | null> => {
      const stationPriceInfo = prices.find((p) => p.stationcode === station.code);
      if (!stationPriceInfo || !Number.isFinite(stationPriceInfo.price)) {
        return null;
      }

      const route = await getDrivingRoute(
        userLat, userLon, 
        station.location.latitude, station.location.longitude
      );
      
      if (!route) return null;

      // --- THE OPTIMISATION MATH ---
      // Price is provided in cents (e.g., 195.9), convert to dollars
      const pricePerLiter = stationPriceInfo.price / 100; 
      const roundTripDistance = route.distanceKm * 2;
      const fuelBurnedOnTrip = roundTripDistance * litersPerKm;
      
      // C = P * (V + (D * E))
      const totalEffectiveCost = pricePerLiter * (neededLiters + fuelBurnedOnTrip);

      return {
        ...station,
        priceCents: stationPriceInfo.price,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        totalCostDollars: totalEffectiveCost
      };
    });

    // Ignore stale results if a newer recalculation started.
    if (!isMountedRef.current || requestId !== latestRankingRequestIdRef.current) {
      return;
    }

    // Filter out invalid routing results.
    const mergedList = rankedCandidates.filter((item): item is RankedStation => item !== null);

    // Sort by lowest total effective cost
    mergedList.sort((a, b) => a.totalCostDollars - b.totalCostDollars);

    // Keep top 5
    setRankedStations(mergedList.slice(0, 5));
    setLoading(false);
  }, []);

  /**
   * @param {number} userLat
   * @param {number} userLon
   * @param {string} needed
   * @param {string} economy
   */
  const fetchAndRankFuelData = useCallback(async (userLat: number, userLon: number, needed: string, economy: string) => {
    try {
      // 1. Get the dynamic Bearer Token automatically
      const accessToken = await getAccessToken();

      // 2. Fetch Live Fuel Data
      const response = await fetch('https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/fuel/prices', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
          'apikey': API_KEY,
          'transactionid': `req-${Date.now()}`,
          'requesttimestamp': getFormattedUTCDateTime()
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}. Falling back to mock data.`);
      }

      const data: unknown = await response.json();
      if (!isFuelApiData(data)) {
        throw new Error('Fuel API response format was invalid. Falling back to mock data.');
      }

      setApiData(data); // Save raw data for instant recalculations
      await processAndRank(data, userLat, userLon, needed, economy);

    } catch (err) {
      console.warn('Using mock data because real API failed or is missing keys.');
      const mockData = generateMockData(userLat, userLon);
      setApiData(mockData);
      await processAndRank(mockData, userLat, userLon, needed, economy);
    }
  }, [processAndRank]);

  useEffect(() => {
    (async () => {
      try {
        // 1. Get User Location
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);

        // 2. Fetch Fuel Data (passing initial state values)
        await fetchAndRankFuelData(location.coords.latitude, location.coords.longitude, '50', '8.0');
      } catch (err) {
        setErrorMsg(getErrorMessage(err, 'An error occurred while initializing.'));
        setLoading(false);
      }
    })();
  }, [fetchAndRankFuelData]);

  // --- Handlers ---
  const handleSaveSettings = () => {
    setShowSettings(false);
    if (apiData && userLocation) {
      setLoading(true); // Show loader while fetching new routes
      processAndRank(
        apiData, 
        userLocation.coords.latitude, 
        userLocation.coords.longitude, 
        fuelNeeded, 
        fuelEconomy
      );
    }
  };

  // --- UI Render ---
  /**
   * @param {{ item: { name: string, priceCents: number, distanceKm: number, durationMin: number, totalCostDollars: number }, index: number }} props
   */
  const renderItem = ({ item, index }: { item: RankedStation; index: number }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <Text style={styles.stationName}>{item.name}</Text>
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Fuel Optimiser</Text>
              <Text style={styles.subtitle}>Top 5 stops based on price & distance</Text>
            </View>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Modal */}
        <Modal visible={showSettings} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
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

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
                <Text style={styles.saveButtonText}>Save & Recalculate</Text>
              </TouchableOpacity>
            </View>
          </View>
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
            <FlatList<RankedStation>
              data={rankedStations}
              keyExtractor={(item) => item.code}
              renderItem={renderItem}
            />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  settingsButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  settingsIcon: {
    fontSize: 20,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#444',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rankBadge: {
    backgroundColor: '#0066cc',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
  },
  highlightBox: {
    alignItems: 'flex-end',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  costValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32', // Green for money/optimal
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#f9f9f9',
  },
  saveButton: {
    backgroundColor: '#0066cc',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
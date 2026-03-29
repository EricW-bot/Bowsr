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

// --- API Configuration ---
const API_KEY = '4ICQizjkv8QmJpSEDoQ7Aq1a2ZwHT3G5';
const BASIC_AUTH_HEADER = 'Basic NElDUWl6amt2OFFtSnBTRURvUTdBcTFhMlp3SFQzRzU6eVN5Z3JCZnhIV0M2RFRoSQ==';
const ALLOW_MOCK_FALLBACK = false;
const NEARBY_RADIUS_STEPS_KM = [3, 5, 8, 12, 18];
const TARGET_NEARBY_STATIONS = 40;
const MAX_ROUTE_CALCULATIONS = 20;
const DEFAULT_FUEL_TYPE = 'E10';
const FUEL_TYPE_OPTIONS = ['E10', 'U91', 'P95', 'P98', 'DL'];
const BRAND_OPTIONS = ['Ampol Foodary', 'Ampol Breeze', 'BP', 'Budget', 'EG Ampol', 'Enhance', 'Metro Fuel', 'Shell', 'Speedway', 'United', '7-Eleven'];
const AVG_CITY_SPEED_KMH = 50;

type Station = {
  brandid?: string;
  stationid?: string;
  brand?: string;
  code: string;
  name: string;
  address?: string;
  location: {
    distance?: number;
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
  const estimatedDurationMin = (estimatedRoadKm / AVG_CITY_SPEED_KMH) * 60;

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

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeFuelType = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  return normalized || DEFAULT_FUEL_TYPE;
};

const normalizeBrands = (brands: string[]): string[] => {
  return brands.map((brand) => brand.trim()).filter((brand) => brand.length > 0);
};

const sameOrderedStringArray = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const normalizeFuelApiData = (input: unknown): FuelApiData | null => {
  if (!input || typeof input !== 'object') return null;

  const root = input as Record<string, unknown>;
  const candidateContainers: Record<string, unknown>[] = [
    root,
    (root.data as Record<string, unknown>) || {},
    (root.payload as Record<string, unknown>) || {},
    (root.result as Record<string, unknown>) || {}
  ];

  for (const container of candidateContainers) {
    const rawStations = (container.stations as unknown[]) || [];
    const rawPrices = (container.prices as unknown[]) || [];

    if (!Array.isArray(rawStations) || !Array.isArray(rawPrices)) {
      continue;
    }

    const stations: Station[] = rawStations
      .map<Station | null>((s) => {
        const station = (s || {}) as Record<string, unknown>;
        const locationObj = (station.location || {}) as Record<string, unknown>;

        const code = toStringValue(station.code ?? station.stationcode ?? station.stationCode);
        const name = toStringValue(station.name ?? station.stationname ?? station.stationName);
        const latitude = toNumberValue(locationObj.latitude ?? station.latitude);
        const longitude = toNumberValue(locationObj.longitude ?? station.longitude);
        const distance = toNumberValue(locationObj.distance);

        if (!code || !name || latitude === null || longitude === null) {
          return null;
        }

        return {
          code,
          name,
          brand: toStringValue(station.brand),
          address: toStringValue(station.address),
          state: toStringValue(station.state),
          brandid: toStringValue(station.brandid),
          stationid: toStringValue(station.stationid),
          location: {
            latitude,
            longitude,
            ...(distance !== null ? { distance } : {})
          }
        };
      })
      .filter((item): item is Station => item !== null);

    const prices: Price[] = rawPrices
      .map<Price | null>((p) => {
        const priceObj = (p || {}) as Record<string, unknown>;
        const stationcode = toStringValue(priceObj.stationcode ?? priceObj.stationCode);
        const price = toNumberValue(priceObj.price);
        if (!stationcode || price === null) {
          return null;
        }

        return {
          stationcode,
          price,
          fueltype: toStringValue(priceObj.fueltype ?? priceObj.fuelType),
          lastupdated: toStringValue(priceObj.lastupdated ?? priceObj.lastUpdated),
          state: toStringValue(priceObj.state)
        };
      })
      .filter((item): item is Price => item !== null);

    if (stations.length > 0 && prices.length > 0) {
      return { stations, prices };
    }
  }

  return null;
};

const fetchNearbyFuelData = async (
  accessToken: string,
  brand: string[],
  latitude: number,
  longitude: number,
  radiusKm: number,
  fueltype: string
): Promise<FuelApiData | null> => {
  const normalizedBrandArray = Array.from(new Set(normalizeBrands(brand)));
  const requestBody: Record<string, unknown> = {
    fueltype,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    radius: radiusKm.toString(),
    sortby: 'price',
    sortascending: 'true'
  };

  if (normalizedBrandArray.length > 0) {
    requestBody.brand = normalizedBrandArray;
  }

  const response = await fetch('https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/fuel/prices/nearby', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
      'apikey': API_KEY,
      'transactionid': `req-${Date.now()}-${radiusKm}`,
      'requesttimestamp': getFormattedUTCDateTime()
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Nearby API failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  return normalizeFuelApiData(payload);
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

  /**
   * @param {{ stations: any[], prices: any[] }} data
   * @param {number} userLat
   * @param {number} userLon
   * @param {string} neededStr
   * @param {string} economyStr
   */
  const processAndRank = useCallback(async (data: FuelApiData, userLat: number, userLon: number, neededStr: string, economyStr: string): Promise<number> => {
    const requestId = ++latestRankingRequestIdRef.current;
    const { stations, prices } = data;
    
    // Parse user settings, fallback to defaults if empty
    const neededLiters = sanitizePositiveNumber(neededStr, 50);
    const economyLper100km = sanitizePositiveNumber(economyStr, 8.0);
    const litersPerKm = economyLper100km / 100;

    // Nearby endpoint is sorted by price, so route only the best subset for speed.
    const routeCandidateStations = stations.slice(0, MAX_ROUTE_CALCULATIONS);
    const priceByStationCode = new Map(prices.map((p) => [String(p.stationcode), p]));

    // Fast path: use nearby API distance to avoid expensive per-station route calls.
    const rankedCandidates = routeCandidateStations.map<RankedStation | null>((station) => {
      const stationPriceInfo = priceByStationCode.get(String(station.code));
      if (!stationPriceInfo || !Number.isFinite(stationPriceInfo.price)) {
        return null;
      }

      const nearbyDistance = station.location.distance;
      const route = Number.isFinite(nearbyDistance)
        ? {
            distanceKm: Math.max(nearbyDistance as number, 0.1),
            durationMin: (Math.max(nearbyDistance as number, 0.1) / AVG_CITY_SPEED_KMH) * 60
          }
        : estimateRoute(userLat, userLon, station.location.latitude, station.location.longitude);

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
      return -1;
    }

    // Filter out invalid routing results.
    const mergedList = rankedCandidates.filter((item): item is RankedStation => item !== null);

    // Sort by lowest total effective cost
    mergedList.sort((a, b) => a.totalCostDollars - b.totalCostDollars);

    // Keep top 5
    const topStations = mergedList.slice(0, 5);
    if (topStations.length > 0) {
      setRankedStations(topStations);
    }
    setLoading(false);
    return topStations.length;
  }, []);

  /**
   * @param {number} userLat
   * @param {number} userLon
   * @param {string} needed
   * @param {string} economy
   */
  const fetchAndRankFuelData = useCallback(async (
    userLat: number,
    userLon: number,
    needed: string,
    economy: string,
    fuelTypeInput: string,
    brandsInput: string[]
  ) => {
    try {
      const requestFuelType = normalizeFuelType(fuelTypeInput);
      const requestBrands = normalizeBrands(brandsInput);

      // 1. Get the dynamic Bearer Token automatically
      const accessToken = await getAccessToken();

      // 2. Search progressively wider radii until we have enough stations.
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

      if (ALLOW_MOCK_FALLBACK) {
        const mockData = generateMockData(userLat, userLon);
        setApiData(mockData);
        await processAndRank(mockData, userLat, userLon, needed, economy);
      } else {
        setLoading(false);
        setErrorMsg(`Live data failed: ${liveError}`);
      }
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
        await fetchAndRankFuelData(location.coords.latitude, location.coords.longitude, '50', '8.0', DEFAULT_FUEL_TYPE, []);
      } catch (err) {
        setErrorMsg(getErrorMessage(err, 'An error occurred while initializing.'));
        setLoading(false);
      }
    })();
  }, [fetchAndRankFuelData]);

  // --- Handlers ---
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
    setLoading(true); // Show loader while calculating/fetching

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
      setLoading(true); // Show loader while fetching new routes
      processAndRank(
        apiData, 
        userLocation.coords.latitude, 
        userLocation.coords.longitude, 
        fuelNeeded, 
        fuelEconomy
      ).then((rankedCount) => {
        if (rankedCount === -1) {
          return;
        }
        if (rankedCount === 0) {
          if (ALLOW_MOCK_FALLBACK) {
            const fallbackData = generateMockData(userLocation.coords.latitude, userLocation.coords.longitude);
            setApiData(fallbackData);
            processAndRank(
              fallbackData,
              userLocation.coords.latitude,
              userLocation.coords.longitude,
              fuelNeeded,
              fuelEconomy
            );
          } else {
            setLoading(false);
            setErrorMsg('No rankable stations found for current settings. Previous results are still shown.');
          }
        }
      });
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
      const next = prev.includes(brand)
        ? prev.filter((value) => value !== brand)
        : [...prev, brand];

      return BRAND_OPTIONS.filter((option) => next.includes(option));
    });
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Fuel Optimiser</Text>
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

        {/* Settings Modal */}
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
    backgroundColor: '#eef2f7',
  },
  header: {
    padding: 20,
    paddingBottom: 18,
    backgroundColor: '#fbfdff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbe5ef',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 6,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  fuelTypeBadge: {
    backgroundColor: '#e0edff',
    borderColor: '#b7d2ff',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fuelTypeBadgeText: {
    color: '#0b4bb3',
    fontSize: 12,
    fontWeight: '700',
  },
  metaHint: {
    marginLeft: 8,
    fontSize: 12,
    color: '#64748b',
  },
  settingsButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8eef7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1dbea',
  },
  settingsIcon: {
    fontSize: 19,
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
    color: '#334155',
  },
  errorText: {
    color: '#b42318',
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    padding: 16,
    paddingBottom: 10,
  },
  emptyText: {
    marginTop: 24,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
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
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  rankBadge: {
    backgroundColor: '#0b67d1',
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  stationInfo: {
    flex: 1,
  },
  stationAddress: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#edf2f7',
    paddingTop: 12,
  },
  statBox: {
    flex: 1,
    paddingRight: 8,
  },
  highlightBox: {
    alignItems: 'flex-end',
    paddingRight: 0,
  },
  statLabel: {
    fontSize: 12,
    color: '#7b8ba1',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#243447',
  },
  costValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f7a40',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
    color: '#1e293b',
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c5d4e6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#f8fbff',
  },
  fuelTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  fuelTypeChip: {
    borderWidth: 1,
    borderColor: '#c2cfdf',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#f8fbff',
  },
  fuelTypeChipSelected: {
    borderColor: '#0b67d1',
    backgroundColor: '#e7f1ff',
  },
  fuelTypeChipText: {
    color: '#516273',
    fontSize: 13,
    fontWeight: '600',
  },
  fuelTypeChipTextSelected: {
    color: '#0b67d1',
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
    elevation: 3,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  }
});
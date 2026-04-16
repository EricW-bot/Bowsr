export type Station = {
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

export type Price = {
  stationcode: string;
  fueltype?: string;
  price: number;
  lastupdated?: string;
  state?: string;
};

export type FuelApiData = {
  stations: Station[];
  prices: Price[];
};

export type RouteMetrics = {
  distanceKm: number;
  durationMin: number;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type AppMode = 'roundTrip' | 'oneWay';
export type AppTab = 'prices' | 'settings';

export type TabDefinition = {
  key: AppTab;
  label: string;
  icon: 'pricetag-outline' | 'settings-outline';
};

export type RankedStation = Station & {
  priceCents: number;
  distanceKm: number;
  durationMin: number;
  totalCostDollars: number;
  baselineTripKm?: number;
  tripWithStopKm?: number;
  detourKm?: number;
};

export type ExpoMapMarker = {
  id: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  title?: string;
  snippet?: string;
};

export type ExpoMapPolyline = {
  id: string;
  coordinates: {
    latitude: number;
    longitude: number;
  }[];
  color?: string;
  width?: number;
};

export type MapCameraPosition = {
  coordinates: Coordinates;
  zoom: number;
};

export type SettingsSnapshot = {
  appMode: AppMode;
  useCurrentLocation: boolean;
  fuelNeeded: string;
  fuelEconomy: string;
  fuelType: string;
  selectedBrands: string[];
  tripStartAddress: string;
  tripDestinationAddress: string;
};

export type SettingsSnapshotInput = {
  appMode: AppMode;
  useCurrentLocation: boolean;
  fuelNeeded: string;
  fuelEconomy: string;
  fuelType: string;
  selectedBrands: string[];
  tripStartAddress: string;
  tripDestinationAddress: string;
};

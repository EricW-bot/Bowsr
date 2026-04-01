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

export type RankedStation = Station & {
  priceCents: number;
  distanceKm: number;
  durationMin: number;
  totalCostDollars: number;
  baselineTripKm?: number;
  tripWithStopKm?: number;
  detourKm?: number;
};

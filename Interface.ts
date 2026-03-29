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

export type RankedStation = Station & {
  priceCents: number;
  distanceKm: number;
  durationMin: number;
  totalCostDollars: number;
};

import { Platform } from 'react-native';
import type { RankedStation } from './Interface';

export const LOCATION_TIMEOUT_MS = 15000;
export const LIVE_DATA_TIMEOUT_MS = 180000;

export function getTripAddressMissingMessage(
  startAddress: string,
  destinationAddress: string,
  useGpsForStart: boolean
): string | null {
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
}

export function getRoundTripStartMissingMessage(startAddress: string, useGpsForStart: boolean): string | null {
  if (useGpsForStart || startAddress.trim().length > 0) {
    return null;
  }
  return 'Round-trip mode needs a start address when GPS start is off. Please set Start Address in Settings.';
}

export function buildWebMapEmbedUrl(
  stationLatitude: number,
  stationLongitude: number,
  currentLocation?: { latitude: number; longitude: number } | null
): string {
  const station = `${stationLatitude},${stationLongitude}`;
  if (currentLocation) {
    const origin = `${currentLocation.latitude},${currentLocation.longitude}`;
    return `https://maps.google.com/maps?output=embed&saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(station)}`;
  }
  return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(station)}`;
}

export function buildExternalMapUrl(station: RankedStation, platformOs: string = Platform.OS): string {
  const { latitude, longitude } = station.location;
  const label = encodeURIComponent(station.name);
  const query = `${latitude},${longitude}`;
  return platformOs === 'ios'
    ? `https://maps.apple.com/?ll=${query}&q=${label}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

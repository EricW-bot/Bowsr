/* eslint-disable import/first */
const storage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (key in storage ? storage[key] : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    storage[key] = value;
  })
}));

import { loadUserPreferences, saveUserPreferences } from '../preferencesStorage';

describe('preferences storage integration', () => {
  beforeEach(() => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
  });

  it('saves and reloads partial preferences with defaults merged', async () => {
    await saveUserPreferences({
      appMode: 'oneWay',
      fuelNeeded: '40',
      tripStartAddress: '1 Test St',
      tripDestinationAddress: '2 Destination Rd'
    });

    const loaded = await loadUserPreferences();
    expect(loaded.appMode).toBe('oneWay');
    expect(loaded.fuelNeeded).toBe('40');
    expect(loaded.fuelEconomy).toBe('10.0');
    expect(loaded.tripStartAddress).toBe('1 Test St');
    expect(loaded.tripDestinationAddress).toBe('2 Destination Rd');
  });

  it('migrates legacy tripDestinationLabel into tripDestinationAddress', async () => {
    storage['fuelnearme.preferences'] = JSON.stringify({
      appMode: 'oneWay',
      tripDestinationLabel: 'Legacy Destination'
    });

    const loaded = await loadUserPreferences();
    expect(loaded.tripDestinationAddress).toBe('Legacy Destination');
  });

  it('recovers defaults from malformed storage JSON', async () => {
    storage['fuelnearme.preferences'] = '{invalid-json';
    const loaded = await loadUserPreferences();
    expect(loaded.appMode).toBe('roundTrip');
    expect(loaded.fuelType).toBe('E10');
  });

  it('coerces invalid shapes/types to safe defaults', async () => {
    storage['fuelnearme.preferences'] = JSON.stringify({
      appMode: 'unknown-mode',
      fuelType: 'BOGUS',
      selectedBrands: ['Shell', 'NotARealBrand'],
      tripStart: { latitude: 'bad', longitude: 'bad' },
      useCurrentLocation: 'yes'
    });
    const loaded = await loadUserPreferences();
    expect(loaded.appMode).toBe('roundTrip');
    expect(loaded.fuelType).toBe('E10');
    expect(loaded.selectedBrands).toEqual(['Shell']);
    expect(loaded.tripStart).toEqual({ latitude: -34.0429, longitude: 150.8156 });
    expect(loaded.useCurrentLocation).toBe(true);
  });
});

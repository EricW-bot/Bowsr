import {
  buildExternalMapUrl,
  buildWebMapEmbedUrl,
  getRoundTripStartMissingMessage,
  getTripAddressMissingMessage
} from '../appHelpers';
import type { RankedStation } from '../Interface';

describe('appHelpers', () => {
  it('reports missing one-way addresses correctly', () => {
    expect(getTripAddressMissingMessage('12 King St', '34 Queen St', false)).toBeNull();
    expect(getTripAddressMissingMessage('', '34 Queen St', false)).toContain('start address');
    expect(getTripAddressMissingMessage('', '', false)).toContain('start address and destination address');
    expect(getTripAddressMissingMessage('', '34 Queen St', true)).toBeNull();
  });

  it('reports missing round-trip start address only when GPS is off', () => {
    expect(getRoundTripStartMissingMessage('12 King St', false)).toBeNull();
    expect(getRoundTripStartMissingMessage('', true)).toBeNull();
    expect(getRoundTripStartMissingMessage('', false)).toContain('Round-trip mode needs a start address');
  });

  it('builds web embed URL with or without current location', () => {
    const withCurrent = buildWebMapEmbedUrl(-33.86, 151.2, { latitude: -33.9, longitude: 151.21 });
    expect(withCurrent).toContain('output=embed');
    expect(withCurrent).toContain('saddr=');
    expect(withCurrent).toContain('daddr=');

    const withoutCurrent = buildWebMapEmbedUrl(-33.86, 151.2, null);
    expect(withoutCurrent).toContain('output=embed');
    expect(withoutCurrent).toContain('q=');
    expect(withoutCurrent).not.toContain('saddr=');
  });

  it('builds external map URLs per platform', () => {
    const station = {
      code: '123',
      name: 'Test Station',
      location: { latitude: -33.86, longitude: 151.2 },
      priceCents: 199.9,
      distanceKm: 5,
      durationMin: 10,
      totalCostDollars: 52
    } as RankedStation;

    const iosUrl = buildExternalMapUrl(station, 'ios');
    const androidUrl = buildExternalMapUrl(station, 'android');

    expect(iosUrl).toContain('https://maps.apple.com/');
    expect(androidUrl).toContain('https://www.google.com/maps/search/');
  });
});

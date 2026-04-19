const trim = (value) => {
  const raw = String(value ?? '').trim();
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
};

module.exports = () => {
  const androidGoogleMapsApiKey = trim(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY);

  const iosLocationPurpose =
    'OnlyFuel uses your location to find fuel stations near you and to show your trip on the map. For example, when you choose "Use my location," we use your coordinates to list nearby stations by distance and to set your trip start point.';

  return {
    name: 'OnlyFuel',
    slug: 'FuelNearMe',
    scheme: 'fuelnearme',
    version: '2.1.1',
    orientation: 'portrait',
    icon: './assets/logo.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/logo.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/logo.png',
        backgroundImage: './assets/logo.png',
        monochromeImage: './assets/logo.png'
      },
      predictiveBackGestureEnabled: false,
      package: 'com.pickradmin.bowsr',
      config: {
        googleMaps: {
          apiKey: androidGoogleMapsApiKey
        }
      }
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pickradmin.bowsr',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    web: {
      favicon: './assets/logo.png'
    },
    extra: {
      eas: {
        projectId: 'ef898ff9-95fc-4a39-91e4-77cfdbd01c39'
      }
    },
    plugins: [
      [
        'expo-maps',
        {
          requestLocationPermission: true,
          locationPermission: iosLocationPurpose
        }
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: iosLocationPurpose,
          locationWhenInUsePermission: iosLocationPurpose
        }
      ],
      'expo-font',
      'expo-router'
    ]
  };
};

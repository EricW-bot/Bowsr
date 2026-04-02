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

  return {
    name: 'Bowsr',
    slug: 'FuelNearMe',
    version: '1.0.0',
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
          locationPermission: 'Allow Bowsr to use your location'
        }
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Allow Bowsr to use your location'
        }
      ],
      'expo-font'
    ]
  };
};

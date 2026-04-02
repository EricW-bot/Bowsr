const appJson = require('./app.json');

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
  const base = appJson.expo;
  const androidGoogleMapsApiKey = trim(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY);
  const iosGoogleMapsApiKey = trim(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY);

  return {
    ...base,
    android: {
      ...base.android,
      config: {
        ...(base.android?.config ?? {}),
        googleMaps: {
          ...((base.android?.config && base.android.config.googleMaps) || {}),
          apiKey: androidGoogleMapsApiKey
        }
      }
    },
    ios: {
      ...base.ios,
      config: {
        ...(base.ios?.config ?? {}),
        googleMapsApiKey: iosGoogleMapsApiKey
      }
    },
    plugins: [
      'expo-font',
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey,
          iosGoogleMapsApiKey
        }
      ]
    ]
  };
};

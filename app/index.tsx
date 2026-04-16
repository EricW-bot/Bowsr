import React, { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import App from '../App';
import { getSettingsVersion, subscribeSettingsVersion } from '../settingsSync';

export default function PricesRoute() {
  const settingsVersion = useSyncExternalStore(subscribeSettingsVersion, getSettingsVersion);

  return (
    <App
      key={settingsVersion}
      initialTab="prices"
      hideBottomNav
      onNavigateToTab={(tab) => {
        if (tab === 'settings') {
          router.push('/settings');
        }
      }}
    />
  );
}

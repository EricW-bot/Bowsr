import React from 'react';
import { router } from 'expo-router';
import App from '../App';
import { bumpSettingsVersion } from '../settingsSync';

export default function SettingsRoute() {
  return (
    <App
      initialTab="settings"
      hideBottomNav
      onNavigateToTab={(tab) => {
        if (tab === 'prices') {
          router.push('/');
        }
      }}
      onSettingsSaved={bumpSettingsVersion}
    />
  );
}

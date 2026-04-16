import React from 'react';
import { router, useFocusEffect } from 'expo-router';
import App from '../App';
import { useCallback, useState } from 'react';

export default function PricesRoute() {
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((prev) => prev + 1);
    }, [])
  );

  return (
    <App
      key={refreshKey}
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

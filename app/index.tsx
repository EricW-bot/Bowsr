import React from 'react';
import { router } from 'expo-router';
import App from '../App';

export default function PricesRoute() {
  return (
    <App
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

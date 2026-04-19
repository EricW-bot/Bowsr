import React from 'react';
import { useColorScheme } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  // Define your active and inactive colours
  const selectedColor = colorScheme === 'dark' ? 'white' : 'black';
  const unselectedColor = colorScheme === 'dark' ? '#8E8E93' : '#8E8E93'; 

  return (
    <NativeTabs
      // 1. Replaced the crashing 'tintColor' prop with 'iconColor'
      iconColor={{ default: unselectedColor, selected: selectedColor }}
      labelStyle={{ color: selectedColor }}
      // 2. Explicitly ensure the background doesn't overwrite the liquid glass
      backgroundColor="transparent" 
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'tag', selected: 'tag.fill' }} md="local_gas_station" />
        <NativeTabs.Trigger.Label>Prices</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

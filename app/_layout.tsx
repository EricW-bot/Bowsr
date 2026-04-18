import React from 'react';
import { useColorScheme } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const tintColor = colorScheme === 'dark' ? 'white' : 'black';

  return (
    <NativeTabs
      tintColor={tintColor}
      labelStyle={{ color: tintColor }}
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

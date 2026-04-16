import React from 'react';
import { DynamicColorIOS, Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function RootLayout() {
  return (
    <NativeTabs
      tintColor={
        Platform.OS === 'ios'
          ? DynamicColorIOS({
              dark: 'white',
              light: 'black'
            })
          : undefined
      }
      labelStyle={
        Platform.OS === 'ios'
          ? {
              color: DynamicColorIOS({
                dark: 'white',
                light: 'black'
              })
            }
          : undefined
      }
      disableTransparentOnScrollEdge
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

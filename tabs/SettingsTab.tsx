import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type SettingsTabProps = {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function SettingsTab({ style, children }: SettingsTabProps) {
  return <View style={style}>{children}</View>;
}

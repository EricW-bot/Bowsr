import React, { ReactNode } from 'react';
import { View, Platform, StyleProp, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';


export const canUseLiquidGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

interface ThemedGlassViewProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  glassEffectStyle?: any;
  fallbackStyle?: StyleProp<ViewStyle>;
}

export function ThemedGlassView({
  children,
  style,
  glassEffectStyle = 'systemMaterial',
  fallbackStyle,
}: ThemedGlassViewProps) {
  if (canUseLiquidGlass) {
    return (
      <GlassView glassEffectStyle={glassEffectStyle} style={style}>
        {children}
      </GlassView>
    );
  }

  if (fallbackStyle === undefined) {
    return null;
  }

  return (
    <View style={fallbackStyle !== undefined ? fallbackStyle : style}>
      {children}
    </View>
  );
}

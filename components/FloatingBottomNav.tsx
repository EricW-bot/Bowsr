import React from 'react';
import { Text, TouchableOpacity, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import type { AppTab, TabDefinition } from '../Interface';

type FloatingBottomNavStyles = {
  bottomNavOuter: StyleProp<ViewStyle>;
  bottomNavGlass: StyleProp<ViewStyle>;
  bottomNavFallback: StyleProp<ViewStyle>;
  bottomNavItem: StyleProp<ViewStyle>;
  bottomNavItemSelected: StyleProp<ViewStyle>;
  bottomNavItemText: StyleProp<TextStyle>;
};

type FloatingBottomNavProps = {
  tabs: TabDefinition[];
  activeTab: AppTab;
  onTabPress: (tab: AppTab) => void;
  canUseLiquidGlass: boolean;
  bottomInset: number;
  selectedColor: string;
  unselectedColor: string;
  styles: FloatingBottomNavStyles;
};

export function FloatingBottomNav({
  tabs,
  activeTab,
  onTabPress,
  canUseLiquidGlass,
  bottomInset,
  selectedColor,
  unselectedColor,
  styles
}: FloatingBottomNavProps) {
  const buttons = tabs.map((tab) => {
    const selected = activeTab === tab.key;
    return (
      <TouchableOpacity
        key={tab.key}
        onPress={() => onTabPress(tab.key)}
        style={[styles.bottomNavItem, selected && styles.bottomNavItemSelected]}
        accessibilityRole="button"
        accessibilityLabel={tab.label}
      >
        <Ionicons name={tab.icon} size={20} color={selected ? selectedColor : unselectedColor} />
        {selected ? <Text style={styles.bottomNavItemText}>{tab.label}</Text> : null}
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.bottomNavOuter, { paddingBottom: bottomInset }]}>
      {canUseLiquidGlass ? (
        <GlassView style={styles.bottomNavGlass} glassEffectStyle="regular">
          {buttons}
        </GlassView>
      ) : (
        <View style={styles.bottomNavFallback}>{buttons}</View>
      )}
    </View>
  );
}

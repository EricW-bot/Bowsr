import React from 'react';
import { Text, TouchableOpacity, View, useColorScheme, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedGlassView } from './ThemedGlassView';
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
  bottomInset: number;
  selectedColor: string;
  unselectedColor: string;
  styles: FloatingBottomNavStyles;
};

export function FloatingBottomNav({
  tabs,
  activeTab,
  onTabPress,
  bottomInset,
  selectedColor,
  unselectedColor,
  styles
}: FloatingBottomNavProps) {
  const colorScheme = useColorScheme();
  const selectedTextColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

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
        <Text style={[styles.bottomNavItemText, { color: selected ? selectedTextColor : unselectedColor }]}>{tab.label}</Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.bottomNavOuter, { paddingBottom: bottomInset }]}>
      <ThemedGlassView style={styles.bottomNavGlass} glassEffectStyle="regular" fallbackStyle={styles.bottomNavFallback}>
        {buttons}
      </ThemedGlassView>
    </View>
  );
}

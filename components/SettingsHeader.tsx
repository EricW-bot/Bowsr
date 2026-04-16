import React from 'react';
import { Text, TouchableOpacity, View, type TextStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import type { createThemedStyles } from '../theme';

type SettingsHeaderProps = {
  hasPendingSettingsChanges: boolean;
  isSavingSettings: boolean;
  canUseLiquidGlass: boolean;
  themeMode: 'light' | 'dark';
  styles: ReturnType<typeof createThemedStyles>;
  onSave: () => void;
};

export function SettingsHeader({
  hasPendingSettingsChanges,
  isSavingSettings,
  canUseLiquidGlass,
  themeMode,
  styles,
  onSave
}: SettingsHeaderProps) {
  if (!hasPendingSettingsChanges) {
    return (
      <View style={styles.settingsHeaderRow}>
        <View style={styles.settingsHeaderTextWrap}>
          <Text style={styles.title}>Preferences</Text>
          <Text style={styles.subtitle}>Scroll to see all options.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.settingsHeaderRow}>
      <View style={styles.settingsHeaderTextWrap}>
        <Text style={styles.title}>Preferences</Text>
        <Text style={styles.subtitle}>Scroll to see all options.</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Save settings"
        onPress={onSave}
        disabled={isSavingSettings}
        style={styles.headerSaveButton}
      >
        {isSavingSettings ? (
          canUseLiquidGlass ? (
            <GlassView style={styles.headerSaveGlass} glassEffectStyle="clear">
              <Text style={[styles.headerSaveButtonText, styles.headerSaveButtonTextDisabled]}>Save</Text>
            </GlassView>
          ) : (
            <View style={[styles.headerSaveButtonFallback, styles.headerSaveButtonDisabled]}>
              <Text style={[styles.headerSaveButtonText, styles.headerSaveButtonTextDisabled]}>Save</Text>
            </View>
          )
        ) : canUseLiquidGlass ? (
          <GlassView style={styles.headerSaveGlass} glassEffectStyle="regular">
            <Text
              style={[
                styles.headerSaveButtonText,
                styles.headerSaveButtonTextEnabled,
                themeMode === 'light' ? ({ color: '#000000' } as TextStyle) : null
              ]}
            >
              Save
            </Text>
          </GlassView>
        ) : (
          <View style={[styles.headerSaveButtonFallback, styles.headerSaveButtonEnabled]}>
            <Text style={[styles.headerSaveButtonText, styles.headerSaveButtonTextEnabled]}>Save</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}


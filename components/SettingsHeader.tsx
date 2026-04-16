import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ThemedGlassView } from './ThemedGlassView';
import type { createThemedStyles } from '../theme';

type SettingsHeaderProps = {
  hasPendingSettingsChanges: boolean;
  isSavingSettings: boolean;
  themeMode: 'light' | 'dark';
  styles: ReturnType<typeof createThemedStyles>;
  onSave: () => void;
};

export function SettingsHeader({
  hasPendingSettingsChanges,
  isSavingSettings,
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
        <ThemedGlassView
          style={styles.headerSaveGlass}
          glassEffectStyle={isSavingSettings ? 'clear' : 'regular'}
          fallbackStyle={[
            styles.headerSaveButtonFallback,
            isSavingSettings ? styles.headerSaveButtonDisabled : styles.headerSaveButtonEnabled
          ]}
        >
          {isSavingSettings ? (
            <Text style={[styles.headerSaveButtonText, styles.headerSaveButtonTextDisabled]}>Save</Text>
          ) : (
            <Text
              style={[
                styles.headerSaveButtonText,
                styles.headerSaveButtonTextEnabled,
                themeMode === 'light' ? ({ color: '#000000' } as any) : null
              ]}
            >
              Save
            </Text>
          )}
        </ThemedGlassView>
      </TouchableOpacity>
    </View>
  );
}


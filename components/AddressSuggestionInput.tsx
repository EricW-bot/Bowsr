import React from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import type { AddressSuggestion } from '../clients/geocodingClient';
import type { createThemedStyles } from '../theme';


export type AddressUIModel = {
  value: string;
  isFocused: boolean;
  suggestions: AddressSuggestion[];
  statusText: string;
  statusOk: boolean;
  metaHintText?: string | null;
};

type AddressSuggestionInputProps = {
  ui: AddressUIModel;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder: string;
  placeholderTextColor: string;
  inputStyle: StyleProp<TextStyle>;
  statusOkTextStyle: StyleProp<TextStyle>;
  styles: ReturnType<typeof createThemedStyles>;
  keyPrefix: string;
  onPressInSuggestion?: () => void;
  onSelectSuggestion: (suggestion: AddressSuggestion) => void;
};

export function AddressSuggestionInput({
  ui,
  onChangeText,
  onFocus,
  onBlur,
  placeholder,
  placeholderTextColor,
  inputStyle,
  statusOkTextStyle,
  styles,
  keyPrefix,
  onPressInSuggestion,
  onSelectSuggestion
}: AddressSuggestionInputProps) {
  const showSuggestions = ui.suggestions.length > 0 && (Platform.OS !== 'web' || ui.isFocused);

  return (
    <>
      <TextInput
        style={inputStyle}
        value={ui.value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
      />
      {ui.metaHintText ? <Text style={styles.metaHint}>{ui.metaHintText}</Text> : null}
      {ui.statusText ? (
        <View
          style={[
            styles.addressStatusPill,
            ui.statusOk && styles.addressStatusPillOk,
            ui.suggestions.length === 0 ? { marginBottom: 0 } : null
          ]}
        >
          <Text style={[styles.addressStatusText, ui.statusOk && statusOkTextStyle]}>{ui.statusText}</Text>
        </View>
      ) : null}
      {showSuggestions ? (
        <View style={[styles.suggestionsList, { marginBottom: 0 }]}>
          {ui.suggestions.map((suggestion) => (
            <TouchableOpacity
              key={`${keyPrefix}-${suggestion.id}`}
              style={styles.suggestionItem}
              onPressIn={() => {
                onPressInSuggestion?.();
              }}
              onPress={() => onSelectSuggestion(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </>
  );
}


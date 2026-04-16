import React, { useMemo } from 'react';
import { Keyboard, Platform, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { roundToTwoDecimalPlaces } from '../helpers/numberFormatting';

type RoundedNumericInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  inputStyle?: StyleProp<TextStyle>;
  keyboardAppearance?: 'light' | 'dark';
  keyboardTypeOverrideIOS?: string;
};

export function RoundedNumericInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  inputStyle,
  keyboardAppearance,
  keyboardTypeOverrideIOS
}: RoundedNumericInputProps) {
  const keyboardType = useMemo(() => {
    if (Platform.OS === 'ios') {
      return keyboardTypeOverrideIOS ?? 'numbers-and-punctuation';
    }
    return 'numeric';
  }, [keyboardTypeOverrideIOS]);

  return (
    <TextInput
      style={inputStyle}
      keyboardType={keyboardType as any}
      value={value}
      onChangeText={onChangeText}
      onBlur={() => {
        const rounded = roundToTwoDecimalPlaces(value);
        if (rounded !== value) {
          onChangeText(rounded);
        }
      }}
      returnKeyType="done"
      onSubmitEditing={() => Keyboard.dismiss()}
      keyboardAppearance={keyboardAppearance}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
    />
  );
}


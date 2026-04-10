import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type PricesTabProps = {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function PricesTab({ style, children }: PricesTabProps) {
  return <View style={style}>{children}</View>;
}

export type AppTab = 'prices' | 'settings';

export type TabDefinition = {
  key: AppTab;
  label: string;
  icon: 'pricetag-outline' | 'settings-outline';
};

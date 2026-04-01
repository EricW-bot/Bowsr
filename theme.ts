import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';

type Palette = {
  bg: string;
  headerBg: string;
  headerBorder: string;
  title: string;
  subtitle: string;
  fuelBadgeBg: string;
  fuelBadgeBorder: string;
  fuelBadgeText: string;
  metaHint: string;
  iconButtonBg: string;
  iconButtonBorder: string;
  loadingText: string;
  errorText: string;
  emptyText: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  stationName: string;
  stationAddress: string;
  statsRowBorder: string;
  statLabel: string;
  statValue: string;
  costValue: string;
  modalOverlay: string;
  modalBg: string;
  modalBorder: string;
  modalTitle: string;
  inputLabel: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  placeholder: string;
  chipBg: string;
  chipBorder: string;
  chipSelectedBorder: string;
  chipSelectedBg: string;
  chipText: string;
  chipTextSelected: string;
  routingLiveBg: string;
  routingLiveBorder: string;
  routingLiveText: string;
  routingEstimatedBg: string;
  routingEstimatedBorder: string;
  routingEstimatedText: string;
  primary: string;
  primaryMuted: string;
};

const light: Palette = {
  bg: '#eef2f7',
  headerBg: '#fbfdff',
  headerBorder: '#dbe5ef',
  title: '#0f172a',
  subtitle: '#475569',
  fuelBadgeBg: '#e0edff',
  fuelBadgeBorder: '#b7d2ff',
  fuelBadgeText: '#0b4bb3',
  metaHint: '#64748b',
  iconButtonBg: '#e8eef7',
  iconButtonBorder: '#d1dbea',
  loadingText: '#334155',
  errorText: '#b42318',
  emptyText: '#64748b',
  cardBg: '#ffffff',
  cardBorder: '#d9e4f2',
  cardShadow: '#0f172a',
  stationName: '#1e293b',
  stationAddress: '#64748b',
  statsRowBorder: '#edf2f7',
  statLabel: '#7b8ba1',
  statValue: '#243447',
  costValue: '#1f7a40',
  modalOverlay: 'rgba(15, 23, 42, 0.42)',
  modalBg: '#fdfefe',
  modalBorder: '#dce6f3',
  modalTitle: '#1e293b',
  inputLabel: '#334155',
  inputBg: '#f8fbff',
  inputBorder: '#c5d4e6',
  inputText: '#0f172a',
  placeholder: '#94a3b8',
  chipBg: '#f8fbff',
  chipBorder: '#c2cfdf',
  chipSelectedBorder: '#0b67d1',
  chipSelectedBg: '#e7f1ff',
  chipText: '#516273',
  chipTextSelected: '#0b67d1',
  routingLiveBg: '#e8f7ee',
  routingLiveBorder: '#9fd8b5',
  routingLiveText: '#166534',
  routingEstimatedBg: '#fff4e5',
  routingEstimatedBorder: '#ffd08a',
  routingEstimatedText: '#9a4b00',
  primary: '#0b67d1',
  primaryMuted: '#0066cc'
};

const dark: Palette = {
  bg: '#0f1419',
  headerBg: '#151b24',
  headerBorder: '#2a3544',
  title: '#f1f5f9',
  subtitle: '#94a3b8',
  fuelBadgeBg: '#1e3a5f',
  fuelBadgeBorder: '#2d5a8a',
  fuelBadgeText: '#93c5fd',
  metaHint: '#94a3b8',
  iconButtonBg: '#1e293b',
  iconButtonBorder: '#334155',
  loadingText: '#cbd5e1',
  errorText: '#fca5a5',
  emptyText: '#94a3b8',
  cardBg: '#1a222d',
  cardBorder: '#2a3544',
  cardShadow: '#000000',
  stationName: '#f1f5f9',
  stationAddress: '#94a3b8',
  statsRowBorder: '#2a3544',
  statLabel: '#8899aa',
  statValue: '#e2e8f0',
  costValue: '#4ade80',
  modalOverlay: 'rgba(0, 0, 0, 0.65)',
  modalBg: '#1a222d',
  modalBorder: '#334155',
  modalTitle: '#f1f5f9',
  inputLabel: '#cbd5e1',
  inputBg: '#151b24',
  inputBorder: '#3d4f63',
  inputText: '#f1f5f9',
  placeholder: '#64748b',
  chipBg: '#151b24',
  chipBorder: '#3d4f63',
  chipSelectedBorder: '#60a5fa',
  chipSelectedBg: '#1e3a5f',
  chipText: '#cbd5e1',
  chipTextSelected: '#93c5fd',
  routingLiveBg: '#123025',
  routingLiveBorder: '#276749',
  routingLiveText: '#86efac',
  routingEstimatedBg: '#3a260b',
  routingEstimatedBorder: '#7c4a10',
  routingEstimatedText: '#fbbf24',
  primary: '#3b82f6',
  primaryMuted: '#60a5fa'
};

export function getPalette(mode: ThemeMode): Palette {
  return mode === 'dark' ? dark : light;
}

export function createThemedStyles(c: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg
    },
    header: {
      padding: 20,
      paddingBottom: 18,
      backgroundColor: c.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: c.headerBorder
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'stretch'
    },
    headerRowCompact: {
      gap: 12
    },
    headerMain: {
      flex: 1,
      minWidth: 0,
      paddingRight: 12
    },
    headerActionRail: {
      marginLeft: 4,
      paddingLeft: 10,
      borderLeftWidth: 1,
      borderLeftColor: c.headerBorder,
      justifyContent: 'center'
    },
    headerActionRailCompact: {
      marginLeft: 0,
      paddingLeft: 0,
      borderLeftWidth: 0
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: c.title,
      letterSpacing: 0.2
    },
    subtitle: {
      fontSize: 14,
      color: c.subtitle,
      marginTop: 6
    },
    headerMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10
    },
    summaryChip: {
      borderWidth: 1,
      borderColor: c.chipBorder,
      backgroundColor: c.chipBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    summaryChipText: {
      color: c.chipText,
      fontSize: 12,
      fontWeight: '600'
    },
    routingChipLive: {
      borderColor: c.routingLiveBorder,
      backgroundColor: c.routingLiveBg
    },
    routingChipLiveText: {
      color: c.routingLiveText
    },
    routingChipEstimated: {
      borderColor: c.routingEstimatedBorder,
      backgroundColor: c.routingEstimatedBg
    },
    routingChipEstimatedText: {
      color: c.routingEstimatedText
    },
    routingChipContent: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    routingLiveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22c55e',
      marginRight: 6
    },
    fuelTypeBadge: {
      backgroundColor: c.fuelBadgeBg,
      borderColor: c.fuelBadgeBorder,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    fuelTypeBadgeText: {
      color: c.fuelBadgeText,
      fontSize: 12,
      fontWeight: '700'
    },
    metaHint: {
      fontSize: 12,
      color: c.metaHint
    },
    iconButton: {
      width: 46,
      height: 46,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: c.iconButtonBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.iconButtonBorder
    },
    centerBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: c.loadingText
    },
    errorText: {
      color: c.errorText,
      fontSize: 16,
      textAlign: 'center'
    },
    listContainer: {
      flex: 1,
      padding: 16,
      paddingBottom: 10
    },
    resultsListContent: {
      paddingBottom: 6
    },
    emptyText: {
      marginTop: 24,
      fontSize: 16,
      color: c.emptyText,
      textAlign: 'center'
    },
    card: {
      backgroundColor: c.cardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 16,
      marginBottom: 16,
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 3
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14
    },
    rankBadge: {
      backgroundColor: c.primary,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12
    },
    rankText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14
    },
    stationName: {
      fontSize: 16,
      fontWeight: '700',
      color: c.stationName,
      flex: 1
    },
    stationInfo: {
      flex: 1
    },
    stationAddress: {
      marginTop: 4,
      fontSize: 13,
      color: c.stationAddress,
      lineHeight: 18
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.statsRowBorder,
      paddingTop: 12
    },
    statLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4
    },
    statBox: {
      flex: 1,
      paddingRight: 8
    },
    highlightBox: {
      alignItems: 'flex-end',
      paddingRight: 0
    },
    statLabel: {
      fontSize: 12,
      color: c.statLabel,
      marginBottom: 4
    },
    statValue: {
      fontSize: 15,
      fontWeight: '500',
      color: c.statValue
    },
    costValue: {
      fontSize: 20,
      fontWeight: '800',
      color: c.costValue
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.modalOverlay,
      justifyContent: 'flex-end',
      alignItems: 'center',
      padding: 14
    },
    modalKeyboardWrap: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end'
    },
    modalContent: {
      backgroundColor: c.modalBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
      borderWidth: 1,
      borderColor: c.modalBorder,
      padding: 18,
      width: '100%',
      maxWidth: 400,
      maxHeight: '92%',
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 18,
      elevation: 5
    },
    modalScroll: {
      flexGrow: 0
    },
    modalScrollContent: {
      paddingBottom: 14,
      gap: 12
    },
    settingsSection: {
      borderWidth: 1,
      borderColor: c.modalBorder,
      borderRadius: 12,
      padding: 14,
      backgroundColor: c.inputBg
    },
    settingsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10
    },
    settingsSectionTitle: {
      color: c.title,
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 0,
      letterSpacing: 0.2
    },
    modalHandle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 999,
      backgroundColor: c.chipBorder,
      marginBottom: 10
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    },
    modalTitleWrap: {
      flex: 1,
      marginHorizontal: 8
    },
    modalCloseButton: {
      width: 34,
      height: 34,
      borderWidth: 1,
      borderColor: c.iconButtonBorder,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconButtonBg
    },
    modalFooter: {
      borderTopWidth: 1,
      borderTopColor: c.modalBorder,
      marginTop: 8,
      paddingTop: 12
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 0,
      color: c.modalTitle,
      textAlign: 'left'
    },
    modalSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: c.metaHint
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: c.inputLabel,
      marginBottom: 8
    },
    input: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      marginBottom: 12,
      backgroundColor: c.inputBg,
      color: c.inputText
    },
    inlineInputsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 12
    },
    inlineInputCol: {
      flex: 1
    },
    inlineInputLabel: {
      minHeight: 36
    },
    inlineInput: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      marginBottom: 0,
      backgroundColor: c.inputBg,
      color: c.inputText
    },
    fuelTypeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 12
    },
    sourceToggleRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12
    },
    sourceToggleButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.chipBorder,
      borderRadius: 10,
      backgroundColor: c.chipBg,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center'
    },
    sourceToggleButtonSelected: {
      borderColor: c.chipSelectedBorder,
      backgroundColor: c.chipSelectedBg
    },
    sourceToggleText: {
      color: c.chipText,
      fontSize: 13,
      fontWeight: '700'
    },
    sourceToggleTextSelected: {
      color: c.chipTextSelected
    },
    modeCardRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      marginBottom: 12
    },
    modeCard: {
      flex: 1,
      minHeight: 100,
      borderWidth: 1,
      borderColor: c.chipBorder,
      borderRadius: 12,
      backgroundColor: c.chipBg,
      padding: 12,
      justifyContent: 'center'
    },
    modeCardSelected: {
      borderColor: c.chipSelectedBorder,
      backgroundColor: c.chipSelectedBg
    },
    modeCardTitle: {
      color: c.chipText,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 6
    },
    modeCardHint: {
      color: c.chipText,
      fontSize: 12,
      marginTop: 4
    },
    fuelTypeChip: {
      borderWidth: 1,
      borderColor: c.chipBorder,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: c.chipBg
    },
    fuelTypeChipSelected: {
      borderColor: c.chipSelectedBorder,
      backgroundColor: c.chipSelectedBg
    },
    fuelTypeChipText: {
      color: c.chipText,
      fontSize: 13,
      fontWeight: '600'
    },
    fuelTypeChipTextSelected: {
      color: c.chipTextSelected
    },
    suggestionsList: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      backgroundColor: c.inputBg,
      marginTop: 0,
      marginBottom: 12,
      overflow: 'hidden'
    },
    addressStatusPill: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: c.chipBorder,
      backgroundColor: c.chipBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 0,
      marginBottom: 10
    },
    addressStatusPillOk: {
      borderColor: c.chipSelectedBorder,
      backgroundColor: c.chipSelectedBg
    },
    addressStatusText: {
      color: c.chipText,
      fontSize: 12,
      fontWeight: '600'
    },
    addressStatusTextOk: {
      color: c.chipTextSelected
    },
    suggestionItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.statsRowBorder
    },
    suggestionText: {
      color: c.inputText,
      fontSize: 13
    },
    saveButton: {
      backgroundColor: c.primary,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 0,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 3
    },
    saveButtonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800'
    }
  });
}

import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';

type Palette = {
  bg: string;
  headerOverlayBg: string;
  headerBorder: string;
  title: string;
  subtitle: string;
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
  primary: string;
  primaryMuted: string;
};

const light: Palette = {
  bg: '#eef2f7',
  headerOverlayBg: 'rgba(238, 242, 247, 0.72)',
  headerBorder: '#dbe5ef',
  title: '#0f172a',
  subtitle: '#475569',
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
  primary: '#0b67d1',
  primaryMuted: '#0066cc'
};

const dark: Palette = {
  bg: '#0f1419',
  headerOverlayBg: 'rgba(15, 20, 25, 0.72)',
  headerBorder: '#2a3544',
  title: '#f1f5f9',
  subtitle: '#94a3b8',
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
    headerOverlayContainer: {
      position: 'absolute',
      top: 20,
      left: 14,
      right: 14,
      zIndex: 20
    },
    headerPlainContent: {
      paddingHorizontal: 2,
      paddingVertical: 2,
      paddingTop: 10,
      paddingBottom: 8,
    },
    headerVignette: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 10
    },
    title: {
      fontSize: 36,
      fontWeight: '800',
      color: c.title,
      letterSpacing: 0.2
    },
    subtitle: {
      fontSize: 14,
      color: c.subtitle,
      marginTop: 6
    },
    summarySingleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 6
    },
    summaryChip: {
      borderWidth: 1,
      borderColor: c.chipBorder,
      backgroundColor: c.chipBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    summaryChipGlass: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4
    },
    summaryChipText: {
      color: c.chipText,
      fontSize: 12,
      fontWeight: '600'
    },
    metaHint: {
      fontSize: 12,
      color: c.metaHint
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
    resultsListContentEmpty: {
      flexGrow: 1
    },
    emptyText: {
      marginTop: 24,
      fontSize: 16,
      color: c.emptyText,
      textAlign: 'center'
    },
    cardShell: {
      borderRadius: 12,
      marginBottom: 14
    },
    cardTouchable: {
      borderRadius: 12
    },
    cardGlass: {
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.cardBorder,
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 3
    },
    cardGlassBackground: {
      ...StyleSheet.absoluteFill
    },
    cardContent: {
      padding: 14
    },
    card: {
      backgroundColor: c.cardBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      padding: 14,
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
    settingsPageWrap: {
      flex: 1
    },
    settingsPageScroll: {
      flex: 1,
      paddingHorizontal: 16
    },
    settingsPageContent: {
      paddingTop: 8,
      gap: 12
    },
    settingsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    },
    settingsHeaderTextWrap: {
      flex: 1,
      minWidth: 0
    },
    headerSaveButton: {
      minWidth: 82,
      height: 30,
      borderRadius: 999,
      overflow: 'hidden'
    },
    headerSaveGlass: {
      flex: 1,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12
    },
    headerSaveButtonFallback: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10
    },
    headerSaveButtonEnabled: {
      backgroundColor: c.chipSelectedBg,
      borderColor: c.chipSelectedBorder
    },
    headerSaveButtonDisabled: {
      backgroundColor: c.chipBg,
      borderColor: c.chipBorder
    },
    headerSaveButtonText: {
      fontSize: 12,
      fontWeight: '600'
    },
    headerSaveButtonTextEnabled: {
      color: c.chipTextSelected
    },
    headerSaveButtonTextDisabled: {
      color: c.chipText
    },
    settingsSection: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 12,
      padding: 14,
      backgroundColor: c.cardBg,
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 2,
      marginBottom: 5
    },
    settingsSectionGlass: {
      borderWidth: 1,
      borderColor: c.cardBorder,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 2
    },
    settingsSectionGlassBackground: {
      ...StyleSheet.absoluteFill
    },
    settingsSectionContent: {
      padding: 14
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
    bottomNavOuter: {
      position: 'absolute',
      alignSelf: 'center',
      bottom: 0
    },
    bottomNavGlass: {
      minHeight: 58,
      minWidth: 224,
      borderRadius: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      gap: 6
    },
    bottomNavFallback: {
      minHeight: 58,
      minWidth: 224,
      borderRadius: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      gap: 6,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.cardBg,
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 14,
      elevation: 8
    },
    bottomNavItem: {
      minWidth: 82,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center'
    },
    bottomNavItemSelected: {
      backgroundColor: 'transparent'
    },
    bottomNavItemText: {
      marginTop: 4,
      color: c.title,
      fontSize: 12,
      fontWeight: '700'
    },
    mapModalOverlay: {
      flex: 1,
      backgroundColor: c.modalOverlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 18
    },
    mapModalContent: {
      backgroundColor: c.modalBg,
      width: '100%',
      maxWidth: 560,
      height: '78%',
      maxHeight: 680,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.modalBorder,
      overflow: 'hidden',
      shadowColor: c.cardShadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 10
    },
    mapModalGlassBackground: {
      ...StyleSheet.absoluteFill,
      borderRadius: 24
    },
    mapModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: c.modalBorder
    },
    mapModalTitleWrap: {
      flex: 1,
      marginRight: 10
    },
    mapModalTitle: {
      color: c.modalTitle,
      fontSize: 16,
      fontWeight: '800'
    },
    mapModalSubtitle: {
      color: c.metaHint,
      fontSize: 12,
      marginTop: 2
    },
    mapModalCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      overflow: 'hidden'
    },
    mapModalCloseButtonGlass: {
      flex: 1,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center'
    },
    mapModalCloseButtonFallback: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.iconButtonBorder,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconButtonBg
    },
    mapView: {
      flex: 1
    },
    mapWebWrap: {
      flex: 1,
      margin: 12,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.bg
    },
    mapOpenExternalButton: {
      position: 'absolute',
      left: 12,
      top: 12,
      minWidth: 146,
      borderRadius: 999,
      overflow: 'hidden'
    },
    mapOpenExternalButtonGlass: {
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: 'center'
    },
    mapOpenExternalButtonFallback: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: 'center'
    },
    mapOpenExternalButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center'
    },
    mapOpenExternalButtonTextGlass: {
      color: c.primary
    },
    mapUnavailableBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      gap: 10
    },
    mapUnavailableText: {
      color: c.metaHint,
      fontSize: 14,
      textAlign: 'center'
    }
  });
}

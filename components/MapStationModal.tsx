import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { Modal, Platform, Text, TouchableOpacity, View } from 'react-native';
import type {
  AppMode,
  Coordinates,
  ExpoMapMarker,
  ExpoMapPolyline,
  MapCameraPosition,
  RankedStation
} from '../Interface';
import type { LocationObject } from 'expo-location';
import { buildWebMapEmbedUrl, buildWebOneWayMapEmbedUrl } from '../helpers/appHelpers';
import type { createThemedStyles, getPalette } from '../theme';

type MapStationModalProps = {
  visible: boolean;
  mapStation: RankedStation | null;
  canUseLiquidGlass: boolean;
  palette: ReturnType<typeof getPalette>;
  styles: ReturnType<typeof createThemedStyles>;
  appMode: AppMode;
  oneWayStartPoint: Coordinates | null;
  tripDestination: Coordinates;
  userLocation: LocationObject | null;
  AppleMapsView: typeof import('expo-maps').AppleMaps.View | undefined;
  GoogleMapsView: typeof import('expo-maps').GoogleMaps.View | undefined;
  mapCameraPosition: MapCameraPosition;
  mapMarkers: ExpoMapMarker[];
  mapPolylines: ExpoMapPolyline[];
  onClose: () => void;
  onOpenExternal: (station: RankedStation) => void;
};

export function MapStationModal({
  visible,
  mapStation,
  canUseLiquidGlass,
  palette,
  styles,
  appMode,
  oneWayStartPoint,
  tripDestination,
  userLocation,
  AppleMapsView,
  GoogleMapsView,
  mapCameraPosition,
  mapMarkers,
  mapPolylines,
  onClose,
  onOpenExternal
}: MapStationModalProps) {
  const renderExternalButton = (label: string) => {
    return (
      <TouchableOpacity
        style={styles.mapOpenExternalButton}
        onPress={() => {
          if (mapStation) {
            onOpenExternal(mapStation);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {canUseLiquidGlass ? (
          <GlassView style={styles.mapOpenExternalButtonGlass} glassEffectStyle="regular">
            <Text style={[styles.mapOpenExternalButtonText, styles.mapOpenExternalButtonTextGlass]}>{label}</Text>
          </GlassView>
        ) : (
          <View style={styles.mapOpenExternalButtonFallback}>
            <Text style={styles.mapOpenExternalButtonText}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.mapModalOverlay}>
        <View style={styles.mapModalContent}>
          {canUseLiquidGlass ? <GlassView style={styles.mapModalGlassBackground} glassEffectStyle="regular" /> : null}
          <View style={styles.mapModalHeader}>
            <View style={styles.mapModalTitleWrap}>
              <Text style={styles.mapModalTitle}>{mapStation?.name ?? 'Station'}</Text>
              <Text style={styles.mapModalSubtitle}>{mapStation?.address || 'Address unavailable'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.mapModalCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close map"
            >
              {canUseLiquidGlass ? (
                <GlassView style={styles.mapModalCloseButtonGlass} glassEffectStyle="regular">
                  <Ionicons name="close" size={20} color={palette.modalTitle} />
                </GlassView>
              ) : (
                <View style={styles.mapModalCloseButtonFallback}>
                  <Ionicons name="close" size={20} color={palette.modalTitle} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {mapStation && Platform.OS === 'web' ? (
            <View style={styles.mapWebWrap}>
              {React.createElement('iframe', {
                title: `map-${mapStation.code}`,
                src:
                  appMode === 'oneWay' && oneWayStartPoint
                    ? buildWebOneWayMapEmbedUrl(
                        oneWayStartPoint,
                        {
                          latitude: mapStation.location.latitude,
                          longitude: mapStation.location.longitude
                        },
                        tripDestination
                      )
                    : buildWebMapEmbedUrl(
                        mapStation.location.latitude,
                        mapStation.location.longitude,
                        userLocation?.coords
                      ),
                style: {
                  width: '100%',
                  height: '100%',
                  border: 0
                },
                loading: 'lazy'
              })}
              {renderExternalButton('Open in Google Maps')}
            </View>
          ) : mapStation && Platform.OS === 'ios' && AppleMapsView ? (
            <View style={styles.mapWebWrap}>
              <AppleMapsView style={styles.mapView} cameraPosition={mapCameraPosition} markers={mapMarkers} polylines={mapPolylines} />
              {renderExternalButton('Open in Apple Maps')}
            </View>
          ) : mapStation && Platform.OS === 'android' && GoogleMapsView ? (
            <View style={styles.mapWebWrap}>
              <GoogleMapsView style={styles.mapView} cameraPosition={mapCameraPosition} markers={mapMarkers} polylines={mapPolylines} />
              {renderExternalButton('Open in Google Maps')}
            </View>
          ) : (
            <View style={styles.mapUnavailableBox}>
              <Ionicons name="map-outline" size={24} color={palette.metaHint} />
              <Text style={styles.mapUnavailableText}>Map preview is available on iOS and Android builds.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}


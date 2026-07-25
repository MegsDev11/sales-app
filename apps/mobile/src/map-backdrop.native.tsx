import { Platform, StyleSheet, View } from "react-native";
import MapView, { Circle, PROVIDER_DEFAULT } from "react-native-maps";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function MapBackdrop({
  region,
  showUser,
}: {
  region: Region;
  showUser: boolean;
}) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      region={region}
      pitchEnabled={false}
      rotateEnabled={false}
      scrollEnabled={false}
      zoomEnabled={false}
      toolbarEnabled={false}
      showsUserLocation={showUser}
      showsMyLocationButton={false}
      mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
    >
      {showUser ? (
        <Circle
          center={{ latitude: region.latitude, longitude: region.longitude }}
          radius={80}
          fillColor="rgba(33,150,243,0.18)"
          strokeColor="rgba(33,150,243,0.45)"
          strokeWidth={1}
        />
      ) : null}
    </MapView>
  );
}

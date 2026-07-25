import { StyleSheet, View } from "react-native";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Decorative map stand-in (used on web; native overrides with real MapView). */
export function MapBackdrop(_props: { region: Region; showUser: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.mapFallback]}>
      <View style={[styles.road, { top: "28%", left: "10%", width: "80%" }]} />
      <View style={[styles.road, { top: "52%", left: "0%", width: "100%" }]} />
      <View style={[styles.roadV, { left: "38%", top: "8%", height: "84%" }]} />
      <View style={[styles.park, { top: "18%", right: "12%" }]} />
      <View
        style={[styles.park, { bottom: "22%", left: "14%", width: 90, height: 70 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    backgroundColor: "#E8F0E4",
  },
  road: {
    position: "absolute",
    height: 10,
    backgroundColor: "#F3F4F6",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
  },
  roadV: {
    position: "absolute",
    width: 10,
    backgroundColor: "#F3F4F6",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#D1D5DB",
  },
  park: {
    position: "absolute",
    width: 110,
    height: 90,
    borderRadius: 16,
    backgroundColor: "#BBF7D0",
    opacity: 0.85,
  },
});

import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {
  API_PATHS,
  emptyJobCardPayload,
  jobKindLabel,
  listMissingJobCardFields,
  summarizeStockChecklist,
  type FieldJob,
  type JobCardMediaItem,
  type JobCardPayload,
  type JobCardSignature,
  type JobStatus,
} from "@megs/shared";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../../../src/lib/api";
import { formatTravelKm, haversineKm, MEGS_OFFICE } from "../../../src/lib/geo";
import { useAuth } from "../../../src/auth";
import { colors, spacing } from "../../../src/theme";
import {
  FormCard,
  FormTextInput,
  OptionalLabel,
  RequiredLabel,
  SectionHeader,
  SignatureModal,
  SubSectionHeader,
  TapLink,
  YesNoToggle,
} from "../../../src/job-card-form";
import { Loading, StatusChip } from "../../../src/ui";
import { JobNetworkLayoutSection } from "../../../src/ui/job-network-layout";

function mapsUrl(job: FieldJob) {
  if (
    job.locationLat != null &&
    job.locationLng != null &&
    Number.isFinite(job.locationLat) &&
    Number.isFinite(job.locationLng)
  ) {
    const dest = `${job.locationLat},${job.locationLng}`;
    if (Platform.OS === "ios") {
      return `http://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }
  if (job.address?.trim()) {
    const q = encodeURIComponent(job.address.trim());
    if (Platform.OS === "ios") {
      return `http://maps.apple.com/?daddr=${q}&dirflg=d`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }
  return null;
}

function jobTypeGradient(jobType?: string | null): {
  colors: [string, string];
  light: boolean;
} {
  switch (jobType) {
    case "site_maintenance":
      return { colors: ["#34D399", "#059669"], light: false };
    case "install":
      return { colors: ["#A855F7", "#7C3AED"], light: false };
    case "custom_install":
      return { colors: ["#DDD6FE", "#C4B5FD"], light: true };
    case "project":
      return { colors: ["#FDE047", "#FACC15"], light: true };
    case "service_call":
      return { colors: ["#7DD3FC", "#0EA5E9"], light: false };
    case "tower_work":
      return { colors: ["#FBBF24", "#F59E0B"], light: true };
    default:
      return { colors: ["#EC4899", "#A855F7"], light: false };
  }
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "en_route":
      return "En route";
    case "on_site":
      return "On site";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

async function openWhatsAppPrefill(text: string) {
  const q = encodeURIComponent(text);
  const candidates =
    Platform.OS === "web"
      ? [`https://api.whatsapp.com/send?text=${q}`, `https://wa.me/?text=${q}`]
      : [
          `whatsapp://send?text=${q}`,
          `https://api.whatsapp.com/send?text=${q}`,
          `https://wa.me/?text=${q}`,
        ];

  for (const url of candidates) {
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened) return;
        // Popup blocked — navigate current tab
        window.location.href = url;
        return;
      }
      await Linking.openURL(url);
      return;
    } catch {
      /* try next */
    }
  }

  Alert.alert(
    "WhatsApp",
    "Could not open WhatsApp. Copy this message and paste it in MEGS Reporting:\n\n" +
      text
  );
}

function mediaId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowJobStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    jobDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    jobTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function formatOnSiteHours(startedAtIso: string, endedAt = new Date()): string {
  const ms = endedAt.getTime() - new Date(startedAtIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0";
  return Number((ms / 3_600_000).toFixed(2)).toString();
}

async function pickImages(max = 4): Promise<JobCardMediaItem[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      throw new Error("Camera / photo library permission required");
    }
  }

  const choice = await new Promise<"camera" | "library" | null>((resolve) => {
    Alert.alert("Add photo", "Choose source", [
      { text: "Camera", onPress: () => resolve("camera") },
      { text: "Library", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
  if (!choice) return [];

  if (choice === "camera") {
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.45,
      base64: true,
      allowsEditing: false,
    });
    if (shot.canceled || !shot.assets[0]) return [];
    const a = shot.assets[0];
    if (!a.base64) throw new Error("Could not read photo data");
    return [
      {
        id: mediaId(),
        kind: "image",
        mimeType: a.mimeType ?? "image/jpeg",
        dataUrl: `data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`,
        fileName: a.fileName ?? undefined,
      },
    ];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.45,
    base64: true,
    allowsMultipleSelection: true,
    selectionLimit: max,
  });
  if (result.canceled) return [];
  return result.assets
    .filter((a) => a.base64)
    .map((a) => ({
      id: mediaId(),
      kind: "image" as const,
      mimeType: a.mimeType ?? "image/jpeg",
      dataUrl: `data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`,
      fileName: a.fileName ?? undefined,
    }));
}

async function pickVideo(): Promise<JobCardMediaItem | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Photo library permission required");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    quality: 0.5,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return {
    id: mediaId(),
    kind: "video",
    mimeType: a.mimeType ?? "video/mp4",
    dataUrl: "",
    fileName: a.fileName ?? a.uri.split("/").pop() ?? "video.mp4",
  };
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [job, setJob] = useState<FieldJob | null>(null);
  const [payload, setPayload] = useState<JobCardPayload>(emptyJobCardPayload());
  const [cardStatus, setCardStatus] = useState<"draft" | "submitted">("draft");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signTarget, setSignTarget] = useState<"senior" | "client" | null>(null);

  const readOnly = cardStatus === "submitted";

  const patch = useCallback((partial: Partial<JobCardPayload>) => {
    setPayload((p) => ({ ...p, ...partial }));
  }, []);

  const load = useCallback(async () => {
    try {
      const [jobsData, cardData] = await Promise.all([
        apiFetch(API_PATHS.mobileTechJobs),
        apiFetch(`${API_PATHS.mobileTechJobCard}?jobId=${encodeURIComponent(String(id))}`),
      ]);
      const found = (jobsData.jobs as FieldJob[]).find((j) => j.id === id) ?? null;
      setJob(found);
      if (cardData.payload) {
        setPayload(cardData.payload as JobCardPayload);
      } else if (found) {
        setPayload(
          emptyJobCardPayload({
            clientNameSurname: found.clientName ?? "",
            technicians: me?.user?.name ?? "",
          })
        );
      }
      if (cardData.submission?.status === "submitted") {
        setCardStatus("submitted");
      } else {
        setCardStatus("draft");
      }
    } finally {
      setLoading(false);
    }
  }, [id, me?.user?.name]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function setStatus(status: JobStatus): Promise<boolean> {
    setBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (status === "on_site" || status === "completed" || status === "en_route") {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      }
      await apiFetch(API_PATHS.mobileTechJobs, {
        method: "POST",
        body: JSON.stringify({ action: "update_status", jobId: id, status, lat, lng }),
      });
      await load();
      return true;
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Try again");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function notifyRoute(kind: "en_route" | "on_site") {
    if (!job || job.status === "cancelled" || job.status === "completed") return;

    if (kind === "en_route") {
      // Toggle off accidental "On route"
      if (job.status === "en_route") {
        await setStatus("scheduled");
        return;
      }
      if (job.status === "on_site") {
        Alert.alert(
          "Undo Arrived first",
          "Tap Arrived again to undo arrival, then you can undo On route."
        );
        return;
      }
      // scheduled → on route + WhatsApp
      const client =
        job.clientName?.trim() ||
        payload.clientNameSurname.trim() ||
        job.title ||
        "client";
      const tech = me?.user?.name?.trim();
      const text = tech
        ? `On route to ${client} — ${tech}`
        : `On route to ${client}`;
      await openWhatsAppPrefill(text);
      if (!readOnly) await setStatus("en_route");
      return;
    }

    // Arrived toggle
    if (job.status === "on_site") {
      const cleared: JobCardPayload = {
        ...payload,
        siteStartedAt: "",
      };
      setPayload(cleared);
      try {
        await apiFetch(API_PATHS.mobileTechJobCard, {
          method: "POST",
          body: JSON.stringify({
            action: "save",
            jobId: id,
            payload: cleared,
          }),
        });
      } catch {
        /* still undo status */
      }
      await setStatus("en_route");
      return;
    }

    const client =
      job.clientName?.trim() ||
      payload.clientNameSurname.trim() ||
      job.title ||
      "client";
    const tech = me?.user?.name?.trim();
    const text = tech
      ? `Arrived at ${client} — ${tech}`
      : `Arrived at ${client}`;
    await openWhatsAppPrefill(text);

    if (!readOnly) {
      const stamp = nowJobStamp();
      const nextPayload: JobCardPayload = {
        ...payload,
        jobDate: payload.jobDate.trim() || stamp.jobDate,
        jobTime: stamp.jobTime,
        siteStartedAt: new Date().toISOString(),
        clientNameSurname:
          payload.clientNameSurname.trim() ||
          job.clientName?.trim() ||
          payload.clientNameSurname,
      };
      setPayload(nextPayload);
      try {
        await apiFetch(API_PATHS.mobileTechJobCard, {
          method: "POST",
          body: JSON.stringify({
            action: "save",
            jobId: id,
            payload: nextPayload,
          }),
        });
      } catch {
        /* still mark arrived if draft save fails */
      }
      await setStatus("on_site");
    }
  }

  async function finishOnSite() {
    if (!job || readOnly || busy) return;
    if (job.status !== "on_site") {
      Alert.alert("Finished", "Tap Arrived first to start on-site time.");
      return;
    }
    const started = payload.siteStartedAt?.trim();
    if (!started) {
      Alert.alert(
        "Finished",
        "No arrival time saved. Tap Arrived again, then Finished when done."
      );
      return;
    }
    setBusy(true);
    try {
      const hours = formatOnSiteHours(started);
      const nextPayload: JobCardPayload = {
        ...payload,
        hoursOnSite: hours,
      };
      setPayload(nextPayload);
      await apiFetch(API_PATHS.mobileTechJobCard, {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          jobId: id,
          payload: nextPayload,
        }),
      });
    } catch (e) {
      Alert.alert("Finished", e instanceof Error ? e.message : "Could not save hours");
    } finally {
      setBusy(false);
    }
  }

  async function openNavigation() {
    if (!job) return;
    const url = mapsUrl(job);
    if (!url) {
      Alert.alert("No location", "This job has no GPS pin or address yet.");
      return;
    }
    await Linking.openURL(url);
  }

  async function addPhotos(
    key: "beforePhotos" | "afterPhotos" | "serialPhotos",
    max = 4
  ) {
    if (readOnly) return;
    try {
      const items = await pickImages(max);
      if (!items.length) return;
      setPayload((p) => ({
        ...p,
        [key]: [...p[key], ...items].slice(0, max),
      }));
    } catch (e) {
      Alert.alert("Photos", e instanceof Error ? e.message : "Could not add photos");
    }
  }

  async function addLocation() {
    if (readOnly) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location", "Permission required to add site location");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const p = places[0];
        if (p) {
          label = [p.name, p.street, p.city, p.region].filter(Boolean).join(", ") || label;
        }
      } catch {
        /* keep coords label */
      }
      patch({ locationLat: lat, locationLng: lng, locationLabel: label });
    } catch (e) {
      Alert.alert("Location", e instanceof Error ? e.message : "Could not get location");
    }
  }

  async function measureTravelOneWay() {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location",
          "Allow location so we can measure travel distance to Megs Waterberg."
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const km = haversineKm(
        { lat: pos.coords.latitude, lng: pos.coords.longitude },
        { lat: MEGS_OFFICE.lat, lng: MEGS_OFFICE.lng }
      );
      patch({ travelOneWay: formatTravelKm(km) });
    } catch (e) {
      Alert.alert(
        "Travel",
        e instanceof Error ? e.message : "Could not measure travel distance"
      );
    } finally {
      setBusy(false);
    }
  }

  async function addVideo() {
    if (readOnly) return;
    try {
      const item = await pickVideo();
      if (item) patch({ video: item });
    } catch (e) {
      Alert.alert("Video", e instanceof Error ? e.message : "Could not add video");
    }
  }

  function onSign(sig: JobCardSignature) {
    if (signTarget === "senior") patch({ seniorTechSignature: sig });
    if (signTarget === "client") patch({ clientSignature: sig });
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileTechJobCard, {
        method: "POST",
        body: JSON.stringify({ action: "save", jobId: id, payload }),
      });
      Alert.alert("Saved", "Draft job card saved");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function sendCard() {
    const checklist = Array.isArray(payload.stockChecklist)
      ? payload.stockChecklist
      : [];
    const toSubmit: JobCardPayload = {
      ...payload,
      stockUsed:
        checklist.length > 0
          ? summarizeStockChecklist(checklist)
          : payload.stockUsed,
    };
    const missing = listMissingJobCardFields(toSubmit);
    if (missing.length) {
      Alert.alert(
        "Required fields missing",
        `Complete all fields marked * before sending:\n\n• ${missing.join("\n• ")}`
      );
      return;
    }

    Alert.alert(
      "Send to coordination?",
      "Submit this job card? Coordination will receive it and can search it by job card number.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const res = (await apiFetch(
                  API_PATHS.mobileTechJobCard,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      action: "submit",
                      jobId: id,
                      payload: toSubmit,
                    }),
                  },
                  { timeoutMs: 90000 }
                )) as { submission?: { cardNumber?: string | null } | null };
                setCardStatus("submitted");
                const num = res?.submission?.cardNumber?.trim();
                Alert.alert(
                  "Sent to coordination",
                  num
                    ? `Job card ${num} submitted. Coordination can search this number.`
                    : "Technician job card submitted",
                  [{ text: "OK", onPress: () => router.back() }]
                );
              } catch (e) {
                Alert.alert(
                  "Send failed",
                  e instanceof Error ? e.message : "Check required fields"
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  if (loading) return <Loading />;
  if (!job) {
    return (
      <View style={styles.screen}>
        <Text style={styles.headerTitle}>Job not found</Text>
      </View>
    );
  }

  const hasNav =
    (job.locationLat != null && job.locationLng != null) || !!job.address?.trim();
  const hero = jobTypeGradient(job.jobType);
  const heroText = hero.light ? colors.text : "#fff";
  const heroBadgeBg = hero.light ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.22)";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Technician Job Card</Text>
        <View style={styles.headerBtn}>
          <StatusChip
            label={
              cardStatus === "submitted"
                ? "Sent"
                : statusLabel(job.status)
            }
            tone={cardStatus === "submitted" ? "ok" : "neutral"}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader title="Job details" />
        <LinearGradient
          colors={hero.colors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.hero}
        >
          <View
            style={[
              styles.heroIconOuter,
              hero.light && { backgroundColor: "rgba(255,255,255,0.55)" },
            ]}
          >
            <View style={styles.heroIconInner}>
              <Text style={styles.heroGlyph}>📋</Text>
            </View>
          </View>
          <Text style={[styles.heroTitle, { color: heroText }]}>{job.title}</Text>
          <View style={styles.heroBadges}>
            {job.jobType && job.jobType !== "general" ? (
              <View style={[styles.heroBadge, { backgroundColor: heroBadgeBg }]}>
                <Text style={[styles.heroBadgeText, { color: heroText }]}>
                  {jobKindLabel(job.jobType)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.heroBadge, { backgroundColor: heroBadgeBg }]}>
              <Text style={[styles.heroBadgeText, { color: heroText }]}>
                {statusLabel(job.status)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <FormCard>
          {job.clientName ? (
            <View>
              <OptionalLabel label="Client" />
              <Text style={styles.detailValue}>{job.clientName}</Text>
            </View>
          ) : null}
          {job.clientPppoe ? (
            <View>
              <OptionalLabel label="Client PPPoE" />
              <Text style={styles.detailValue}>{job.clientPppoe}</Text>
            </View>
          ) : null}
          {job.address ? (
            <View>
              <OptionalLabel label="Address" />
              <Text style={styles.detailValue}>{job.address}</Text>
            </View>
          ) : null}
          {job.locationLat != null && job.locationLng != null ? (
            <View>
              <OptionalLabel label="GPS" />
              <Text style={styles.detailValue}>
                {job.locationLat.toFixed(5)}, {job.locationLng.toFixed(5)}
              </Text>
            </View>
          ) : null}
          {job.notes ? (
            <View>
              <OptionalLabel label="Dispatch notes" />
              <Text style={styles.detailValue}>{job.notes}</Text>
            </View>
          ) : null}
          {hasNav ? (
            <TapLink
              icon="🗺️"
              label="Navigate to client"
              onPress={() => void openNavigation()}
          />
        ) : null}
        </FormCard>

        <View style={styles.routeStack}>
          <Pressable
            disabled={busy || job.status === "cancelled" || job.status === "completed"}
            onPress={() => void notifyRoute("en_route")}
            style={[
              styles.routeBtn,
              (job.status === "en_route" || job.status === "on_site") &&
                styles.routeBtnActive,
              (busy || job.status === "cancelled" || job.status === "completed") && {
                opacity: 0.5,
              },
            ]}
          >
            <Text
              style={[
                styles.routeBtnText,
                (job.status === "en_route" || job.status === "on_site") &&
                  styles.routeBtnTextActive,
              ]}
            >
              {job.status === "en_route"
                ? "On route to ✓  (tap to undo)"
                : job.status === "on_site"
                  ? "On route to ✓"
                  : "On route to"}
            </Text>
          </Pressable>
          <Pressable
            disabled={busy || job.status === "cancelled" || job.status === "completed"}
            onPress={() => void notifyRoute("on_site")}
            style={[
              styles.routeBtn,
              styles.routeBtnPrimary,
              job.status === "on_site" && styles.routeBtnDone,
              (busy || job.status === "cancelled" || job.status === "completed") && {
                opacity: 0.5,
              },
            ]}
          >
            <Text
              style={[
                styles.routeBtnText,
                styles.routeBtnTextPrimary,
                job.status === "on_site" && styles.routeBtnTextDone,
              ]}
            >
              {job.status === "on_site" ? "Arrived ✓  (tap to undo)" : "Arrived"}
            </Text>
          </Pressable>
          <Pressable
            disabled={
              busy ||
              readOnly ||
              job.status !== "on_site"
            }
            onPress={() => void finishOnSite()}
            style={[
              styles.routeBtn,
              payload.hoursOnSite.trim() && payload.siteStartedAt
                ? styles.routeBtnDone
                : styles.routeBtnPrimary,
              (busy || readOnly || job.status !== "on_site") && { opacity: 0.5 },
            ]}
          >
            <Text
              style={[
                styles.routeBtnText,
                styles.routeBtnTextPrimary,
                payload.hoursOnSite.trim() &&
                  payload.siteStartedAt &&
                  styles.routeBtnTextDone,
              ]}
            >
              {payload.hoursOnSite.trim() && payload.siteStartedAt
                ? `Finished ✓  ${payload.hoursOnSite} h`
                : "Finished"}
            </Text>
          </Pressable>
        </View>

        <JobNetworkLayoutSection jobId={String(id)} />

        <SectionHeader title="Job Card" />
        <SubSectionHeader title="Risk Assessment" />
        <FormCard>
          <View>
            <RequiredLabel label="Does this Job include working on heights?" />
            <YesNoToggle
              value={payload.workingOnHeights}
              disabled={readOnly}
              onChange={(v) => patch({ workingOnHeights: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Will the current weather conditions influence or endanger any person?" />
            <YesNoToggle
              value={payload.weatherDanger}
              disabled={readOnly}
              onChange={(v) => patch({ weatherDanger: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Is there any high voltage power line within 30m of workspace?" />
            <YesNoToggle
              value={payload.highVoltageNearby}
              disabled={readOnly}
              onChange={(v) => patch({ highVoltageNearby: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Do you have the necessary Personal Protective Equipment to complete the current assignment?" />
            <YesNoToggle
              value={payload.hasPpe}
              disabled={readOnly}
              onChange={(v) => patch({ hasPpe: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Is there any risks that need to be run by management for approval?" />
            <YesNoToggle
              value={payload.needsMgmtApproval}
              disabled={readOnly}
              onChange={(v) => patch({ needsMgmtApproval: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Signature of Senior Technician on site" />
            <TapLink
              icon="✍️"
              label={
                payload.seniorTechSignature
                  ? `Signed: ${payload.seniorTechSignature.name}`
                  : "Tap to sign"
              }
              done={!!payload.seniorTechSignature}
              disabled={readOnly}
              onPress={() => setSignTarget("senior")}
            />
          </View>
        </FormCard>

        <SubSectionHeader title="Technical Job Card" />
        <FormCard>
          <View>
            <RequiredLabel label="Client Name and Surname" />
            <FormTextInput
              value={payload.clientNameSurname}
              onChangeText={(v) => patch({ clientNameSurname: v })}
              disabled={readOnly}
            />
          </View>
          <View>
            <RequiredLabel label="Does this Job require cable work" hint="Client install" />
            <YesNoToggle
              value={payload.requiresCableWork}
              disabled={readOnly}
              onChange={(v) => patch({ requiresCableWork: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Risk Assessment Done and Approved" />
            <YesNoToggle
              value={payload.riskAssessmentApproved}
              disabled={readOnly}
              onChange={(v) => patch({ riskAssessmentApproved: v })}
            />
          </View>
          <View>
            <RequiredLabel label="Date of Job" />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <FormTextInput
                  value={payload.jobDate}
                  onChangeText={(v) => patch({ jobDate: v })}
                  placeholder="YYYY-MM-DD"
                  disabled={readOnly}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormTextInput
                  value={payload.jobTime}
                  onChangeText={(v) => patch({ jobTime: v })}
                  placeholder="HH:MM"
                  disabled={readOnly}
                />
              </View>
            </View>
          </View>
          <View>
            <RequiredLabel label="Time Spend on Site (Hours)" />
            <FormTextInput
              value={payload.hoursOnSite}
              onChangeText={(v) => patch({ hoursOnSite: v })}
              disabled={readOnly}
            />
          </View>
          <View>
            <RequiredLabel label="Travel (One Way)" />
            <Pressable
              disabled={readOnly || busy}
              onPress={() => void measureTravelOneWay()}
              style={[
                styles.travelBtn,
                payload.travelOneWay ? styles.travelBtnDone : null,
                (readOnly || busy) && { opacity: 0.5 },
              ]}
            >
              <Text
                style={[
                  styles.travelBtnText,
                  payload.travelOneWay ? styles.travelBtnTextDone : null,
                ]}
              >
                {busy
                  ? "Measuring…"
                  : payload.travelOneWay
                    ? `${payload.travelOneWay}  ·  tap to remeasure`
                    : "Measure travel to Megs Waterberg"}
              </Text>
            </Pressable>
            <Text style={styles.travelHint}>
              Uses your GPS distance to the office (
              {MEGS_OFFICE.label})
            </Text>
          </View>
          <View>
            <RequiredLabel label="Work Done" />
            <FormTextInput
              value={payload.workDone}
              onChangeText={(v) => patch({ workDone: v })}
              multiline
              disabled={readOnly}
            />
          </View>
          <View>
            <RequiredLabel label="Stock used" />
            {(payload.stockChecklist?.length ?? 0) > 0 ? (
              <View style={{ gap: 10 }}>
                {payload.stockChecklist.map((line) => (
                  <View key={line.bookingId} style={styles.stockLine}>
                    <Text style={styles.stockLineTitle}>
                      {line.productName}
                      {line.serialNumber ? ` · ${line.serialNumber}` : ""}
                    </Text>
                    <View style={styles.stockToggleRow}>
                      <Pressable
                        disabled={readOnly}
                        onPress={() =>
                          setPayload((p) => ({
                            ...p,
                            stockChecklist: (p.stockChecklist ?? []).map((l) =>
                              l.bookingId === line.bookingId
                                ? { ...l, used: true }
                                : l
                            ),
                          }))
                        }
                        style={[
                          styles.stockToggle,
                          line.used === true && styles.stockToggleUsed,
                          readOnly && { opacity: 0.5 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockToggleText,
                            line.used === true && styles.stockToggleTextOn,
                          ]}
                        >
                          Used
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={readOnly}
                        onPress={() =>
                          setPayload((p) => ({
                            ...p,
                            stockChecklist: (p.stockChecklist ?? []).map((l) =>
                              l.bookingId === line.bookingId
                                ? { ...l, used: false }
                                : l
                            ),
                          }))
                        }
                        style={[
                          styles.stockToggle,
                          line.used === false && styles.stockToggleUnused,
                          readOnly && { opacity: 0.5 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockToggleText,
                            line.used === false && styles.stockToggleTextOn,
                          ]}
                        >
                          Not used
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <Text style={styles.travelHint}>
                  Mark Not used if stock must be booked back into inventory.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.travelHint}>
                  No stock booked out for this job. Enter a short note (e.g. None).
                </Text>
                <FormTextInput
                  value={payload.stockUsed}
                  onChangeText={(v) => patch({ stockUsed: v })}
                  placeholder="None / notes"
                  multiline
                  disabled={readOnly}
                />
              </>
            )}
          </View>
        </FormCard>

        <SubSectionHeader title="Photos & location" />
        <FormCard>
          <View>
            <OptionalLabel label="Before Photos" />
            <TapLink
              icon="📷"
              label={
                payload.beforePhotos.length
                  ? `${payload.beforePhotos.length} photo(s) — Tap to add`
                  : "Tap to select"
              }
              done={payload.beforePhotos.length > 0}
              disabled={readOnly}
              onPress={() => void addPhotos("beforePhotos")}
            />
            <PhotoStrip items={payload.beforePhotos} />
          </View>
          <View>
            <RequiredLabel label="After Photos" />
            <TapLink
              icon="📷"
              label={
                payload.afterPhotos.length
                  ? `${payload.afterPhotos.length} photo(s) — Tap to add`
                  : "Tap to select"
              }
              done={payload.afterPhotos.length > 0}
              disabled={readOnly}
              onPress={() => void addPhotos("afterPhotos")}
            />
            <PhotoStrip items={payload.afterPhotos} />
          </View>
          <View>
            <RequiredLabel
              label="Serial Numbers of Stock"
              hint="Please upload a photo of all serial numbers of equipment used or removed"
            />
            <TapLink
              icon="📷"
              label={
                payload.serialPhotos.length
                  ? `${payload.serialPhotos.length} photo(s) — Tap to add`
                  : "Tap to select"
              }
              done={payload.serialPhotos.length > 0}
              disabled={readOnly}
              onPress={() => void addPhotos("serialPhotos")}
            />
            <PhotoStrip items={payload.serialPhotos} />
          </View>
          <View>
            <RequiredLabel label="Location" />
            <TapLink
              icon="📍"
              label={
                payload.locationLabel
                  ? payload.locationLabel
                  : "Add location"
              }
              done={payload.locationLat != null}
              disabled={readOnly}
              onPress={() => void addLocation()}
            />
          </View>
        </FormCard>

        <SubSectionHeader title="Sign-off" />
        <FormCard>
          <View>
            <RequiredLabel label="Technicians" />
            <FormTextInput
              value={payload.technicians}
              onChangeText={(v) => patch({ technicians: v })}
              disabled={readOnly}
            />
          </View>
          <View>
            <RequiredLabel label="Client Signature" />
            <TapLink
              icon="✍️"
              label={
                payload.clientSignature
                  ? `Signed: ${payload.clientSignature.name}`
                  : "Tap to sign"
              }
              done={!!payload.clientSignature}
              disabled={readOnly}
              onPress={() => setSignTarget("client")}
            />
          </View>
          <View>
            <OptionalLabel label="Notes" />
            <FormTextInput
              value={payload.notes}
              onChangeText={(v) => patch({ notes: v })}
              multiline
              disabled={readOnly}
            />
          </View>
          <View>
            <OptionalLabel label="Video" />
            <TapLink
              icon="🎬"
              label={
                payload.video?.fileName
                  ? `Video: ${payload.video.fileName}`
                  : "Upload a video"
              }
              done={!!payload.video}
              disabled={readOnly}
              onPress={() => void addVideo()}
            />
          </View>
        </FormCard>

        {!readOnly ? (
          <View style={styles.footerBtns}>
            <Pressable
              disabled={busy}
              onPress={() => void saveDraft()}
              style={[styles.secondaryBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.secondaryBtnText}>Save draft</Text>
            </Pressable>
            <Pressable
            disabled={busy}
              onPress={() => void sendCard()}
              style={[styles.sendBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.sendBtnText}>Send ▶</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.submittedNote}>This job card has been submitted.</Text>
        )}
      </ScrollView>

      <SignatureModal
        visible={signTarget != null}
        title={
          signTarget === "senior"
            ? "Senior technician signature"
            : "Client signature"
        }
        onClose={() => setSignTarget(null)}
        onSave={onSign}
      />
    </View>
  );
}

function PhotoStrip({ items }: { items: JobCardMediaItem[] }) {
  if (!items.length) return null;
  return (
    <ScrollView horizontal style={{ marginTop: 8 }} showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {items.map((item) =>
          item.dataUrl ? (
            <Image
              key={item.id}
              source={{ uri: item.dataUrl }}
              style={styles.thumb}
            />
          ) : null
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 72,
  },
  backArrow: {
    fontSize: 32,
    lineHeight: 34,
    color: colors.brand,
    fontWeight: "300",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 48,
    gap: 4,
  },
  hero: {
    borderRadius: 16,
    minHeight: 160,
    padding: spacing.md,
    marginBottom: spacing.sm,
    justifyContent: "flex-end",
    gap: 8,
  },
  heroIconOuter: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconInner: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlyph: {
    fontSize: 20,
  },
  heroTitle: {
    marginTop: 56,
    fontSize: 20,
    fontWeight: "800",
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  heroBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  routeStack: {
    gap: 10,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  routeBtn: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  routeBtnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  routeBtnActive: {
    backgroundColor: "#DCFCE7",
    borderColor: colors.online,
  },
  routeBtnDone: {
    backgroundColor: "#DCFCE7",
    borderColor: colors.online,
  },
  routeBtnText: {
    fontWeight: "700",
    fontSize: 15,
    color: colors.accentDeep,
  },
  routeBtnTextPrimary: {
    color: "#fff",
  },
  routeBtnTextActive: {
    color: colors.online,
  },
  routeBtnTextDone: {
    color: colors.online,
  },
  travelBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  travelBtnDone: {
    backgroundColor: "#DCFCE7",
    borderColor: colors.online,
  },
  travelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentDeep,
    textAlign: "center",
  },
  travelBtnTextDone: {
    color: "#166534",
  },
  travelHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.mutedDark,
  },
  stockLine: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    backgroundColor: "#F8FAFC",
  },
  stockLineTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  stockToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  stockToggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  stockToggleUsed: {
    borderColor: colors.online,
    backgroundColor: "#DCFCE7",
  },
  stockToggleUnused: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  stockToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.mutedDark,
  },
  stockToggleTextOn: {
    color: colors.text,
  },
  row2: {
    flexDirection: "row",
    gap: 8,
  },
  footerBtns: {
    gap: 10,
    marginTop: spacing.md,
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontWeight: "700",
    color: colors.mutedDark,
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
  },
  submittedNote: {
    textAlign: "center",
    color: colors.online,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
});

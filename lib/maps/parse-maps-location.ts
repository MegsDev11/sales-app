export type ParsedMapsLocation = {
  lat: number;
  lng: number;
  /** Decoded place name / street when present in the Maps URL. */
  address: string | null;
};

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function pair(lat: number, lng: number, address: string | null = null): ParsedMapsLocation | null {
  if (!validCoord(lat, lng)) return null;
  return { lat, lng, address };
}

/** Decode Google Maps place path segment into a readable address. */
export function decodeMapsPlaceName(segment: string): string | null {
  if (!segment) return null;
  try {
    const decoded = decodeURIComponent(segment.replace(/\+/g, " ")).trim();
    if (!decoded || decoded.startsWith("data=")) return null;
    // Skip opaque place IDs like ChIJ...
    if (/^ChIJ/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function addressFromMapsUrl(url: URL): string | null {
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/i);
  if (placeMatch?.[1]) return decodeMapsPlaceName(placeMatch[1]);
  const searchMatch = url.pathname.match(/\/maps\/search\/([^/@]+)/i);
  if (searchMatch?.[1]) return decodeMapsPlaceName(searchMatch[1]);
  return null;
}

/**
 * Parse lat/lng (and optional address) from:
 * - plain "lat, lng"
 * - full Google Maps URLs (@lat,lng, !3d!4d, q=, query=, destination=)
 * Does not resolve short links — use the resolve API for those.
 */
export function parseMapsLocationInput(raw: string): ParsedMapsLocation | null {
  const text = raw.trim();
  if (!text) return null;

  // Plain coordinates (allow spaces / optional degree symbols)
  const plain = text.match(
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/
  );
  if (plain) {
    return pair(Number(plain[1]), Number(plain[2]));
  }

  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    // Not a URL — maybe pasted with surrounding words
    const embedded = text.match(
      /(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/
    );
    if (embedded) return pair(Number(embedded[1]), Number(embedded[2]));
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isGoogleMaps =
    host.includes("google.") ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "g.co" ||
    host.endsWith("maps.apple.com");

  if (!isGoogleMaps && !host.includes("maps")) {
    // Still try generic @lat,lng / query patterns
  }

  const address = addressFromMapsUrl(url);

  // Marker coords (preferred over camera @)
  const marker = url.href.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (marker) {
    const parsed = pair(Number(marker[1]), Number(marker[2]), address);
    if (parsed) return parsed;
  }

  // @lat,lng,zoom
  const at = url.href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,|$)/);
  if (at) {
    const parsed = pair(Number(at[1]), Number(at[2]), address);
    if (parsed) return parsed;
  }

  for (const key of ["q", "query", "destination", "ll", "center"]) {
    const val = url.searchParams.get(key);
    if (!val) continue;
    const m = val.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) {
      const parsed = pair(Number(m[1]), Number(m[2]), address);
      if (parsed) return parsed;
    }
  }

  // Apple Maps: ll=lat,lng
  const ll = url.searchParams.get("ll");
  if (ll) {
    const m = ll.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (m) return pair(Number(m[1]), Number(m[2]), address);
  }

  return null;
}

/** True when we likely need a server round-trip to expand a short Maps link. */
export function needsMapsUrlResolve(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "maps.app.goo.gl") return true;
    if (host === "goo.gl" && url.pathname.startsWith("/maps")) return true;
    if (host === "g.co") return true;
    if (host === "share.google") return true;
    // Already parseable long URL — no resolve needed
    if (parseMapsLocationInput(raw)) return false;
    if (host.includes("google.") && url.pathname.includes("/maps")) return true;
    return false;
  } catch {
    return false;
  }
}

export function formatCoord(n: number, digits = 6): string {
  return Number(n.toFixed(digits)).toString();
}

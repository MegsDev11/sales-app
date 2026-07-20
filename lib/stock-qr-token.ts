/** Extract a stock QR token from a pasted URL or raw token string. */
export function extractStockQrToken(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("i");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  } catch {
    /* not a URL */
  }
  const match = value.match(/\/i\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return value;
}

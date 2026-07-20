"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function useQrDataUrl(value: string | null | undefined) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      color: { dark: "#0b1220", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return dataUrl;
}

export function stockItemPublicUrl(qrToken: string) {
  if (typeof window === "undefined") return `/i/${qrToken}`;
  return `${window.location.origin}/i/${qrToken}`;
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  needsMapsUrlResolve,
  parseMapsLocationInput,
  type ParsedMapsLocation,
} from "@/lib/maps/parse-maps-location";

function formatCoord(n: number, digits = 6): string {
  return Number(n.toFixed(digits)).toString();
}

export function MapsLocationPaste({
  address,
  locationLat,
  locationLng,
  onAddressChange,
  onLatChange,
  onLngChange,
}: {
  address: string;
  locationLat: string;
  locationLng: string;
  onAddressChange: (v: string) => void;
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
}) {
  const { accessToken } = useAuth();
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintOk, setHintOk] = useState(false);

  function apply(loc: ParsedMapsLocation) {
    onLatChange(formatCoord(loc.lat));
    onLngChange(formatCoord(loc.lng));
    if (loc.address && !address.trim()) {
      onAddressChange(loc.address);
    }
    setHintOk(true);
    setHint(
      `GPS set to ${formatCoord(loc.lat, 5)}, ${formatCoord(loc.lng, 5)}${
        loc.address ? ` · ${loc.address}` : ""
      }`
    );
    setPaste("");
  }

  async function resolve(raw = paste) {
    const text = raw.trim();
    if (!text) return;
    setBusy(true);
    setHint(null);
    try {
      const local = parseMapsLocationInput(text);
      if (local && !needsMapsUrlResolve(text)) {
        apply(local);
        return;
      }

      if (!accessToken) {
        setHintOk(false);
        setHint("Sign in to resolve short Google Maps links.");
        return;
      }

      const res = await fetch("/api/maps/resolve", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not resolve link");
      apply({
        lat: Number(json.lat),
        lng: Number(json.lng),
        address: typeof json.address === "string" ? json.address : null,
      });
    } catch (e) {
      setHintOk(false);
      setHint(e instanceof Error ? e.message : "Could not read that link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <label className="text-xs font-medium text-muted-foreground">
        Location from Google Maps
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text?.trim()) {
              window.setTimeout(() => void resolve(text), 0);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void resolve();
            }
          }}
          placeholder="Paste maps.app.goo.gl link or -24.70, 28.39"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !paste.trim()}
          onClick={() => void resolve()}
        >
          {busy ? "Reading…" : "Use link"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr]">
        <Input
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Street address (optional with GPS)"
        />
        <Input
          value={locationLat}
          onChange={(e) => onLatChange(e.target.value)}
          placeholder="Latitude e.g. -24.8836"
          inputMode="decimal"
        />
        <Input
          value={locationLng}
          onChange={(e) => onLngChange(e.target.value)}
          placeholder="Longitude e.g. 28.2940"
          inputMode="decimal"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Paste a Google Maps share link (including short{" "}
        <span className="font-medium">maps.app.goo.gl</span> links) or coordinates.
        Techs tap Navigate on the app for directions.
      </p>
      {hint ? (
        <p
          className={
            hintOk
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-amber-700"
          }
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

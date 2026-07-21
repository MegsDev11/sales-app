"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

const SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.DATA_MATRIX,
];

/**
 * Camera-based QR / barcode scanner with graceful fallbacks.
 * Renders a "Scan" button; when active, shows the camera preview inline.
 * Calls onResult with the decoded text, then stops the camera.
 */
export function BarcodeScanner({
  onResult,
  label = "Scan",
  className,
}: {
  onResult: (text: string) => void;
  label?: string;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera not supported on this device/browser. Type the value instead.");
          setActive(false);
          return;
        }
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result && !cancelled) {
              cancelled = true;
              controls.stop();
              controlsRef.current = null;
              setActive(false);
              onResultRef.current(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error && /permission|notallowed/i.test(e.name + e.message)
            ? "Camera permission denied. Allow camera access or type the value instead."
            : "Could not start the camera. Type the value instead.";
        setError(message);
        setActive(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active]);

  return (
    <div className={className}>
      {!active ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setError("");
            setActive(true);
          }}
        >
          <Camera className="mr-1 h-4 w-4" />
          {label}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="h-48 w-full object-cover" autoPlay playsInline muted />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="absolute right-2 top-2 bg-white/90"
              onClick={() => setActive(false)}
            >
              <X className="mr-1 h-4 w-4" />
              Stop
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Point the camera at the QR code or barcode.
          </p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

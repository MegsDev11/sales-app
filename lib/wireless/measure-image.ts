"use client";

import { DEFAULT_BACKDROP } from "@/lib/wireless/layout-types";

/** Canvas width a backdrop is scaled to; height follows the image's aspect ratio. */
export const BACKDROP_TARGET_WIDTH = 1400;

/**
 * Size a backdrop box from the real image.
 *
 * Aspect ratio is the part that matters. Stretching an aerial to a fixed box would
 * put every marker slightly off the building it names, and the error is invisible
 * — the photo still looks like a photo.
 */
export function measureBackdrop(
  url: string,
  targetWidth = BACKDROP_TARGET_WIDTH
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    // A backdrop that cannot be measured still has to be placeable, so fall back
    // to the default box rather than leaving the canvas without an image.
    img.onerror = () =>
      resolve({ width: DEFAULT_BACKDROP.width, height: DEFAULT_BACKDROP.height });
    img.onload = () => {
      const ratio = img.naturalHeight / (img.naturalWidth || 1);
      resolve({ width: targetWidth, height: Math.round(targetWidth * ratio) });
    };
    img.src = url;
  });
}

import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Shared page furniture for the documents MEGS sends clients.
 *
 * Both the tax invoice and the customer transactions report are reproductions of what
 * Sage prints, so they share a page size, a palette and a text-placement helper. They
 * do NOT share a money format, and that is not an oversight:
 *
 *     invoice:   R100.00      no space, no thousands separator
 *     statement: R 1,225.62   a space after R, comma thousands separator
 *
 * Sage genuinely formats the two documents differently, and a client who has been
 * filing both for years will notice if they suddenly agree. Percentages use a comma
 * decimal on the invoice while money on the same page uses a dot. All of this is
 * reproduced rather than tidied.
 */

export const A4: [number, number] = [595.28, 841.89];
export const MARGIN = 36;
export const RIGHT = A4[0] - MARGIN;

export const INK = rgb(0.11, 0.11, 0.12);
export const MUTED = rgb(0.42, 0.44, 0.47);
export const RULE = rgb(0.78, 0.79, 0.81);
export const HEAD_BG = rgb(0.93, 0.94, 0.95);
export const BRAND = rgb(0.77, 0.13, 0.15);

export interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

export function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    align?: "left" | "right";
  } = {}
) {
  const size = opts.size ?? 8;
  const font = opts.bold ? ctx.bold : ctx.font;
  const width = font.widthOfTextAtSize(value, size);
  ctx.page.drawText(value, {
    x: opts.align === "right" ? x - width : x,
    y,
    size,
    font,
    color: opts.color ?? INK,
  });
}

/** Greedy word wrap; returns the lines that fit `maxWidth`. */
export function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** Truncate to fit a column, with an ellipsis, so text never overruns its neighbour. */
export function clip(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export function rule(ctx: Ctx, y: number, from = MARGIN, to = RIGHT) {
  ctx.page.drawLine({
    start: { x: from, y },
    end: { x: to, y },
    thickness: 0.5,
    color: RULE,
  });
}

/* ------------------------------------------------------------------ *
 * Number and date formats — matched to Sage, per document
 * ------------------------------------------------------------------ */

/** Invoice style: `R100.00` — no space, no thousands separator. */
export function money(value: number): string {
  const negative = value < 0;
  return `${negative ? "-" : ""}R${Math.abs(value).toFixed(2)}`;
}

/** Statement style: `R 1,225.62` — a space after R, comma thousands separator. */
export function statementMoney(value: number): string {
  const negative = value < 0;
  const body = Math.abs(value)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}R ${body}`;
}

/** `0,00%` — comma decimal, which Sage uses for percentages only. */
export function percent(value: number): string {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

/** `23/07/2026` — how dates read inside both documents. */
export function shortDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/** `2026/07/31` — the "Date Printed" footer format, which differs from the rest. */
export function printedDate(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}/${m}/${d}`;
}

/* ------------------------------------------------------------------ *
 * Letterhead
 * ------------------------------------------------------------------ */

/**
 * Decide how to embed a letterhead from its MAGIC BYTES, not its filename.
 *
 * `public/megs-logo.png` is actually a JPEG. pdf-lib rightly refuses to read it as a
 * PNG, and trusting the extension meant every document silently lost its letterhead —
 * a failure that is invisible unless you open the file, because the fallback just
 * prints the company name. Sniffing removes the whole class of problem and lets the
 * department drop in a replacement in either format.
 */
export function imageKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  return null;
}

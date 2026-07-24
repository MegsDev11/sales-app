"use client";

import type { StockProduct, StockSundry } from "@/lib/types";
import { SelectContent, SelectItem } from "@/components/ui/select";

export function decodePickListTarget(target: string): {
  productId?: string;
  sundryId?: string;
} {
  if (target.startsWith("sundry:")) return { sundryId: target.slice(7) };
  if (target.startsWith("product:")) return { productId: target.slice(8) };
  return {};
}

export function pickListTargetName(
  target: string,
  products: StockProduct[],
  sundries: StockSundry[]
): string {
  const { productId, sundryId } = decodePickListTarget(target);
  if (sundryId) {
    const sundry = sundries.find((s) => s.id === sundryId);
    return sundry ? `${sundry.name} (sundry)` : "Sundry";
  }
  if (productId) {
    return products.find((p) => p.id === productId)?.name ?? "Product";
  }
  return "Product or sundry";
}

export function PickListTargetOptions({
  products,
  sundries,
  productCounts,
}: {
  products: StockProduct[];
  sundries: StockSundry[];
  productCounts: (productId: string) => { available: number };
}) {
  return (
    <SelectContent>
      {products.map((p) => {
        const avail = productCounts(p.id).available;
        return (
          <SelectItem key={p.id} value={`product:${p.id}`}>
            {p.name} (avail {avail})
          </SelectItem>
        );
      })}
      {sundries.map((s) => (
        <SelectItem key={s.id} value={`sundry:${s.id}`}>
          {s.name} — sundry (avail {s.quantity} {s.unitLabel})
        </SelectItem>
      ))}
    </SelectContent>
  );
}

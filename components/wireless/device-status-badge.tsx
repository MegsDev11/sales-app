"use client";

import { cn } from "@/lib/utils";
import type { NetworkDeviceStatus } from "@/lib/wireless/layout-types";

const STYLES: Record<NetworkDeviceStatus, string> = {
  online: "bg-emerald-100 text-emerald-800 border-emerald-200",
  offline: "bg-red-100 text-red-800 border-red-200",
  unknown: "bg-amber-100 text-amber-900 border-amber-200",
};

export function DeviceStatusBadge({
  status,
  className,
}: {
  status: NetworkDeviceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[status],
        className
      )}
    >
      {status}
    </span>
  );
}

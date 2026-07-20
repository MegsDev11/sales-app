"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { usePublicNetworkStatus } from "@/lib/hooks/use-public-network-status";

export function NetworkStatusBanner() {
  const { outages } = usePublicNetworkStatus();

  if (outages.length === 0) return null;

  return (
    <div className="border-b border-red-700 bg-red-600 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            Network disruption — {outages.length} tower{outages.length !== 1 ? "s" : ""} offline
          </span>
        </div>
        <Link
          href="/#network-status"
          className="rounded-md bg-white/15 px-3 py-1 text-sm font-medium hover:bg-white/25"
        >
          View affected areas
        </Link>
      </div>
    </div>
  );
}

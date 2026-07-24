"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function WirelessClientsPage() {
  const { allowed, isLoading } = useWirelessAccess();
  const { clients, loading, error } = useWirelessData();
  const [q, setQ] = useState("");
  const [onlyWithLayout, setOnlyWithLayout] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (onlyWithLayout && !c.hasLayout) return false;
      if (!needle) return true;
      return (
        c.clientName.toLowerCase().includes(needle) ||
        c.address.toLowerCase().includes(needle) ||
        c.phone.toLowerCase().includes(needle)
      );
    });
  }, [clients, q, onlyWithLayout]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Wireless Clients"
        description="Sales leads with wireless service and/or a network layout profile"
      />

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search clients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWithLayout}
            onChange={(e) => setOnlyWithLayout(e.target.checked)}
          />
          Only with layout
        </label>
      </div>

      <div className="grid gap-3">
        {filtered.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{c.clientName}</p>
                <p className="text-sm text-muted-foreground">
                  {c.address || "No address"} · {c.serviceType}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.hasLayout
                    ? c.publishedLayoutId
                      ? "Published layout"
                      : "Draft layout"
                    : "No layout yet"}
                </p>
              </div>
              <Link
                href={`/wireless/clients/${c.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open profile
              </Link>
            </CardContent>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No matching clients.</p>
        )}
      </div>
    </PageShell>
  );
}
"use client";

import { useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function WirelessLayoutsPage() {
  const { allowed, isLoading } = useWirelessAccess();
  const { layouts, clients, loading, error, postJson } = useWirelessData();
  const [busy, setBusy] = useState(false);

  if (isLoading || !allowed) return null;

  async function createBlank() {
    setBusy(true);
    try {
      const json = await postJson({
        action: "create_layout",
        title: "New network layout",
        leadId: clients[0]?.id ?? null,
      });
      if (json.layoutId) {
        window.location.href = `/wireless/layouts/${json.layoutId}`;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Network Layouts</h1>
          <p className="text-sm text-muted-foreground">
            Architectural drafts and published client diagrams
          </p>
        </div>
        <Button
          type="button"
          disabled={busy}
          className="bg-[#C83733] hover:bg-[#a82f2b] text-white"
          onClick={() => void createBlank()}
        >
          New layout
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        {layouts.map((l) => (
          <Card key={l.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{l.title}</p>
                <p className="text-sm text-muted-foreground">
                  {l.clientName ?? "No client"} · {l.canvas.nodes.length} nodes ·{" "}
                  {(l.devices ?? []).length} devices
                </p>
                <p className="text-xs uppercase text-muted-foreground">{l.status}</p>
              </div>
              <Link
                href={`/wireless/layouts/${l.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open editor
              </Link>
            </CardContent>
          </Card>
        ))}
        {!loading && layouts.length === 0 && (
          <p className="text-sm text-muted-foreground">No layouts yet.</p>
        )}
      </div>
    </div>
  );
}

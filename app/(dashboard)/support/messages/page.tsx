"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import type { SupportThread } from "@megs/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default function SupportMessagesPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { accessToken } = useAuth();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch("/api/support/messages", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return;
    }
    setThreads(json.threads ?? []);
    setError(null);
  }, [accessToken]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = useMemo(() => {
    const rank = (s: SupportThread["status"]) =>
      s === "pending" ? 0 : s === "open" ? 1 : 2;
    return [...threads].sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      return (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
    });
  }, [threads]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Messages"
        description="Client chat from the MEGS Field mobile app — accept pending requests to open chat"
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}
      <div className="grid gap-2">
        {sorted.map((th) => (
          <Card key={th.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{th.clientName ?? "Client"}</p>
                  <Badge
                    variant={
                      th.status === "pending"
                        ? "destructive"
                        : th.status === "open"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {th.status === "pending"
                      ? "Pending accept"
                      : th.status === "open"
                        ? "Open"
                        : "Closed"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {th.lastMessageAt
                    ? new Date(th.lastMessageAt).toLocaleString()
                    : new Date(th.createdAt).toLocaleString()}
                  {th.clientAddress ? ` · ${th.clientAddress}` : ""}
                </p>
              </div>
              <Link
                href={`/support/messages/${th.id}`}
                className={buttonVariants({
                  variant: th.status === "pending" ? "default" : "outline",
                  size: "sm",
                  className:
                    th.status === "pending"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : undefined,
                })}
              >
                {th.status === "pending" ? "Review" : "Open"}
              </Link>
            </CardContent>
          </Card>
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No threads yet.</p>
        )}
      </div>
    </PageShell>
  );
}

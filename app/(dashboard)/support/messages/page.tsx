"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import type { SupportThread } from "@megs/shared";
import { Card, CardContent } from "@/components/ui/card";
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

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Messages"
        description="Client chat from the MEGS Field mobile app"
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{error}</div>
      )}
      <div className="grid gap-2">
        {threads.map((th) => (
          <Card key={th.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{th.clientName ?? "Client"}</p>
                <p className="text-xs text-muted-foreground">
                  {th.lastMessageAt
                    ? new Date(th.lastMessageAt).toLocaleString()
                    : "No messages yet"}{" "}
                  · {th.status}
                </p>
              </div>
              <Link
                href={`/support/messages/${th.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open
              </Link>
            </CardContent>
          </Card>
        ))}
        {threads.length === 0 && (
          <p className="text-sm text-muted-foreground">No threads yet.</p>
        )}
      </div>
    </PageShell>
  );
}
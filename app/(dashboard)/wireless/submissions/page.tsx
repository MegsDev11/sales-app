"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWirelessAccess } from "@/lib/hooks/use-wireless-access";
import { useWirelessData } from "@/lib/hooks/use-wireless-data";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function WirelessSubmissionsPage() {
  const { allowed, isLoading } = useWirelessAccess();
  const { submissions, clients, loading, error, postForm, postJson } = useWirelessData();
  const [leadId, setLeadId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [kind, setKind] = useState<"sketch" | "photo">("sketch");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.clientName.localeCompare(b.clientName)),
    [clients]
  );

  if (isLoading || !allowed) return null;

  async function upload() {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("action", "create_submission");
      if (leadId) form.set("leadId", leadId);
      form.set("notes", notes);
      if (files) {
        Array.from(files).forEach((f) => {
          form.append("files", f);
          form.append("kinds", kind);
          form.append("captions", "");
        });
      }
      await postForm(form);
      setNotes("");
      setFiles(null);
      setMsg("Submission uploaded.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(submissionId: string, status: string) {
    await postJson({ action: "update_submission", submissionId, status });
  }

  async function openInEditor(submissionId: string, subLeadId: string | null) {
    setBusy(true);
    try {
      const json = await postJson({
        action: "create_layout",
        submissionId,
        leadId: subLeadId,
        title: "Layout from submission",
      });
      if (json.layoutId) {
        window.location.href = `/wireless/layouts/${json.layoutId}`;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Tech Submissions"
        description="Inbox for site sketches and photos. Managers can upload now; tech app will POST the same API later."
      />

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload (manager)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Client (optional)</label>
            <Select
              value={leadId || "__none__"}
              onValueChange={(v) => setLeadId(!v || v === "__none__" ? "" : String(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {sortedClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">File kind</label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v === "photo" ? "photo" : "sketch")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sketch">Sketch</SelectItem>
                <SelectItem value="photo">Photo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Files</label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>
          <Button
            type="button"
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-white"
            onClick={() => void upload()}
          >
            {busy ? "Uploading…" : "Upload submission"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {submissions.map((s) => (
          <Card key={s.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.clientName ?? "Unassigned"}</p>
                  <p className="text-xs uppercase text-muted-foreground">{s.status}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.notes || "No notes"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(s.id, "in_progress")}
                  >
                    In progress
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void openInEditor(s.id, s.leadId)}
                  >
                    Open in editor
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(s.id, "archived")}
                  >
                    Archive
                  </Button>
                  {s.leadId && (
                    <Link
                      href={`/wireless/clients/${s.leadId}`}
                      className={buttonVariants({ size: "sm", variant: "ghost" })}
                    >
                      Client
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(s.assets ?? []).map((a) =>
                  a.publicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={a.id} href={a.publicUrl} target="_blank" rel="noreferrer">
                      <img
                        src={a.publicUrl}
                        alt={a.caption || a.kind}
                        className="h-20 w-28 rounded border object-cover"
                      />
                    </a>
                  ) : null
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && submissions.length === 0 && (
          <p className="text-sm text-muted-foreground">Inbox is empty.</p>
        )}
      </div>
    </PageShell>
  );
}
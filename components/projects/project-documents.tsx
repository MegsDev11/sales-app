"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { Panel, AlertBanner } from "@/components/layout/page-shell";
import { compact } from "@/components/charts/tokens";
import {
  DOCUMENT_KINDS,
  documentKindMeta,
  type ProjectDocument,
} from "@/lib/projects/constants";
import {
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/**
 * Documents and quotes.
 *
 * A document is either an uploaded file or a link, and the panel does not pretend the
 * two are the same thing: an upload shows its size and a paperclip, a link shows the
 * external-link arrow, because "we hold this" and "this is somewhere on somebody's
 * drive" are different guarantees. Uploads are served through signed URLs that expire,
 * so the list is refetched rather than cached.
 *
 * Quotes and invoices carry a number and a value alongside the file, which is why
 * they are here rather than in a panel of their own — the paper and the figure are
 * the same record, and separating them is how you end up with a quote amount nobody
 * can trace to a document.
 */

interface Props {
  projectId: string;
  accessToken: string;
}

function fileSizeLabel(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectDocuments({ projectId, accessToken }: Props) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("quote");
  const [label, setLabel] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const kindMeta = documentKindMeta(kind);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(
        `/api/projects/documents?projectId=${encodeURIComponent(projectId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load documents");
      setDocuments(body.documents ?? []);
      setCanEdit(Boolean(body.canEdit));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setLabel("");
    setReference("");
    setAmount("");
    setLinkUrl("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("label", label.trim());
      form.set("kind", kind);
      form.set("reference", reference.trim());
      form.set("amount", amount.trim());
      if (file) form.set("file", file);
      else form.set("url", linkUrl.trim());

      const res = await fetch("/api/projects/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add the document");

      reset();
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add the document");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "delete", projectId, id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove the document");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the document");
    } finally {
      setBusy(false);
    }
  };

  // The file wins if one is chosen; the link input is only the fallback.
  const canSubmit = label.trim() && (file || linkUrl.trim());

  return (
    <Panel
      title="Documents & quotes"
      description="Upload the file, or link to it"
      padded={false}
      actions={
        canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        ) : null
      }
    >
      {error ? (
        <div className="p-3 pb-0">
          <AlertBanner tone="danger">{error}</AlertBanner>
        </div>
      ) : null}

      {open && canEdit ? (
        <div className="space-y-2 border-b border-border p-3">
          <Field label="What is it?" htmlFor="document-kind">
            <SelectField
              id="document-kind"
              className="w-full"
              value={kind}
              onValueChange={setKind}
              options={DOCUMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          </Field>

          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kindMeta.money ? "e.g. Quote — phase 2 extension" : "e.g. Final BOQ"}
            className="h-8 text-xs"
          />

          {/* Quote and invoice numbers sit with the file, not in a separate ledger. */}
          {kindMeta.money ? (
            <div className="flex gap-2">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Number, e.g. QUO0010024"
                className="h-8 flex-1 text-xs"
              />
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (R)"
                inputMode="decimal"
                className="h-8 w-32 text-xs"
              />
            </div>
          ) : null}

          <div className="rounded-md border border-dashed border-border p-2.5">
            <input
              ref={fileInput}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
            />
            {file ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {file.name} · {fileSizeLabel(file.size)}
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="ml-1 underline"
                >
                  remove
                </button>
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  …or link to it instead — right for anything that has to stay live, like
                  a Google Earth view.
                </p>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1.5 h-8 text-xs"
                />
              </>
            )}
          </div>

          <Button
            size="sm"
            className="w-full"
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Adding…
              </>
            ) : (
              <>
                {file ? (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {file ? "Upload" : "Add link"}
              </>
            )}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : documents.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          Nothing filed yet. The signed quote and the BOQ are the two worth having here —
          upload them and they stop depending on somebody&rsquo;s drive.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((d) => {
            const meta = documentKindMeta(d.kind);
            const href = d.storage_path ? d.fileUrl : d.url;
            const size = fileSizeLabel(d.file_size);
            return (
              <li key={d.id} className="flex items-start gap-2 px-3 py-2">
                {d.storage_path ? (
                  <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate text-sm hover:underline"
                        title={d.file_name || d.url || undefined}
                      >
                        {d.label}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate text-sm">{d.label}</span>
                    )}
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {meta.label}
                    </span>
                    {d.url ? (
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : null}
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    {[
                      d.reference || null,
                      d.amount != null ? compact(Number(d.amount), true) : null,
                      d.storage_path ? [d.file_name, size].filter(Boolean).join(" · ") : "Link",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void remove(d.id)}
                    disabled={busy}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove ${d.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

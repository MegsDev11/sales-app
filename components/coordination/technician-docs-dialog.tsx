"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Paperclip, Plus, Trash2, Upload } from "lucide-react";

export const DOC_CATEGORIES = [
  { value: "qualification", label: "Qualification" },
  { value: "certification", label: "Certification" },
  { value: "license", label: "Licence" },
  { value: "id_document", label: "ID document" },
  { value: "contract", label: "Contract" },
  { value: "safety", label: "Safety cert" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(value: string) {
  return DOC_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export interface TechnicianDocument {
  id: string;
  technician_id: string;
  category: string;
  title: string;
  reference: string;
  issued_on: string | null;
  expires_on: string | null;
  notes: string;
  file_name: string;
  storage_path: string | null;
  fileUrl?: string | null;
}

/** Expiry status for a document — drives the coloured badge. */
export function expiryStatus(expires_on: string | null): {
  label: string;
  tone: "muted" | "warn" | "danger";
} | null {
  if (!expires_on) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expires_on);
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 30) return { label: `Expires in ${days}d`, tone: "warn" };
  return {
    label: `Valid to ${exp.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`,
    tone: "muted",
  };
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TechnicianDocsDialog({
  technician,
  open,
  onOpenChange,
  accessToken,
  onChanged,
}: {
  technician: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  onChanged: () => void;
}) {
  const [docs, setDocs] = useState<TechnicianDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // add-form fields
  const [category, setCategory] = useState<string>("qualification");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const techId = technician?.id;

  const load = useCallback(async () => {
    if (!techId || !accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/coordination/technicians/documents?technicianId=${encodeURIComponent(techId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load documents");
      setDocs(data.documents ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [techId, accessToken]);

  useEffect(() => {
    if (open) {
      setShowForm(false);
      void load();
    }
  }, [open, load]);

  function resetForm() {
    setCategory("qualification");
    setTitle("");
    setReference("");
    setIssuedOn("");
    setExpiresOn("");
    setNotes("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addDoc() {
    if (!techId) return;
    if (!title.trim()) {
      setError("Give the document a title");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("technicianId", techId);
      fd.append("category", category);
      fd.append("title", title.trim());
      fd.append("reference", reference.trim());
      fd.append("issuedOn", issuedOn);
      fd.append("expiresOn", expiresOn);
      fd.append("notes", notes.trim());
      if (file) fd.append("file", file);
      const res = await fetch("/api/coordination/technicians/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add document");
      resetForm();
      setShowForm(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add document");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coordination/technicians/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Documents &amp; qualifications</DialogTitle>
        </DialogHeader>
        {technician ? (
          <p className="-mt-1 text-xs text-muted-foreground">
            {technician.name} · {technician.title}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* Add */}
        {showForm ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Reference / number
                </label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. cert no." />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Working at Heights, Driver's licence Code 10"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Issued</label>
                <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Expires</label>
                <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  File (optional) — stored privately
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => void addDoc()}
                disabled={busy}
              >
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                Save document
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add document
          </Button>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No documents on file yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => {
              const exp = expiryStatus(doc.expires_on);
              return (
                <li key={doc.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {categoryLabel(doc.category)}
                      </Badge>
                      <span className="font-medium">{doc.title}</span>
                      {exp ? (
                        <Badge
                          className={
                            exp.tone === "danger"
                              ? "border-red-200 bg-red-50 text-[10px] text-red-700"
                              : exp.tone === "warn"
                                ? "border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                                : "border-slate-200 bg-slate-50 text-[10px] text-slate-600"
                          }
                        >
                          {exp.label}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {doc.reference ? <span>Ref: {doc.reference}</span> : null}
                      <span>Issued: {fmtDate(doc.issued_on)}</span>
                      {doc.notes ? <span className="w-full">{doc.notes}</span> : null}
                    </div>
                    {doc.fileUrl ? (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Paperclip className="h-3 w-3" /> {doc.file_name || "View file"}
                      </a>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void deleteDoc(doc.id)}
                    disabled={busy}
                    aria-label="Delete document"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

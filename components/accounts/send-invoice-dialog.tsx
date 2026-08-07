"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/layout/page-shell";
import { paymentLabel, type ClientRecord, type PaymentMethod } from "@/lib/accounts/constants";
import { CheckCircle2, Loader2, Paperclip, Send } from "lucide-react";

/**
 * Review and send one client's monthly invoice.
 *
 * The letter is shown filled in — merge fields resolved, the right variant chosen for
 * how this client pays — and stays editable, because the department writes to its own
 * clients and occasionally needs a sentence changed. What is on screen is exactly what
 * is sent; there is no second templating pass after approval.
 *
 * Nothing here is reversible: pressing Send puts a document in a customer's inbox and
 * a numbered invoice in the books. So the dialog states plainly who it is going to,
 * what is attached, and which mailbox it leaves from, and it will not enable Send at
 * all until SMTP is actually configured.
 */

interface PreviewData {
  subject: string;
  body: string;
  to: string;
  clerk: { displayName: string; email: string; canSendAs: boolean };
  mailer: { configured: boolean; host?: string; user?: string; from?: string; missing: string[] };
  attachments: string[];
  paymentMethod: PaymentMethod;
  total: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

export function SendInvoiceDialog({
  client,
  onClose,
  onSent,
}: {
  client: ClientRecord | null;
  onClose: () => void;
  onSent: () => void;
}) {
  if (!client) return null;
  return <SendInvoiceForm key={client.id} client={client} onClose={onClose} onSent={onSent} />;
}

function SendInvoiceForm({
  client,
  onClose,
  onSent,
}: {
  client: ClientRecord;
  onClose: () => void;
  onSent: () => void;
}) {
  const { accessToken } = useAuth();

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ invoiceNumber: string; sentTo: string } | null>(null);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!accessToken) throw new Error("Not signed in");
      const res = await fetch("/api/accounts/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data;
    },
    [accessToken]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = (await post({ action: "preview", clientId: client.id })) as PreviewData;
        if (cancelled) return;
        setPreview(data);
        setSubject(data.subject);
        setBody(data.body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't build the letter");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post, client.id]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const result = await post({
        action: "send",
        clientId: client.id,
        subject,
        body,
      });
      setSent({ invoiceNumber: result.invoiceNumber, sentTo: result.sentTo });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [post, client.id, subject, body, onSent]);

  const canSend = !!preview?.mailer.configured && !!preview?.to && !sent;

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">Send invoice — {client.name}</DialogTitle>
        </DialogHeader>

        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

        {sent ? (
          <AlertBanner tone="info">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Sent {sent.invoiceNumber} to {sent.sentTo}.
            </span>
          </AlertBanner>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building the letter…
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {!preview.mailer.configured ? (
              <AlertBanner tone="warn">
                <span>
                  Email isn&apos;t configured yet, so this can be reviewed but not sent. Set{" "}
                  <span className="font-mono text-xs">{preview.mailer.missing.join(", ")}</span> in
                  the environment — the password must be an{" "}
                  <span className="font-medium">app password</span>, not the mailbox password.
                </span>
              </AlertBanner>
            ) : null}

            {!preview.to ? (
              <AlertBanner tone="warn">
                {client.name} has no email address, so there is nowhere to send this.
              </AlertBanner>
            ) : null}

            {/* --- envelope --- */}
            <div className="grid gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <Row label="To">{preview.to || <span className="text-amber-700">no address</span>}</Row>
              <Row label="From">
                {preview.clerk.canSendAs && preview.clerk.email
                  ? `${preview.clerk.displayName} <${preview.clerk.email}>`
                  : `${preview.clerk.displayName} <${preview.mailer.from ?? "not configured"}>`}
              </Row>
              <Row label="Reply-To">
                {preview.clerk.email || (
                  <span className="text-muted-foreground">
                    {preview.mailer.from ?? "not configured"} — no address set for this clerk
                  </span>
                )}
              </Row>
              <Row label="Invoice">
                {money(preview.total)}{" "}
                <Badge variant="secondary" className="ml-1">
                  {paymentLabel(preview.paymentMethod)}
                </Badge>
              </Row>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Subject</span>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!sent} />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Message</span>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className="font-sans text-sm leading-relaxed"
                disabled={!!sent}
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {preview.paymentMethod === "debit_order"
                  ? "This client is on debit order, so the letter tells them the amount rather than asking for payment."
                  : "Sent exactly as written here."}
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              {preview.attachments.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {sent ? "Done" : "Cancel"}
          </Button>
          {!sent ? (
            <Button
              onClick={() => void send()}
              disabled={!canSend || sending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {sending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send invoice
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground">{children}</span>
    </div>
  );
}

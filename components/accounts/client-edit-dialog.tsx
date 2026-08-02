"use client";

import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/layout/page-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNTS_OWNERS } from "@/lib/accounts/parse-clients";
import {
  BILLING_STATUSES,
  PAYMENT_METHODS,
  VAT_DIVISOR,
  isBillable,
  paymentLabel,
  requestsPayment,
  round2,
  statusLabel,
  type BillingStatus,
  type ClientRecord,
  type PaymentMethod,
} from "@/lib/accounts/constants";
import { Loader2, Save } from "lucide-react";

/**
 * Correct one client by hand.
 *
 * Everything the monthly invoice run depends on is editable here, because this dialog
 * is where a row leaves the review queue: an account status, how the client pays, the
 * address the invoice goes to, and the monthly price. Saving marks the row reviewed —
 * a person has now looked at it, which is the only thing "needs review" ever meant.
 *
 * The panel at the bottom states plainly whether this client would be invoiced and
 * what the covering letter will say, so the consequence of a status change is visible
 * at the moment it is made rather than discovered in a client's inbox.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

export function ClientEditDialog({
  client,
  onClose,
  onSaved,
  canEdit,
}: {
  client: ClientRecord | null;
  onClose: () => void;
  onSaved: (payload: Record<string, unknown>) => Promise<unknown>;
  canEdit: boolean;
}) {
  if (!client) return null;
  // Keyed by client id so opening a different row REMOUNTS the form with that
  // client's values. The alternative — one long-lived form resynced by an effect —
  // is the shape that leaks one client's edits into the next when the effect and the
  // render disagree about which client is open. On a form that sets what a customer
  // is billed, that is not a risk worth the saved allocation.
  return (
    <ClientEditForm
      key={client.id}
      client={client}
      onClose={onClose}
      onSaved={onSaved}
      canEdit={canEdit}
    />
  );
}

function ClientEditForm({
  client,
  onClose,
  onSaved,
  canEdit,
}: {
  client: ClientRecord;
  onClose: () => void;
  onSaved: (payload: Record<string, unknown>) => Promise<unknown>;
  canEdit: boolean;
}) {
  const [status, setStatus] = useState<BillingStatus>(client.billingStatus);
  const [payment, setPayment] = useState<PaymentMethod>(client.paymentMethod);
  const [owner, setOwner] = useState<string>(client.accountsOwner ?? "");
  const [email, setEmail] = useState(client.email);
  const [contactName, setContactName] = useState(client.contactName);
  const [mobile, setMobile] = useState(client.mobile);
  const [price, setPrice] = useState(
    client.packagePriceIncl === null ? "" : String(client.packagePriceIncl)
  );
  const [note, setNote] = useState(client.billingNote);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const trimmed = price.trim();
      const parsedPrice = trimmed === "" ? "" : Number(trimmed.replace(/[R\s,]/g, ""));
      if (parsedPrice !== "" && !Number.isFinite(parsedPrice)) {
        throw new Error(`"${price}" isn't a number.`);
      }

      await onSaved({
        action: "update",
        id: client.id,
        billingStatus: status,
        paymentMethod: payment,
        accountsOwner: owner,
        email: email.trim().toLowerCase(),
        contactName: contactName.trim(),
        mobile: mobile.trim(),
        packagePriceIncl: parsedPrice,
        billingNote: note.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }, [client, status, payment, owner, email, contactName, mobile, price, note, onSaved, onClose]);

  const priceValue = Number(price.trim().replace(/[R\s,]/g, ""));
  const hasPrice = price.trim() !== "" && Number.isFinite(priceValue);
  const willInvoice = isBillable(status) && hasPrice && !!email.trim();

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{client.name}</DialogTitle>
        </DialogHeader>

        {client.staffRaw ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            Sage <span className="font-medium">Staff</span> column:{" "}
            <span className="font-mono">{client.staffRaw}</span>
          </p>
        ) : null}

        {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account status" hint="Only Active clients are ever invoiced.">
            <Select value={status} onValueChange={(v) => setStatus((v ?? status) as BillingStatus)}>
              <SelectTrigger disabled={!canEdit}>
                {/* This Select renders the raw value unless given a mapper. */}
                <SelectValue>{(v) => statusLabel(String(v) as BillingStatus)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BILLING_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Pays by" hint="Decides whether the letter asks for payment.">
            <Select
              value={payment}
              onValueChange={(v) => setPayment((v ?? payment) as PaymentMethod)}
            >
              <SelectTrigger disabled={!canEdit}>
                <SelectValue>{(v) => paymentLabel(String(v) as PaymentMethod)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Accounts owner" hint="Signs this client's invoice emails.">
            <Select value={owner || "none"} onValueChange={(v) => setOwner(v === "none" ? "" : (v ?? ""))}>
              <SelectTrigger disabled={!canEdit}>
                <SelectValue>{(v) => (v === "none" ? "Unassigned" : String(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {ACCOUNTS_OWNERS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Monthly price (incl VAT)"
            hint={
              hasPrice
                ? `${money(round2(priceValue / VAT_DIVISOR))} excl VAT`
                : client.packageRaw
                  ? `Sage: ${client.packageRaw}`
                  : "No package recorded in Sage."
            }
          >
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="299.00"
              inputMode="decimal"
              disabled={!canEdit}
            />
          </Field>

          <Field label="Invoice email" hint="Where the monthly invoice is sent.">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.co.za"
              type="email"
              disabled={!canEdit}
            />
          </Field>

          <Field label="Contact name">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Mobile">
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!canEdit} />
          </Field>

          <Field label="Billing note" hint="Free text for the department. Never parsed.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Collects invoice at the office"
              disabled={!canEdit}
            />
          </Field>
        </div>

        {/* What this client will actually receive, stated before it happens. */}
        <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm">
          {willInvoice ? (
            <p className="text-foreground">
              <Badge className="mr-1.5">Will be invoiced</Badge>
              {money(priceValue)} a month to{" "}
              <span className="font-medium">{email.trim()}</span>.{" "}
              {requestsPayment(payment)
                ? "The letter asks for payment and a POP."
                : "The letter states the amount only — no payment is requested."}
            </p>
          ) : (
            <p className="text-muted-foreground">
              <Badge variant="secondary" className="mr-1.5">
                Not invoiced
              </Badge>
              {!isBillable(status)
                ? `Status is "${BILLING_STATUSES.find((s) => s.value === status)?.label ?? status}".`
                : !email.trim()
                  ? "No email address to send to."
                  : "No monthly price set."}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || !canEdit}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] leading-tight text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

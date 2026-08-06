"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isBillable, type BillingStatus, type ClientRecord } from "@/lib/accounts/constants";

export type DocumentKind = "invoice" | "statement";

/**
 * Open a client's tax invoice or transactions report in a new tab.
 *
 * Lifted out of the client dialog so the actions can sit on the client list itself.
 * Reaching a client's invoice should not require opening and closing an edit form —
 * the monthly run is a pass down a list, not 2 000 round trips through a dialog.
 *
 * `busyFor` is keyed by client AND kind rather than a single boolean, so a spinner
 * appears on the one button that was pressed instead of every button in the table.
 */
export function useClientDocuments() {
  const { accessToken } = useAuth();
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openDocument = useCallback(
    async (clientId: string, kind: DocumentKind) => {
      if (!accessToken) return;
      setBusyFor(`${clientId}:${kind}`);
      setError(null);
      try {
        const res = await fetch(
          `/api/accounts/documents?type=${kind}&clientId=${encodeURIComponent(clientId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
        );
        if (!res.ok) {
          // Failures come back as JSON — usually "no monthly price recorded". Opening
          // the response blindly would give the user a tab containing the word
          // "error" and no idea why.
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Couldn't generate the ${kind}`);
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        window.open(href, "_blank", "noopener");
        // Revoked on a delay: revoking immediately races the new tab's load.
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't generate the ${kind}`);
      } finally {
        setBusyFor(null);
      }
    },
    [accessToken]
  );

  const isBusy = useCallback(
    (clientId: string, kind: DocumentKind) => busyFor === `${clientId}:${kind}`,
    [busyFor]
  );

  return { openDocument, isBusy, busy: busyFor !== null, error, clearError: () => setError(null) };
}

/**
 * Why a client can't be sent an invoice, or null when they can.
 *
 * Returned as a sentence rather than a boolean because it becomes the tooltip on the
 * disabled button — "Send invoice" greyed out with no explanation is the thing that
 * generates the support call.
 */
export function invoiceBlockedReason(client: ClientRecord): string | null {
  if (!isBillable(client.billingStatus as BillingStatus)) {
    return `Not invoiced — status is "${client.billingStatus.replace(/_/g, " ")}".`;
  }
  if (client.packagePriceIncl === null) return "No monthly price recorded for this client.";
  if (!client.email) return "No email address to send to.";
  return null;
}

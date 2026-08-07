import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage, withHint } from "@/lib/api/route-helpers";
import {
  buildInvoiceDocument,
  buildStatementDocument,
  loadClient,
  loadSettings,
  parseDate,
} from "@/lib/accounts/documents";

/**
 * Renders the two documents MEGS sends clients.
 *
 * GET ?type=invoice&clientId=…             -> a tax invoice PDF
 * GET ?type=statement&clientId=…&from=&to= -> a customer transactions report PDF
 *
 * BOTH ARE PREVIEWS AND NEITHER WRITES. In particular an invoice preview does NOT
 * allocate an invoice number — it prints `PREVIEW` where the number goes. Numbers are
 * a legal sequence with no gaps permitted, and burning one every time somebody clicks
 * a button to look at a document would leave the books full of holes to explain.
 * Issuing for real happens in /api/accounts/invoices, which is a deliberate act.
 *
 * The documents themselves are built by lib/accounts/documents so that a previewed
 * invoice and an emailed invoice are byte-for-byte the same document.
 *
 * Guarded at accounts/view: producing a document is a read of data the user can
 * already see. RLS enforces the same rule independently.
 */

export const runtime = "nodejs";

const MIGRATION_HINT =
  "run supabase/migrations/052…054 in Supabase (payment method, invoicing, transactions).";

function pdfResponse(bytes: Uint8Array, filename: string) {
  // `inline` so the browser previews it; the UI adds `download` when saving.
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(request: Request) {
  const user = await requireAccess(request, "accounts", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") ?? "invoice").trim();
  const clientId = (url.searchParams.get("clientId") ?? "").trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const db = adminClient();

  try {
    const client = await loadClient(db, clientId);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const settings = await loadSettings(db);

    if (type === "invoice") {
      // A preview never takes a number out of the sequence.
      const built = await buildInvoiceDocument(client, settings, { invoiceNumber: "PREVIEW" });
      return pdfResponse(built.pdf, `Tax Invoice - ${client.name}.pdf`);
    }

    if (type === "statement") {
      const today = new Date();
      const defaultFrom = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
      );
      const from = parseDate(url.searchParams.get("from")) ?? defaultFrom;
      const to = parseDate(url.searchParams.get("to")) ?? today;

      const built = await buildStatementDocument(db, client, settings, { from, to });
      return pdfResponse(built.pdf, built.filename);
    }

    return NextResponse.json({ error: `Unknown document type: ${type}` }, { status: 400 });
  } catch (e) {
    const message = errorMessage(e);
    // "no monthly price" is the caller's problem to fix, not a server fault.
    const status = /has no monthly price/.test(message) ? 400 : 500;
    return NextResponse.json({ error: withHint(message, MIGRATION_HINT) }, { status });
  }
}

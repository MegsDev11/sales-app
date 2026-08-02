import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4,
  BRAND,
  HEAD_BG,
  MARGIN,
  MUTED,
  RIGHT,
  clip,
  imageKind,
  printedDate,
  rule,
  shortDate,
  statementMoney,
  text,
  type Ctx,
} from "./pdf-layout";

/**
 * Renders the Customer Transactions Report — the statement that goes out alongside
 * the monthly invoice.
 *
 * Reproduces what Sage prints (taken from the department's real 31/07/2026 report):
 * opening balance, every transaction in the range with a running balance, then
 * closing balance, movement for the period and grand total.
 *
 * THE RUNNING BALANCE IS COMPUTED HERE, NOT STORED. Each ledger row carries only its
 * own debit or credit; the balance column is accumulated as the rows are laid out.
 * Payments are frequently captured days after they arrive, and a stored running
 * balance would be silently wrong on every row after any backdated entry.
 *
 * WHEN THE HISTORY IS INCOMPLETE, THE DOCUMENT SAYS SO. MEGS has years of
 * transactions that live only inside Sage. If the requested range begins before the
 * app's ledger does, the report prints a note to that effect instead of implying that
 * an opening balance of R 0.00 is the whole truth. A statement that quietly understates
 * what a client owes is worse than one that admits where its history starts.
 */

export interface StatementTransaction {
  date: Date;
  reference: string;
  /** "Tax Invoice", "Payment", "Credit Note" — printed verbatim. */
  transactionType: string;
  description: string;
  debit: number;
  credit: number;
}

export interface StatementInput {
  companyName: string;
  clientName: string;
  /** Sage prints "Customer: <account> - <name>"; usually the same string twice. */
  clientAccount?: string;
  rangeStart: Date;
  rangeEnd: Date;
  /** Balance carried into `rangeStart`. */
  openingBalance: number;
  transactions: StatementTransaction[];
  /** When the app's ledger starts after `rangeStart`, the document says so. */
  historyStartsAt?: Date | null;
  printedAt?: Date;
  logo?: Uint8Array;
}

const COL = {
  date: MARGIN + 2,
  reference: MARGIN + 62,
  type: MARGIN + 140,
  description: MARGIN + 210,
  debit: 420,
  credit: 484,
  balance: RIGHT - 2,
};

/** Rows that fit below the header before a new page is needed. */
const FIRST_PAGE_ROWS = 42;
const LATER_PAGE_ROWS = 62;

export async function renderStatementPdf(input: StatementInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Customer Transactions Report - ${input.clientName}`);
  doc.setProducer("MEGS Waterberg");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const printed = input.printedAt ?? new Date();

  // Chronological, with a stable tiebreak so two entries on one day never swap
  // between renders — a statement that reorders itself looks falsified.
  const rows = [...input.transactions].sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime();
    return diff !== 0 ? diff : a.reference.localeCompare(b.reference);
  });

  // Paginate up front so "Page 1 of N" can be printed on page 1.
  const pages: StatementTransaction[][] = [];
  let cursor = 0;
  while (cursor < rows.length || pages.length === 0) {
    const size = pages.length === 0 ? FIRST_PAGE_ROWS : LATER_PAGE_ROWS;
    pages.push(rows.slice(cursor, cursor + size));
    cursor += size;
  }

  let balance = input.openingBalance;
  const totalPages = pages.length;

  pages.forEach((pageRows, pageIndex) => {
    const page = doc.addPage(A4);
    const ctx: Ctx = { page, font, bold };
    let y = A4[1] - MARGIN;

    /* --- heading, first page only --- */
    if (pageIndex === 0) {
      // The title always prints — Sage leads with it. The letterhead is embedded
      // after the page loop (embedding is async) and sits in the top-right corner.
      text(ctx, "Customer Transactions Report", MARGIN, y - 10, { size: 14, bold: true });
      y -= 26;

      text(ctx, input.companyName, MARGIN, y, { size: 9, bold: true, color: BRAND });
      y -= 13;
      text(
        ctx,
        `Customer: ${input.clientAccount ?? input.clientName} - ${input.clientName}`,
        MARGIN,
        y,
        { size: 8 }
      );
      y -= 11;
      text(ctx, "Category: All Categories", MARGIN, y, { size: 8 });
      y -= 11;
      text(
        ctx,
        `Date Range: ${shortDate(input.rangeStart)}  - ${shortDate(input.rangeEnd)}`,
        MARGIN,
        y,
        { size: 8 }
      );
      y -= 18;
    } else {
      text(ctx, "Customer Transactions Report", MARGIN, y - 10, { size: 11, bold: true });
      text(ctx, input.clientName, RIGHT, y - 10, { size: 9, align: "right" });
      y -= 28;
    }

    /* --- column headings --- */
    text(ctx, "Customer", MARGIN, y, { size: 8, bold: true });
    y -= 12;

    page.drawRectangle({ x: MARGIN, y: y - 3, width: RIGHT - MARGIN, height: 13, color: HEAD_BG });
    text(ctx, "Date", COL.date, y, { size: 7.5, bold: true });
    text(ctx, "Reference", COL.reference, y, { size: 7.5, bold: true });
    text(ctx, "Transaction Type", COL.type, y, { size: 7.5, bold: true });
    text(ctx, "Description", COL.description, y, { size: 7.5, bold: true });
    text(ctx, "Debit", COL.debit, y, { size: 7.5, bold: true, align: "right" });
    text(ctx, "Credit", COL.credit, y, { size: 7.5, bold: true, align: "right" });
    text(ctx, "Balance", COL.balance, y, { size: 7.5, bold: true, align: "right" });
    y -= 15;

    /* --- opening balance, first page only --- */
    if (pageIndex === 0) {
      text(ctx, input.clientName, COL.date, y, { size: 8, bold: true });
      y -= 11;

      text(ctx, `Opening Balance as at: ${shortDate(input.rangeStart)}`, COL.date, y, {
        size: 7.5,
      });
      text(ctx, statementMoney(input.openingBalance), COL.balance, y, {
        size: 7.5,
        align: "right",
      });
      y -= 11;

      if (input.historyStartsAt && input.historyStartsAt > input.rangeStart) {
        // Say plainly where the app's history begins rather than implying this
        // opening figure covers the client's whole life with MEGS.
        for (const note of [
          `Transactions before ${shortDate(input.historyStartsAt)} are held in Sage and are`,
          "summarised in the opening balance above.",
        ]) {
          text(ctx, note, COL.date, y, { size: 6.5, color: MUTED });
          y -= 8;
        }
        y -= 2;
      }
    }

    /* --- transactions --- */
    for (const row of pageRows) {
      balance += row.debit - row.credit;

      text(ctx, shortDate(row.date), COL.date, y, { size: 7.5 });
      text(ctx, clip(row.reference, font, 7.5, COL.type - COL.reference - 6), COL.reference, y, {
        size: 7.5,
      });
      text(
        ctx,
        clip(row.transactionType, font, 7.5, COL.description - COL.type - 6),
        COL.type,
        y,
        { size: 7.5 }
      );
      text(
        ctx,
        clip(row.description, font, 7.5, COL.debit - COL.description - 46),
        COL.description,
        y,
        { size: 7.5 }
      );
      if (row.debit) {
        text(ctx, statementMoney(row.debit), COL.debit, y, { size: 7.5, align: "right" });
      }
      if (row.credit) {
        text(ctx, statementMoney(row.credit), COL.credit, y, { size: 7.5, align: "right" });
      }
      text(ctx, statementMoney(balance), COL.balance, y, { size: 7.5, align: "right" });
      y -= 11;
    }

    /* --- totals, last page only --- */
    if (pageIndex === totalPages - 1) {
      rule(ctx, y + 4);
      y -= 8;

      const movement = balance - input.openingBalance;
      const summary: [string, number, boolean][] = [
        [`Closing Balance as at: ${shortDate(input.rangeEnd)}`, balance, false],
        ["Movement for the period", movement, false],
        ["Grand Total:", balance, true],
      ];
      for (const [label, value, isBold] of summary) {
        text(ctx, label, COL.date, y, { size: 7.5, bold: isBold });
        text(ctx, statementMoney(value), COL.balance, y, { size: 7.5, bold: isBold, align: "right" });
        y -= 12;
      }
    }

    /* --- footer --- */
    text(ctx, `Date Printed: ${printedDate(printed)}`, MARGIN, MARGIN - 6, {
      size: 7,
      color: MUTED,
    });
    text(ctx, `Page ${pageIndex + 1} of ${totalPages}`, RIGHT, MARGIN - 6, {
      size: 7,
      color: MUTED,
      align: "right",
    });
  });

  /* --- letterhead on page 1 --- */
  const kind = input.logo ? imageKind(input.logo) : null;
  if (input.logo && kind) {
    try {
      const image = kind === "png" ? await doc.embedPng(input.logo) : await doc.embedJpg(input.logo);
      const scale = Math.min(120 / image.width, 36 / image.height);
      doc.getPage(0).drawImage(image, {
        x: RIGHT - image.width * scale,
        y: A4[1] - MARGIN - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
    } catch {
      // A letterhead that won't decode must not stop a statement going out.
    }
  }

  return doc.save();
}

/* ------------------------------------------------------------------ *
 * Opening balances
 * ------------------------------------------------------------------ */

export interface LedgerRow {
  date: Date;
  debit: number;
  credit: number;
}

/**
 * The balance carried into `from`: every movement strictly before it.
 *
 * Computed from the ledger rather than read off `accounts_clients.balance`, because
 * that column is a snapshot of one moment and a statement can be run for any range.
 */
export function openingBalanceFor(rows: LedgerRow[], from: Date): number {
  return rows
    .filter((r) => r.date < from)
    .reduce((sum, r) => sum + r.debit - r.credit, 0);
}

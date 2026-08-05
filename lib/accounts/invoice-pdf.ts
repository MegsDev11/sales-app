import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  A4,
  BRAND,
  HEAD_BG,
  MARGIN,
  MUTED,
  RIGHT,
  imageKind,
  money,
  percent,
  rule,
  shortDate,
  text,
  wrap,
  type Ctx,
} from "./pdf-layout";

// Re-exported so callers that render invoices get the invoice's own formats without
// having to know which module they live in.
export { money, percent, shortDate };

/**
 * Renders a MEGS tax invoice as a PDF.
 *
 * Deliberately a close reproduction of the invoice Sage produces, because clients
 * have been receiving that document for years — a monthly bill that suddenly looks
 * like a different company's paperwork invites "is this a phishing attempt?" phone
 * calls, which cost more than the layout work. Field order, wording and the two
 * standing notices are therefore kept as Sage prints them, taken from a real invoice
 * (INV0192812).
 *
 * Two details of Sage's formatting look like bugs and are not: money is printed with
 * a DOT decimal (`R100.00`) while percentages use a COMMA (`0,00%`). Both are
 * reproduced exactly so the documents sit side by side without looking edited.
 *
 * VAT is computed from the inclusive price, which is the direction the business
 * actually works in: a client is quoted "50 Mbps @ R399" and the ex-VAT figure is
 * derived, never the other way round.
 */

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export interface InvoiceCompany {
  companyName: string;
  vatNumber: string;
  postalAddress: string;
  physicalAddress: string;
  officePhone: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
  popEmail: string;
  invoiceNotice: string;
  smsNotice: string;
}

export interface InvoiceLineInput {
  code: string;
  description: string;
  qty: number;
  unitPriceIncl: number;
  discountPct: number;
  vatPct: number;
  totalExcl: number;
  totalIncl: number;
}

export interface InvoiceInput {
  invoiceNumber: string;
  /** Sage prints the client's own name here as the reference. */
  reference: string;
  invoiceDate: Date;
  dueDate: Date;
  /** Printed as SALES REP. On a monthly subscription invoice this is the clerk. */
  salesRep: string;
  clientName: string;
  clientVatNumber?: string;
  clientAddress?: string;
  lines: InvoiceLineInput[];
  totalExcl: number;
  totalVat: number;
  totalIncl: number;
  totalDiscount?: number;
  /** What the client owes overall. Defaults to this invoice's total. */
  balanceDue?: number;
  company: InvoiceCompany;
  /** Letterhead image bytes, PNG or JPEG. Omitted renders the company name as text. */
  logo?: Uint8Array;
  /**
   * Document heading. Defaults to "TAX INVOICE"; quotes pass "QUOTATION" and
   * reuse the whole layout — same letterhead, same table, same totals.
   */
  documentTitle?: string;
  /** Label for the due-date meta row; quotes pass "VALID UNTIL:". */
  dueDateLabel?: string;
}


/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/** Column x-positions for the line-item table, matched to Sage's proportions. */
const COL = {
  description: MARGIN + 4,
  qty: 300,
  price: 348,
  disc: 404,
  vat: 448,
  excl: 502,
  incl: RIGHT - 4,
};

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

export async function renderInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const heading = input.documentTitle ?? "TAX INVOICE";
  const headingTitle = heading
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  doc.setTitle(`${headingTitle} - ${input.invoiceNumber}`);
  doc.setSubject(`${headingTitle} for ${input.clientName}`);
  doc.setProducer("MEGS Waterberg");

  const page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold };

  const { company } = input;
  let y = A4[1] - MARGIN;

  /* --- letterhead --- */
  let drewLogo = false;
  const kind = input.logo ? imageKind(input.logo) : null;
  if (input.logo && kind) {
    try {
      const image =
        kind === "png" ? await doc.embedPng(input.logo) : await doc.embedJpg(input.logo);
      // Fit inside a 150×46 box without distorting the mark.
      const scale = Math.min(150 / image.width, 46 / image.height);
      page.drawImage(image, {
        x: MARGIN,
        y: y - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
      drewLogo = true;
    } catch {
      // A logo that won't decode must not stop an invoice going out.
    }
  }
  if (!drewLogo) {
    text(ctx, company.companyName, MARGIN, y - 14, { size: 13, bold: true, color: BRAND });
  }

  text(ctx, heading, RIGHT, y - 8, { size: 16, bold: true, align: "right" });

  /* --- meta block --- */
  y -= 30;
  const meta: [string, string][] = [
    ["NUMBER:", input.invoiceNumber],
    ["REFERENCE:", input.reference],
    ["DATE:", shortDate(input.invoiceDate)],
    [input.dueDateLabel ?? "DUE DATE:", shortDate(input.dueDate)],
    ["SALES REP:", input.salesRep],
    ["OVERALL DISCOUNT %:", percent(0)],
    ["PAGE:", "1/1"],
  ];
  for (const [label, value] of meta) {
    text(ctx, label, RIGHT - 96, y, { size: 7.5, color: MUTED, align: "right" });
    text(ctx, value, RIGHT, y, { size: 7.5, bold: true, align: "right" });
    y -= 10;
  }

  /* --- FROM / TO --- */
  y = Math.min(y, A4[1] - MARGIN - 92) - 6;
  rule(ctx, y + 12);
  text(ctx, "FROM", MARGIN, y, { size: 7.5, bold: true, color: MUTED });
  text(ctx, "TO", 320, y, { size: 7.5, bold: true, color: MUTED });
  y -= 12;

  const fromLines = [
    company.companyName,
    `VAT NO: ${company.vatNumber}`,
    "",
    "POSTAL ADDRESS:",
    ...company.postalAddress.split("\n"),
    "",
    "PHYSICAL ADDRESS:",
    ...company.physicalAddress.split("\n"),
    `Office ${company.officePhone}`,
  ];
  const toLines = [
    input.clientName,
    `CUSTOMER VAT NO: ${input.clientVatNumber ?? ""}`,
    ...(input.clientAddress
      ? ["", "PHYSICAL ADDRESS:", ...input.clientAddress.split("\n")]
      : []),
  ];

  const blockTop = y;
  fromLines.forEach((line, i) => {
    text(ctx, line, MARGIN, blockTop - i * 9.5, { size: 7.5, bold: i === 0 });
  });
  toLines.forEach((line, i) => {
    text(ctx, line, 320, blockTop - i * 9.5, { size: 7.5, bold: i === 0 });
  });

  y = blockTop - Math.max(fromLines.length, toLines.length) * 9.5 - 10;

  /* --- line items --- */
  page.drawRectangle({
    x: MARGIN,
    y: y - 3,
    width: RIGHT - MARGIN,
    height: 14,
    color: HEAD_BG,
  });
  text(ctx, "Description", COL.description, y, { size: 7.5, bold: true });
  text(ctx, "Quantity", COL.qty, y, { size: 7.5, bold: true, align: "right" });
  text(ctx, "Incl. Price", COL.price, y, { size: 7.5, bold: true, align: "right" });
  text(ctx, "Disc %", COL.disc, y, { size: 7.5, bold: true, align: "right" });
  text(ctx, "VAT %", COL.vat, y, { size: 7.5, bold: true, align: "right" });
  text(ctx, "Excl. Total", COL.excl, y, { size: 7.5, bold: true, align: "right" });
  text(ctx, "Incl. Total", COL.incl, y, { size: 7.5, bold: true, align: "right" });
  y -= 16;

  for (const line of input.lines) {
    const label = line.code ? `${line.code} - ${line.description}` : line.description;
    // The description column runs to just before Quantity.
    const wrapped = wrap(label, font, 7.5, COL.qty - COL.description - 46);

    wrapped.forEach((part, i) => {
      text(ctx, part, COL.description, y - i * 9, { size: 7.5 });
    });

    // Sage prints the numbers against the LAST line of a wrapped description.
    const numbersY = y - (wrapped.length - 1) * 9;
    text(ctx, line.qty.toFixed(1), COL.qty, numbersY, { size: 7.5, align: "right" });
    text(ctx, money(line.unitPriceIncl), COL.price, numbersY, { size: 7.5, align: "right" });
    text(ctx, percent(line.discountPct), COL.disc, numbersY, { size: 7.5, align: "right" });
    text(ctx, percent(line.vatPct), COL.vat, numbersY, { size: 7.5, align: "right" });
    text(ctx, money(line.totalExcl), COL.excl, numbersY, { size: 7.5, align: "right" });
    text(ctx, money(line.totalIncl), COL.incl, numbersY, { size: 7.5, align: "right" });

    y = numbersY - 13;
  }

  rule(ctx, y + 4);
  y -= 8;

  /* --- notices and banking --- */
  const noticeTop = y;
  text(ctx, company.invoiceNotice, MARGIN, y, { size: 7.5, bold: true });
  y -= 16;

  for (const line of [
    company.bankAccountName,
    company.bankName,
    company.bankAccountNumber,
    company.bankBranchCode,
  ]) {
    text(ctx, line, MARGIN, y, { size: 7.5 });
    y -= 9.5;
  }
  text(ctx, `EMAIL PROOF OF PAYMENT TO: ${company.popEmail}`, MARGIN, y, {
    size: 7.5,
    bold: true,
  });
  y -= 16;

  for (const part of wrap(company.smsNotice, font, 7, 300)) {
    text(ctx, part, MARGIN, y, { size: 7, color: MUTED });
    y -= 8.5;
  }

  /* --- totals, right column alongside the notices --- */
  let ty = noticeTop;
  const totals: [string, string, boolean][] = [
    ["Total Discount:", money(input.totalDiscount ?? 0), false],
    ["Total Exclusive:", money(input.totalExcl), false],
    ["Total VAT:", money(input.totalVat), false],
    ["Sub Total:", money(input.totalIncl), false],
    ["Grand Total:", money(input.totalIncl), true],
  ];
  for (const [label, value, isBold] of totals) {
    text(ctx, label, RIGHT - 74, ty, { size: 7.5, color: MUTED, align: "right", bold: isBold });
    text(ctx, value, RIGHT, ty, { size: 7.5, bold: isBold, align: "right" });
    ty -= 11;
  }

  ty -= 4;
  const balance = input.balanceDue ?? input.totalIncl;
  page.drawRectangle({
    x: RIGHT - 170,
    y: ty - 17,
    width: 170,
    height: 26,
    color: HEAD_BG,
  });
  text(ctx, "BALANCE DUE", RIGHT - 82, ty - 4, { size: 8, bold: true, align: "right" });
  text(ctx, money(balance), RIGHT - 6, ty - 4, { size: 10, bold: true, align: "right" });

  return doc.save();
}

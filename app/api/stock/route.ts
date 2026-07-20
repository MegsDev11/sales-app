import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  requireAuthenticated,
  requireStockAccess,
  requireStockRequestsAccess,
} from "@/lib/supabase/server-auth";
import {
  appNotificationToRow,
  stockBookingFromRow,
  stockBookingToRow,
  stockItemFromRow,
  stockItemToRow,
  stockItemUpdatesToRow,
  stockProductFromRow,
  stockRequestFromRow,
  stockRequestLineToRow,
  stockRequestToRow,
} from "@/lib/supabase/mappers";
import type { AppNotification, StockItem, StockRequest, StockRequestLine } from "@/lib/types";
import { extractStockQrToken } from "@/lib/stock-qr-token";

function makeToken() {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function loadStockBundle() {
  const supabase = createSupabaseAdminClient();
  const [productsRes, itemsRes, bookingsRes, requestsRes, linesRes] = await Promise.all([
    supabase.from("stock_products").select("*").order("name"),
    supabase.from("stock_items").select("*").order("created_at", { ascending: false }),
    supabase.from("stock_bookings").select("*").order("booked_out_at", { ascending: false }),
    supabase.from("stock_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("stock_request_lines").select("*"),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  if (linesRes.error) throw linesRes.error;

  const linesByRequest = new Map<string, typeof linesRes.data>();
  for (const line of linesRes.data ?? []) {
    const list = linesByRequest.get(line.request_id) ?? [];
    list.push(line);
    linesByRequest.set(line.request_id, list);
  }

  return {
    products: (productsRes.data ?? []).map(stockProductFromRow),
    items: (itemsRes.data ?? []).map(stockItemFromRow),
    bookings: (bookingsRes.data ?? []).map(stockBookingFromRow),
    requests: (requestsRes.data ?? []).map((row) =>
      stockRequestFromRow(row, linesByRequest.get(row.id) ?? [])
    ),
  };
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const data = await loadStockBundle();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type StockAction =
  | {
      action: "createItem";
      productId: string;
      brand: string;
      deviceName: string;
      serialNumber: string;
    }
  | {
      action: "updateItem";
      itemId: string;
      brand?: string;
      deviceName?: string;
      serialNumber?: string;
      status?: StockItem["status"];
    }
  | {
      action: "bookOut";
      itemId: string;
      technicianId: string;
      leadId?: string | null;
      requestId?: string | null;
      notes?: string;
    }
  | {
      action: "returnItem";
      itemId: string;
    }
  | {
      action: "createRequest";
      title: string;
      technicianId: string;
      leadId?: string | null;
      notes?: string;
      lines: { productId: string; qtyNeeded: number }[];
    }
  | {
      action: "cancelRequest";
      requestId: string;
    }
  | {
      action: "fulfillScan";
      requestId: string;
      qrToken: string;
    };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StockAction;
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (body.action === "createRequest" || body.action === "cancelRequest") {
      const user = await requireStockRequestsAccess(request);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      if (body.action === "createRequest") {
        if (!body.title.trim() || !body.technicianId || !body.lines?.length) {
          return NextResponse.json({ error: "Title, technician, and lines required" }, { status: 400 });
        }
        const requestId = `sreq-${Date.now()}`;
        const stockRequest: Omit<StockRequest, "lines"> = {
          id: requestId,
          title: body.title.trim(),
          technicianId: body.technicianId,
          leadId: body.leadId ?? null,
          status: "open",
          createdBy: user.id,
          createdAt: now,
          notes: body.notes?.trim() ?? "",
        };
        const { error } = await supabase.from("stock_requests").insert(stockRequestToRow(stockRequest));
        if (error) throw error;

        const lines: StockRequestLine[] = body.lines.map((line, i) => ({
          id: `sline-${Date.now()}-${i}`,
          requestId,
          productId: line.productId,
          qtyNeeded: Math.max(1, line.qtyNeeded),
          qtyFulfilled: 0,
        }));
        const { error: linesError } = await supabase
          .from("stock_request_lines")
          .insert(lines.map(stockRequestLineToRow));
        if (linesError) throw linesError;

        const { data: techRow } = await supabase
          .from("team_members")
          .select("name")
          .eq("id", body.technicianId)
          .maybeSingle();
        const techName = techRow?.name ?? "technician";

        const { data: itemRows } = await supabase
          .from("stock_items")
          .select("product_id, status")
          .eq("status", "available");
        const availableByProduct = new Map<string, number>();
        for (const row of itemRows ?? []) {
          availableByProduct.set(
            row.product_id,
            (availableByProduct.get(row.product_id) ?? 0) + 1
          );
        }

        const shortfalls: string[] = [];
        for (const line of lines) {
          const available = availableByProduct.get(line.productId) ?? 0;
          if (line.qtyNeeded > available) {
            const { data: product } = await supabase
              .from("stock_products")
              .select("name")
              .eq("id", line.productId)
              .maybeSingle();
            shortfalls.push(
              `${product?.name ?? line.productId}: need ${line.qtyNeeded}, available ${available}`
            );
          }
        }

        const notifications: AppNotification[] = [
          {
            id: `notif-${Date.now()}-sent`,
            department: "stock",
            type: "stock_request_sent",
            title: `New pick list: ${stockRequest.title}`,
            body: `For ${techName}. Open Stock → Requests to fulfill.`,
            link: "/stock/requests",
            requestId: requestId,
            createdAt: now,
          },
        ];

        if (shortfalls.length > 0) {
          const shortfallBody = shortfalls.join("; ");
          notifications.push(
            {
              id: `notif-${Date.now()}-sf-stock`,
              department: "stock",
              type: "stock_shortfall",
              title: `Stock shortfall: ${stockRequest.title}`,
              body: shortfallBody,
              link: "/stock/requests",
              requestId: requestId,
              createdAt: now,
            },
            {
              id: `notif-${Date.now()}-sf-coord`,
              department: "coordination",
              type: "stock_shortfall",
              title: `Stock shortfall on pick list`,
              body: `${stockRequest.title} — ${shortfallBody}`,
              link: "/coordination/requests",
              requestId: requestId,
              createdAt: now,
            }
          );
        }

        try {
          const { error: notifError } = await supabase
            .from("app_notifications")
            .insert(notifications.map(appNotificationToRow));
          if (notifError) {
            console.error("app_notifications insert:", notifError.message);
          }
        } catch {
          /* migration 008 may not be applied yet */
        }

        return NextResponse.json({
          ok: true,
          id: requestId,
          shortfalls,
          ...(await loadStockBundle()),
        });
      }

      const { error } = await supabase
        .from("stock_requests")
        .update({ status: "cancelled" })
        .eq("id", body.requestId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
    }

    const user = await requireStockAccess(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (body.action === "createItem") {
      const item: StockItem = {
        id: `sitem-${Date.now()}`,
        productId: body.productId,
        qrToken: makeToken(),
        brand: body.brand.trim(),
        deviceName: body.deviceName.trim(),
        serialNumber: body.serialNumber.trim(),
        status: "available",
        createdAt: now,
        updatedAt: now,
      };
      const { error } = await supabase.from("stock_items").insert(stockItemToRow(item));
      if (error) throw error;
      return NextResponse.json({ ok: true, item, ...(await loadStockBundle()) });
    }

    if (body.action === "updateItem") {
      const updates = stockItemUpdatesToRow({
        brand: body.brand,
        deviceName: body.deviceName,
        serialNumber: body.serialNumber,
        status: body.status,
        updatedAt: now,
      });
      const { error } = await supabase.from("stock_items").update(updates).eq("id", body.itemId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
    }

    if (body.action === "bookOut") {
      const { data: itemRow, error: itemError } = await supabase
        .from("stock_items")
        .select("*")
        .eq("id", body.itemId)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!itemRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      if (itemRow.status !== "available") {
        return NextResponse.json({ error: "Item is not available" }, { status: 400 });
      }

      const bookingId = `sbook-${Date.now()}`;
      const { error: bookingError } = await supabase.from("stock_bookings").insert(
        stockBookingToRow({
          id: bookingId,
          itemId: body.itemId,
          technicianId: body.technicianId,
          leadId: body.leadId ?? null,
          requestId: body.requestId ?? null,
          bookedOutAt: now,
          bookedOutBy: user.id,
          notes: body.notes?.trim() ?? "",
        })
      );
      if (bookingError) throw bookingError;

      const { error: updateError } = await supabase
        .from("stock_items")
        .update(stockItemUpdatesToRow({ status: "booked_out", updatedAt: now }))
        .eq("id", body.itemId);
      if (updateError) throw updateError;

      return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
    }

    if (body.action === "returnItem") {
      const { data: openBooking } = await supabase
        .from("stock_bookings")
        .select("id")
        .eq("item_id", body.itemId)
        .is("returned_at", null)
        .maybeSingle();

      if (openBooking) {
        const { error } = await supabase
          .from("stock_bookings")
          .update({ returned_at: now })
          .eq("id", openBooking.id);
        if (error) throw error;
      }

      const { error: updateError } = await supabase
        .from("stock_items")
        .update(stockItemUpdatesToRow({ status: "available", updatedAt: now }))
        .eq("id", body.itemId);
      if (updateError) throw updateError;

      return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
    }

    if (body.action === "fulfillScan") {
      const qrToken = extractStockQrToken(body.qrToken);
      const { data: itemRow, error: itemError } = await supabase
        .from("stock_items")
        .select("*")
        .eq("qr_token", qrToken)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!itemRow) return NextResponse.json({ error: "QR not found" }, { status: 404 });
      if (itemRow.status !== "available") {
        return NextResponse.json({ error: "Item is not available" }, { status: 400 });
      }

      const { data: requestRow, error: reqError } = await supabase
        .from("stock_requests")
        .select("*")
        .eq("id", body.requestId)
        .maybeSingle();
      if (reqError) throw reqError;
      if (!requestRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
      if (requestRow.status === "fulfilled" || requestRow.status === "cancelled") {
        return NextResponse.json({ error: "Request is closed" }, { status: 400 });
      }

      const { data: lines, error: linesError } = await supabase
        .from("stock_request_lines")
        .select("*")
        .eq("request_id", body.requestId);
      if (linesError) throw linesError;

      const line = (lines ?? []).find(
        (l) => l.product_id === itemRow.product_id && l.qty_fulfilled < l.qty_needed
      );
      if (!line) {
        return NextResponse.json(
          { error: "No open line for this product on the request" },
          { status: 400 }
        );
      }

      const bookingId = `sbook-${Date.now()}`;
      const { error: bookingError } = await supabase.from("stock_bookings").insert(
        stockBookingToRow({
          id: bookingId,
          itemId: itemRow.id,
          technicianId: requestRow.technician_id,
          leadId: requestRow.lead_id,
          requestId: requestRow.id,
          bookedOutAt: now,
          bookedOutBy: user.id,
          notes: "",
        })
      );
      if (bookingError) throw bookingError;

      const { error: itemUpdateError } = await supabase
        .from("stock_items")
        .update(stockItemUpdatesToRow({ status: "booked_out", updatedAt: now }))
        .eq("id", itemRow.id);
      if (itemUpdateError) throw itemUpdateError;

      const nextFulfilled = line.qty_fulfilled + 1;
      const { error: lineError } = await supabase
        .from("stock_request_lines")
        .update({ qty_fulfilled: nextFulfilled })
        .eq("id", line.id);
      if (lineError) throw lineError;

      const updatedLines = (lines ?? []).map((l) =>
        l.id === line.id ? { ...l, qty_fulfilled: nextFulfilled } : l
      );
      const allDone = updatedLines.every((l) => l.qty_fulfilled >= l.qty_needed);
      const anyDone = updatedLines.some((l) => l.qty_fulfilled > 0);
      const nextStatus = allDone ? "fulfilled" : anyDone ? "partial" : "open";

      const { error: statusError } = await supabase
        .from("stock_requests")
        .update({ status: nextStatus })
        .eq("id", body.requestId);
      if (statusError) throw statusError;

      return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
  stockItemVisitFromRow,
  stockProductFromRow,
  stockQrLabelFromRow,
  stockQrLabelToRow,
  stockRequestFromRow,
  stockRequestLineToRow,
  stockRequestToRow,
  stockSundryFromRow,
  stockSundryToRow,
} from "@/lib/supabase/mappers";
import type {
  AppNotification,
  StockItem,
  StockQrLabel,
  StockRequest,
  StockRequestLine,
  StockSundry,
} from "@/lib/types";
import { extractStockQrToken } from "@/lib/stock-qr-token";
import { canAccessStock } from "@/lib/permissions";
import {
  decryptPortalCode,
  encryptPortalCode,
  generateFourDigitCode,
  hashPortalCode,
} from "@/lib/portal-auth";

function makeToken() {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function loadStockBundle(includeClientPins = false) {
  const supabase = createSupabaseAdminClient();
  const [productsRes, itemsRes, bookingsRes, requestsRes, linesRes, labelsRes, sundriesRes] =
    await Promise.all([
      supabase.from("stock_products").select("*").order("name"),
      supabase.from("stock_items").select("*").order("created_at", { ascending: false }),
      supabase.from("stock_bookings").select("*").order("booked_out_at", { ascending: false }),
      supabase.from("stock_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("stock_request_lines").select("*"),
      supabase.from("stock_qr_labels").select("*").order("created_at", { ascending: false }),
      supabase.from("stock_sundries").select("*").order("name"),
    ]);

  if (productsRes.error) throw productsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (requestsRes.error) throw requestsRes.error;
  if (linesRes.error) throw linesRes.error;
  // Labels table may not exist until migration 011 is applied.
  if (labelsRes.error && !/stock_qr_labels|does not exist|schema cache/i.test(labelsRes.error.message)) {
    throw labelsRes.error;
  }
  if (
    sundriesRes.error &&
    !/stock_sundries|does not exist|schema cache/i.test(sundriesRes.error.message)
  ) {
    throw sundriesRes.error;
  }

  const linesByRequest = new Map<string, typeof linesRes.data>();
  for (const line of linesRes.data ?? []) {
    const list = linesByRequest.get(line.request_id) ?? [];
    list.push(line);
    linesByRequest.set(line.request_id, list);
  }

  const clientPinsByItem = new Map<string, string>();
  if (includeClientPins) {
    await Promise.all(
      (itemsRes.data ?? []).map(async (row) => {
        const existingCode = decryptPortalCode(row.client_pin_ciphertext);
        if (existingCode && /^\d{4}$/.test(existingCode)) {
          clientPinsByItem.set(row.id, existingCode);
          return;
        }
        if (
          !isClientInstallation({
            clientName: row.client_name,
            clientAddress: row.client_address,
            clientPppoe: row.client_pppoe,
            wifiName: row.wifi_name,
            wifiPassword: row.wifi_password,
          })
        ) {
          return;
        }

        const code = generateFourDigitCode();
        const updatedAt = new Date().toISOString();
        const { error } = await supabase
          .from("stock_items")
          .update({
            client_pin_hash: hashPortalCode(code),
            client_pin_ciphertext: encryptPortalCode(code),
            client_pin_updated_at: updatedAt,
          })
          .eq("id", row.id);
        if (!error) clientPinsByItem.set(row.id, code);
      })
    );
  }

  return {
    products: (productsRes.data ?? []).map(stockProductFromRow),
    items: (itemsRes.data ?? []).map((row) => ({
      ...stockItemFromRow(row),
      clientPin: includeClientPins
        ? clientPinsByItem.get(row.id)
        : undefined,
    })),
    bookings: (bookingsRes.data ?? []).map(stockBookingFromRow),
    requests: (requestsRes.data ?? []).map((row) =>
      stockRequestFromRow(row, linesByRequest.get(row.id) ?? [])
    ),
    qrLabels: labelsRes.error ? [] : (labelsRes.data ?? []).map(stockQrLabelFromRow),
    sundries: sundriesRes.error ? [] : (sundriesRes.data ?? []).map(stockSundryFromRow),
  };
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const data = await loadStockBundle(canAccessStock(user));
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
      clientName?: string;
      clientAddress?: string;
      clientPppoe?: string;
      wifiName?: string;
      wifiPassword?: string;
    }
  | {
      action: "updateItem";
      itemId: string;
      brand?: string;
      deviceName?: string;
      serialNumber?: string;
      clientName?: string;
      clientAddress?: string;
      clientPppoe?: string;
      wifiName?: string;
      wifiPassword?: string;
      status?: StockItem["status"];
    }
  | {
      action: "deleteItem";
      itemId: string;
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
      lines: { productId?: string; sundryId?: string; qtyNeeded: number }[];
    }
  | {
      action: "cancelRequest";
      requestId: string;
    }
  | {
      action: "updateRequestLines";
      requestId: string;
      lines: { id?: string; productId?: string; sundryId?: string; qtyNeeded: number }[];
    }
  | {
      action: "issueSundryLine";
      requestId: string;
      lineId: string;
      quantity?: number;
    }
  | {
      action: "fulfillScan";
      requestId: string;
      qrToken: string;
      serialNumber?: string;
      clientName?: string;
      clientAddress?: string;
      clientPppoe?: string;
      wifiName?: string;
      wifiPassword?: string;
    }
  | {
      action: "createQrLabelBatch";
      productId: string;
      brand?: string;
      deviceName?: string;
      quantity: number;
    }
  | {
      action: "claimQrLabel";
      qrToken: string;
      serialNumber?: string;
    }
  | {
      action: "returnByQr";
      qrToken: string;
    }
  | {
      action: "regenerateClientPin";
      itemId: string;
    }
  | {
      action: "getItemVisits";
      itemId: string;
    }
  | {
      action: "createSundry";
      name: string;
      unitLabel: string;
      quantity: number;
      notes?: string;
    }
  | {
      action: "adjustSundry";
      sundryId: string;
      change: number;
    }
  | {
      action: "deleteSundry";
      sundryId: string;
    };

function isClientInstallation(input: {
  clientName?: string;
  clientAddress?: string;
  clientPppoe?: string;
  wifiName?: string;
  wifiPassword?: string;
}) {
  return Boolean(
    input.clientName?.trim() ||
      input.clientAddress?.trim() ||
      input.clientPppoe?.trim() ||
      input.wifiName?.trim() ||
      input.wifiPassword?.trim()
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StockAction;
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (
      body.action === "createRequest" ||
      body.action === "cancelRequest" ||
      body.action === "updateRequestLines"
    ) {
      const user = await requireStockRequestsAccess(request);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      if (body.action === "updateRequestLines") {
        if (!body.requestId || !Array.isArray(body.lines) || body.lines.length === 0) {
          return NextResponse.json(
            { error: "requestId and at least one line are required" },
            { status: 400 }
          );
        }
        if (
          body.lines.some(
            (line) =>
              (!line.productId && !line.sundryId) || Math.floor(line.qtyNeeded) < 1
          )
        ) {
          return NextResponse.json(
            { error: "Every line needs a product or sundry and a quantity of at least 1" },
            { status: 400 }
          );
        }

        const { data: requestRow, error: reqError } = await supabase
          .from("stock_requests")
          .select("*")
          .eq("id", body.requestId)
          .maybeSingle();
        if (reqError) throw reqError;
        if (!requestRow) {
          return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }
        if (requestRow.status === "fulfilled" || requestRow.status === "cancelled") {
          return NextResponse.json(
            { error: "This pick list is closed and can no longer be edited" },
            { status: 400 }
          );
        }

        const { data: existingLines, error: linesError } = await supabase
          .from("stock_request_lines")
          .select("*")
          .eq("request_id", body.requestId);
        if (linesError) throw linesError;

        const keptIds = new Set(
          body.lines.map((line) => line.id).filter((id): id is string => Boolean(id))
        );
        const removedLines = (existingLines ?? []).filter((l) => !keptIds.has(l.id));
        const blockedRemoval = removedLines.find((l) => l.qty_fulfilled > 0);
        if (blockedRemoval) {
          return NextResponse.json(
            {
              error:
                "A line with already booked-out stock cannot be removed. Return the units first.",
            },
            { status: 400 }
          );
        }

        for (const removed of removedLines) {
          const { error: deleteError } = await supabase
            .from("stock_request_lines")
            .delete()
            .eq("id", removed.id);
          if (deleteError) throw deleteError;
        }

        const finalLines: { qty_needed: number; qty_fulfilled: number }[] = [];
        for (const [index, line] of body.lines.entries()) {
          const existing = line.id
            ? (existingLines ?? []).find((l) => l.id === line.id)
            : undefined;
          const fulfilled = existing?.qty_fulfilled ?? 0;
          // Never shrink below what was already booked out against this line.
          const qtyNeeded = Math.max(Math.floor(line.qtyNeeded), Math.max(1, fulfilled));

          if (existing) {
            const targetUpdates =
              fulfilled > 0
                ? {}
                : line.sundryId
                  ? { product_id: null, sundry_id: line.sundryId }
                  : {
                      product_id: line.productId ?? null,
                      // Only clear sundry_id when it was set (keeps pre-017 compatibility).
                      ...(existing.sundry_id ? { sundry_id: null } : {}),
                    };
            const { error: updateError } = await supabase
              .from("stock_request_lines")
              .update({ ...targetUpdates, qty_needed: qtyNeeded })
              .eq("id", existing.id);
            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase.from("stock_request_lines").insert(
              stockRequestLineToRow({
                id: `sline-${Date.now()}-${index}`,
                requestId: body.requestId,
                productId: line.sundryId ? "" : line.productId ?? "",
                sundryId: line.sundryId ?? null,
                qtyNeeded,
                qtyFulfilled: 0,
              })
            );
            if (insertError) throw insertError;
          }
          finalLines.push({ qty_needed: qtyNeeded, qty_fulfilled: fulfilled });
        }

        const allDone = finalLines.every((l) => l.qty_fulfilled >= l.qty_needed);
        const anyDone = finalLines.some((l) => l.qty_fulfilled > 0);
        const nextStatus = allDone ? "fulfilled" : anyDone ? "partial" : "open";
        if (nextStatus !== requestRow.status) {
          const { error: statusError } = await supabase
            .from("stock_requests")
            .update({ status: nextStatus })
            .eq("id", body.requestId);
          if (statusError) throw statusError;
        }

        return NextResponse.json({ ok: true, ...(await loadStockBundle()) });
      }

      if (body.action === "createRequest") {
        if (!body.title.trim() || !body.technicianId || !body.lines?.length) {
          return NextResponse.json({ error: "Title, technician, and lines required" }, { status: 400 });
        }
        const { data: techRow, error: techError } = await supabase
          .from("team_members")
          .select("name, technician_level, active")
          .eq("id", body.technicianId)
          .maybeSingle();
        if (techError) throw techError;
        if (!techRow || techRow.active === false) {
          return NextResponse.json({ error: "Active technician not found" }, { status: 404 });
        }
        if (techRow.technician_level !== "senior") {
          return NextResponse.json(
            { error: "Stock can only be assigned to a senior technician" },
            { status: 400 }
          );
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

        if (body.lines.some((line) => !line.productId && !line.sundryId)) {
          return NextResponse.json(
            { error: "Every line needs a product or sundry" },
            { status: 400 }
          );
        }

        const lines: StockRequestLine[] = body.lines.map((line, i) => ({
          id: `sline-${Date.now()}-${i}`,
          requestId,
          productId: line.sundryId ? "" : line.productId ?? "",
          sundryId: line.sundryId ?? null,
          qtyNeeded: Math.max(1, line.qtyNeeded),
          qtyFulfilled: 0,
        }));
        const { error: linesError } = await supabase
          .from("stock_request_lines")
          .insert(lines.map(stockRequestLineToRow));
        if (linesError) throw linesError;

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
          if (line.sundryId) {
            const { data: sundry } = await supabase
              .from("stock_sundries")
              .select("name, quantity")
              .eq("id", line.sundryId)
              .maybeSingle();
            const available = sundry?.quantity ?? 0;
            if (line.qtyNeeded > available) {
              shortfalls.push(
                `${sundry?.name ?? line.sundryId}: need ${line.qtyNeeded}, available ${available}`
              );
            }
            continue;
          }
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

    if (body.action === "createSundry") {
      const name = body.name.trim();
      const unitLabel = body.unitLabel.trim();
      const quantity = Math.floor(Number(body.quantity));
      if (!name || !unitLabel || !Number.isFinite(quantity) || quantity < 0) {
        return NextResponse.json(
          { error: "Name, counting unit, and a valid quantity are required" },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await supabase
        .from("stock_sundries")
        .select("id")
        .ilike("name", name)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return NextResponse.json(
          { error: "This sundry already exists. Adjust its quantity instead." },
          { status: 409 }
        );
      }

      const sundry: StockSundry = {
        id: `sundry-${Date.now()}`,
        name,
        unitLabel,
        quantity,
        notes: body.notes?.trim() ?? "",
        createdAt: now,
        updatedAt: now,
      };
      const { error } = await supabase.from("stock_sundries").insert(stockSundryToRow(sundry));
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "adjustSundry") {
      const change = Math.trunc(Number(body.change));
      if (!body.sundryId || !Number.isFinite(change) || change === 0) {
        return NextResponse.json({ error: "A non-zero quantity change is required" }, { status: 400 });
      }
      const { data: existing, error: findError } = await supabase
        .from("stock_sundries")
        .select("*")
        .eq("id", body.sundryId)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        return NextResponse.json({ error: "Sundry not found" }, { status: 404 });
      }
      const quantity = existing.quantity + change;
      if (quantity < 0) {
        return NextResponse.json({ error: "Quantity cannot go below zero" }, { status: 400 });
      }
      const { error } = await supabase
        .from("stock_sundries")
        .update({ quantity, updated_at: now })
        .eq("id", body.sundryId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "deleteSundry") {
      const { error } = await supabase.from("stock_sundries").delete().eq("id", body.sundryId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "createItem") {
      const item: StockItem = {
        id: `sitem-${Date.now()}`,
        productId: body.productId,
        qrToken: makeToken(),
        brand: body.brand.trim(),
        deviceName: body.deviceName.trim(),
        serialNumber: body.serialNumber.trim(),
        clientName: body.clientName?.trim() ?? "",
        clientAddress: body.clientAddress?.trim() ?? "",
        clientPppoe: body.clientPppoe?.trim() ?? "",
        wifiName: body.wifiName?.trim() ?? "",
        wifiPassword: body.wifiPassword?.trim() ?? "",
        status: "available",
        createdAt: now,
        updatedAt: now,
      };
      const row = stockItemToRow(item) as ReturnType<typeof stockItemToRow> & {
        client_pin_hash?: string;
        client_pin_ciphertext?: string;
        client_pin_updated_at?: string;
      };
      let clientPin: string | undefined;
      if (isClientInstallation(body)) {
        clientPin = generateFourDigitCode();
        row.client_pin_hash = hashPortalCode(clientPin);
        row.client_pin_ciphertext = encryptPortalCode(clientPin);
        row.client_pin_updated_at = now;
        item.hasClientPin = true;
        item.clientPinUpdatedAt = now;
        item.clientPin = clientPin;
      }
      const { error } = await supabase.from("stock_items").insert(row);
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        item,
        ...(clientPin ? { clientPin } : {}),
        ...(await loadStockBundle(true)),
      });
    }

    if (body.action === "updateItem") {
      const updates = stockItemUpdatesToRow({
        brand: body.brand,
        deviceName: body.deviceName,
        serialNumber: body.serialNumber,
        clientName: body.clientName,
        clientAddress: body.clientAddress,
        clientPppoe: body.clientPppoe,
        wifiName: body.wifiName,
        wifiPassword: body.wifiPassword,
        status: body.status,
        updatedAt: now,
      });
      const { error } = await supabase.from("stock_items").update(updates).eq("id", body.itemId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "deleteItem") {
      const { data: itemRow, error: itemError } = await supabase
        .from("stock_items")
        .select("id, status")
        .eq("id", body.itemId)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!itemRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      if (itemRow.status === "booked_out") {
        return NextResponse.json(
          { error: "Return the unit before deleting it" },
          { status: 400 }
        );
      }
      const { error } = await supabase.from("stock_items").delete().eq("id", body.itemId);
      if (error) throw error;
      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "bookOut") {
      const { data: technician, error: technicianError } = await supabase
        .from("team_members")
        .select("technician_level, active")
        .eq("id", body.technicianId)
        .maybeSingle();
      if (technicianError) throw technicianError;
      if (!technician || technician.active === false) {
        return NextResponse.json({ error: "Active technician not found" }, { status: 404 });
      }
      if (technician.technician_level !== "senior") {
        return NextResponse.json(
          { error: "Stock can only be booked out to a senior technician" },
          { status: 400 }
        );
      }

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

      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
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

      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "issueSundryLine") {
      if (!body.requestId || !body.lineId) {
        return NextResponse.json({ error: "requestId and lineId required" }, { status: 400 });
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

      const line = (lines ?? []).find((l) => l.id === body.lineId);
      if (!line || !line.sundry_id) {
        return NextResponse.json({ error: "Sundry line not found" }, { status: 404 });
      }
      const remaining = line.qty_needed - line.qty_fulfilled;
      if (remaining <= 0) {
        return NextResponse.json({ error: "Line is already fulfilled" }, { status: 400 });
      }

      const { data: sundry, error: sundryError } = await supabase
        .from("stock_sundries")
        .select("*")
        .eq("id", line.sundry_id)
        .maybeSingle();
      if (sundryError) throw sundryError;
      if (!sundry) return NextResponse.json({ error: "Sundry not found" }, { status: 404 });

      const requested = Math.floor(Number(body.quantity ?? remaining));
      if (!Number.isFinite(requested) || requested < 1) {
        return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
      }
      const quantity = Math.min(requested, remaining);
      if (sundry.quantity < quantity) {
        return NextResponse.json(
          { error: `Only ${sundry.quantity} ${sundry.unit_label} in stock` },
          { status: 400 }
        );
      }

      const { error: stockError } = await supabase
        .from("stock_sundries")
        .update({ quantity: sundry.quantity - quantity, updated_at: now })
        .eq("id", sundry.id);
      if (stockError) throw stockError;

      const nextFulfilled = line.qty_fulfilled + quantity;
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

      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
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
      const { data: requestTechnician, error: requestTechnicianError } = await supabase
        .from("team_members")
        .select("technician_level, active")
        .eq("id", requestRow.technician_id)
        .maybeSingle();
      if (requestTechnicianError) throw requestTechnicianError;
      if (!requestTechnician || requestTechnician.active === false) {
        return NextResponse.json({ error: "Active technician not found" }, { status: 404 });
      }
      if (requestTechnician.technician_level !== "senior") {
        return NextResponse.json(
          { error: "Stock can only be booked out to a senior technician" },
          { status: 400 }
        );
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

      // Save any device/client details captured during allocation.
      const detailUpdates = stockItemUpdatesToRow({
        serialNumber: body.serialNumber?.trim() || undefined,
        clientName: body.clientName?.trim() || undefined,
        clientAddress: body.clientAddress?.trim() || undefined,
        clientPppoe: body.clientPppoe?.trim() || undefined,
        wifiName: body.wifiName?.trim() || undefined,
        wifiPassword: body.wifiPassword?.trim() || undefined,
      });
      if (Object.keys(detailUpdates).length > 0) {
        const { error: detailError } = await supabase
          .from("stock_items")
          .update({ ...detailUpdates, updated_at: now })
          .eq("id", itemRow.id);
        if (detailError) throw detailError;
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

      return NextResponse.json({ ok: true, ...(await loadStockBundle(true)) });
    }

    if (body.action === "createQrLabelBatch") {
      const qty = Math.floor(Number(body.quantity));
      if (!body.productId || !Number.isFinite(qty) || qty < 1 || qty > 200) {
        return NextResponse.json(
          { error: "Product and quantity (1–200) required" },
          { status: 400 }
        );
      }
      const { data: product, error: productError } = await supabase
        .from("stock_products")
        .select("id")
        .eq("id", body.productId)
        .maybeSingle();
      if (productError) throw productError;
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

      const batchId = `sbatch-${Date.now()}`;
      const labels: StockQrLabel[] = Array.from({ length: qty }, (_, i) => ({
        id: `slabel-${Date.now()}-${i}`,
        batchId,
        productId: body.productId,
        qrToken: makeToken(),
        brand: body.brand?.trim() ?? "",
        deviceName: body.deviceName?.trim() ?? "",
        createdAt: now,
        claimedAt: null,
        claimedItemId: null,
      }));

      const { error } = await supabase.from("stock_qr_labels").insert(labels.map(stockQrLabelToRow));
      if (error) throw error;

      return NextResponse.json({
        ok: true,
        batchId,
        labels,
        ...(await loadStockBundle(true)),
      });
    }

    if (body.action === "claimQrLabel") {
      const qrToken = extractStockQrToken(body.qrToken);
      if (!qrToken) {
        return NextResponse.json({ error: "QR token required" }, { status: 400 });
      }
      const itemId = `sitem-${Date.now()}`;
      const { data: rpcResult, error: rpcError } = await supabase.rpc("claim_stock_qr_label", {
        p_qr_token: qrToken,
        p_serial_number: body.serialNumber?.trim() ?? "",
        p_item_id: itemId,
      });
      if (rpcError) throw rpcError;
      const result = rpcResult as { ok?: boolean; error?: string; item_id?: string } | null;
      if (!result?.ok) {
        return NextResponse.json(
          { error: result?.error ?? "Could not claim QR label" },
          { status: 400 }
        );
      }
      const bundle = await loadStockBundle(true);
      const item = bundle.items.find((i) => i.id === result.item_id) ?? null;
      return NextResponse.json({ ok: true, item, ...(bundle) });
    }

    if (body.action === "returnByQr") {
      const qrToken = extractStockQrToken(body.qrToken);
      if (!qrToken) {
        return NextResponse.json({ error: "QR token required" }, { status: 400 });
      }
      const { data: rpcResult, error: rpcError } = await supabase.rpc("return_stock_item_by_qr", {
        p_qr_token: qrToken,
      });
      if (rpcError) throw rpcError;
      const result = rpcResult as { ok?: boolean; error?: string; item_id?: string } | null;
      if (!result?.ok) {
        return NextResponse.json(
          { error: result?.error ?? "Could not return unit" },
          { status: 400 }
        );
      }
      const bundle = await loadStockBundle(true);
      const item = bundle.items.find((i) => i.id === result.item_id) ?? null;
      return NextResponse.json({ ok: true, item, ...(bundle) });
    }

    if (body.action === "regenerateClientPin") {
      const clientPin = generateFourDigitCode();
      const { error } = await supabase
        .from("stock_items")
        .update({
          client_pin_hash: hashPortalCode(clientPin),
          client_pin_ciphertext: encryptPortalCode(clientPin),
          client_pin_updated_at: now,
          updated_at: now,
        })
        .eq("id", body.itemId);
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        clientPin,
        ...(await loadStockBundle(true)),
      });
    }

    if (body.action === "getItemVisits") {
      const { data: visits, error: visitsError } = await supabase
        .from("stock_item_visits")
        .select("*")
        .eq("item_id", body.itemId)
        .order("submitted_at", { ascending: false });
      if (visitsError) throw visitsError;

      const techIds = [...new Set((visits ?? []).map((v) => v.technician_id))];
      const { data: techs } = await supabase
        .from("team_members")
        .select("id, name")
        .in("id", techIds.length ? techIds : ["__none__"]);
      const techMap = new Map((techs ?? []).map((t) => [t.id, t.name]));

      return NextResponse.json({
        ok: true,
        visits: (visits ?? []).map((row) =>
          stockItemVisitFromRow(row, techMap.get(row.technician_id) ?? undefined)
        ),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { JobCardStockLine } from "@megs/shared";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Open booked-out units for this job's tech, linked by pick list / client / today fallback.
 */
export async function loadJobStockChecklist(
  supabase: Admin,
  opts: {
    jobId: string;
    techIds: string[];
  }
): Promise<JobCardStockLine[]> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id, lead_id, stock_request_id")
    .eq("id", opts.jobId)
    .maybeSingle();
  if (!job) return [];

  const { data: bookings, error } = await supabase
    .from("stock_bookings")
    .select("id, item_id, technician_id, lead_id, request_id, booked_out_at, returned_at")
    .in("technician_id", opts.techIds)
    .is("returned_at", null)
    .order("booked_out_at", { ascending: false });

  if (error) throw error;
  if (!bookings?.length) return [];

  const stockRequestId = job.stock_request_id as string | null;
  const leadId = job.lead_id as string | null;
  const todayStart = startOfTodayIso();

  let matched = bookings.filter((b) => {
    if (stockRequestId && b.request_id === stockRequestId) return true;
    if (leadId && b.lead_id === leadId) return true;
    return false;
  });

  if (!matched.length && !stockRequestId && !leadId) {
    matched = bookings.filter((b) => b.booked_out_at >= todayStart);
  }

  if (!matched.length) return [];

  const itemIds = [...new Set(matched.map((b) => b.item_id))];
  const { data: items } = await supabase
    .from("stock_items")
    .select("id, product_id, serial_number, status")
    .in("id", itemIds);

  const openItems = (items ?? []).filter((i) => i.status === "booked_out");
  const openItemIds = new Set(openItems.map((i) => i.id));
  matched = matched.filter((b) => openItemIds.has(b.item_id));
  if (!matched.length) return [];

  const productIds = [
    ...new Set(openItems.map((i) => i.product_id).filter(Boolean)),
  ] as string[];
  const { data: products } = productIds.length
    ? await supabase.from("stock_products").select("id, name").in("id", productIds)
    : { data: [] as { id: string; name: string }[] };

  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
  const itemById = new Map(openItems.map((i) => [i.id, i]));

  return matched.map((b) => {
    const item = itemById.get(b.item_id);
    return {
      bookingId: b.id,
      itemId: b.item_id,
      productName: item?.product_id
        ? productName.get(item.product_id) ?? "Unit"
        : "Unit",
      serialNumber: item?.serial_number ?? "",
      used: null,
    };
  });
}

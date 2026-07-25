import { NextResponse } from "next/server";
import {
  emptyJobCardPayload,
  type JobCardPayload,
} from "@megs/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticated } from "@/lib/supabase/server-auth";
import type { Json } from "@/lib/supabase/database.types";
import { makeId, migrationHint } from "@/lib/mobile/field-mappers";
import {
  jobCardFromRow,
  mergeStockChecklist,
  summarizeStockChecklist,
  validateJobCardPayload,
  allocateJobCardNumber,
} from "@/lib/mobile/job-card";
import { loadJobStockChecklist } from "@/lib/mobile/job-stock-checklist";
import type { AppNotification } from "@/lib/types";
import { appNotificationToRow } from "@/lib/supabase/mappers";

function isFieldTech(user: { role: string; department: string | null }) {
  return (
    user.department === "coordination" ||
    (user.department === "stock" && user.role === "staff")
  );
}

function techIdsFor(user: { id: string; authUserId?: string }) {
  const ids = [user.id];
  if (user.authUserId && user.authUserId !== user.id) {
    ids.push(user.authUserId);
  }
  return ids;
}

async function assertAssigned(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string,
  techIds: string[]
) {
  const { data: assignment } = await supabase
    .from("job_assignments")
    .select("id")
    .eq("job_id", jobId)
    .in("technician_id", techIds)
    .limit(1)
    .maybeSingle();
  return !!assignment;
}

function withDerivedStockUsed(payload: JobCardPayload): JobCardPayload {
  const checklist = Array.isArray(payload.stockChecklist)
    ? payload.stockChecklist
    : [];
  if (!checklist.length) return payload;
  const summary = summarizeStockChecklist(checklist);
  return {
    ...payload,
    stockChecklist: checklist,
    stockUsed: summary || payload.stockUsed || "None",
  };
}

export async function GET(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);

  try {
    if (!(await assertAssigned(supabase, jobId, techIds))) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }

    const fromBookings = await loadJobStockChecklist(supabase, { jobId, techIds });

    const { data, error } = await supabase
      .from("job_card_submissions")
      .select("*")
      .eq("job_id", jobId)
      .in("technician_id", techIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(migrationHint(error.message, "030_job_card_submissions.sql"));

    if (!data) {
      const { data: job } = await supabase
        .from("jobs")
        .select("client_name")
        .eq("id", jobId)
        .maybeSingle();
      const payload = emptyJobCardPayload({
        clientNameSurname: job?.client_name ?? "",
        technicians: user.name ?? "",
      });
      payload.stockChecklist = fromBookings;
      return NextResponse.json({
        submission: null,
        payload,
      });
    }

    const submission = jobCardFromRow(data);
    const merged = mergeStockChecklist(
      submission.payload.stockChecklist ?? [],
      fromBookings
    );
    const payload = {
      ...submission.payload,
      stockChecklist: merged.length
        ? merged
        : submission.payload.stockChecklist ?? [],
    };
    return NextResponse.json({
      submission: { ...submission, payload },
      payload,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await requireAuthenticated(request);
  if (!user || !isFieldTech(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "save");
  const jobId = String(body.jobId ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const techIds = techIdsFor(user);
  const now = new Date().toISOString();

  try {
    if (!(await assertAssigned(supabase, jobId, techIds))) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }

    let incoming =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? ({
            ...emptyJobCardPayload(),
            ...(body.payload as Partial<JobCardPayload>),
          } as JobCardPayload)
        : emptyJobCardPayload();
    incoming = withDerivedStockUsed(incoming);

    if (action === "submit") {
      const invalid = validateJobCardPayload(incoming);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
    }

    const { data: existing } = await supabase
      .from("job_card_submissions")
      .select("*")
      .eq("job_id", jobId)
      .in("technician_id", techIds)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "submitted" && action !== "submit") {
      return NextResponse.json({ error: "Job card already submitted" }, { status: 400 });
    }

    let cardNumber = existing?.card_number?.trim() || null;
    if (action === "submit" && !cardNumber) {
      cardNumber = await allocateJobCardNumber(supabase);
    }

    const row = {
      job_id: jobId,
      technician_id: existing?.technician_id ?? user.id,
      status: action === "submit" ? "submitted" : "draft",
      payload: incoming as unknown as Json,
      card_number: cardNumber,
      submitted_at: action === "submit" ? now : null,
      updated_at: now,
    };

    let submissionId = existing?.id;
    if (existing?.id) {
      const { error } = await supabase
        .from("job_card_submissions")
        .update(row)
        .eq("id", existing.id);
      if (error) {
        const hint =
          /card_number|next_job_card_number/i.test(error.message)
            ? "038_job_card_number.sql"
            : "030_job_card_submissions.sql";
        throw new Error(migrationHint(error.message, hint));
      }
    } else {
      submissionId = makeId("jcs");
      const { error } = await supabase.from("job_card_submissions").insert({
        id: submissionId,
        ...row,
        created_at: now,
      });
      if (error) {
        const hint =
          /card_number|next_job_card_number/i.test(error.message)
            ? "038_job_card_number.sql"
            : "030_job_card_submissions.sql";
        throw new Error(migrationHint(error.message, hint));
      }
    }

    if (action === "submit") {
      const { data: jobMeta } = await supabase
        .from("jobs")
        .select("title, client_name, address")
        .eq("id", jobId)
        .maybeSingle();
      const clientLabel =
        incoming.clientNameSurname?.trim() ||
        jobMeta?.client_name ||
        "Client";
      const coordNotif: AppNotification = {
        id: makeId("notif"),
        department: "coordination",
        type: "job_card_submitted",
        title: `Job card ${cardNumber ?? ""}`.trim(),
        body: `${user.name ?? "Technician"} submitted a job card for ${clientLabel}${
          jobMeta?.address ? ` · ${jobMeta.address}` : ""
        }`,
        link: "/coordination/job-cards",
        requestId: null,
        createdAt: now,
      };
      try {
        await supabase.from("app_notifications").insert(appNotificationToRow(coordNotif));
      } catch {
        /* notifications optional */
      }

      const unused = (incoming.stockChecklist ?? []).filter((l) => l.used === false);
      for (const line of unused) {
        const { error: flagErr } = await supabase
          .from("stock_bookings")
          .update({
            return_needed_at: now,
            return_needed_job_id: jobId,
            return_needed_note: `Unused on job card by ${user.name ?? "technician"}`,
          })
          .eq("id", line.bookingId)
          .is("returned_at", null);
        if (flagErr) {
          throw new Error(
            migrationHint(flagErr.message, "037_stock_booking_return_needed.sql")
          );
        }

        const label = [line.productName, line.serialNumber].filter(Boolean).join(" ");
        const notif: AppNotification = {
          id: makeId("notif"),
          department: "stock",
          type: "stock_return_needed",
          title: `Return needed: ${label || "unit"}`,
          body: `${user.name ?? "Technician"} marked ${label || "a unit"} unused on a job card. Book it back in.`,
          link: "/stock/booked-out",
          requestId: null,
          createdAt: now,
        };
        await supabase.from("app_notifications").insert({
          id: notif.id,
          user_id: null,
          department: notif.department,
          type: notif.type,
          title: notif.title,
          body: notif.body,
          link: notif.link,
          request_id: null,
          read_at: null,
          created_at: now,
        });
      }

      const { data: current } = await supabase
        .from("jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (current?.status !== "completed" && current?.status !== "cancelled") {
        await supabase
          .from("jobs")
          .update({ status: "completed", updated_at: now })
          .eq("id", jobId);
        await supabase.from("job_status_events").insert({
          id: makeId("jse"),
          job_id: jobId,
          from_status: current?.status ?? null,
          to_status: "completed",
          changed_by: user.id,
          lat: typeof incoming.locationLat === "number" ? incoming.locationLat : null,
          lng: typeof incoming.locationLng === "number" ? incoming.locationLng : null,
          created_at: now,
        });
      }
    }

    const { data: saved, error: readErr } = await supabase
      .from("job_card_submissions")
      .select("*")
      .eq("id", submissionId!)
      .maybeSingle();
    if (readErr) throw new Error(migrationHint(readErr.message, "030_job_card_submissions.sql"));

    return NextResponse.json({
      ok: true,
      submission: saved ? jobCardFromRow(saved) : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

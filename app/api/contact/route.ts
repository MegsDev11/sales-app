import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { activityToRow, leadToRow } from "@/lib/supabase/mappers";
import { migrateLead } from "@/lib/utils/migrate";
import type { Activity, Lead } from "@/lib/types";

interface ContactBody {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  contactPreference?: string;
  message?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactBody;

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const phone = body.phone?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const message = body.message?.trim();

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
    }

    if (!phone && !email) {
      return NextResponse.json({ error: "Phone or email is required" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const leadId = `web-${Date.now()}`;
    const clientName = `${firstName} ${lastName}`.trim();

    const notes = [
      message,
      body.contactPreference ? `Preferred contact: ${body.contactPreference}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const lead: Lead = migrateLead({
      id: leadId,
      clientName,
      phone,
      email,
      address: body.address?.trim(),
      notes,
      serviceType: "fiber",
      packageTier: "",
      assignedToId: null,
      stage: "new_lead",
      currentActivity: "email",
      priority: "medium",
      createdAt: now,
      stageEnteredAt: now,
      leadSource: "website",
      coverageStatus: "pending_survey",
      serviceZone: "Waterberg",
      nextAction: "Respond to website enquiry",
      temperature: "warm",
      stageHistory: [{ stage: "new_lead", enteredAt: now }],
      deleted: false,
    });

    const activity: Activity = {
      id: `act-${Date.now()}`,
      leadId,
      type: "email",
      title: "Lead submitted via website contact form",
      createdAt: now,
    };

    const supabase = createSupabaseAdminClient();

    const { error: leadError } = await supabase.from("leads").insert(leadToRow(lead));
    if (leadError) throw leadError;

    const { error: activityError } = await supabase
      .from("activities")
      .insert(activityToRow(activity));
    if (activityError) throw activityError;

    return NextResponse.json({ ok: true, leadId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit contact form";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

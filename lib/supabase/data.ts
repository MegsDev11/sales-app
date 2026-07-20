import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  activityFromRow,
  activityToRow,
  leadFromRow,
  leadToRow,
  leadUpdatesToRow,
  userFromRow,
  userToRow,
  userUpdatesToRow,
} from "@/lib/supabase/mappers";
import type { Activity, CrmData, Lead, User } from "@/lib/types";

export async function fetchCrmDataFromSupabase(): Promise<CrmData> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client unavailable");

  const [usersRes, leadsRes, activitiesRes] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (activitiesRes.error) throw activitiesRes.error;

  return {
    users: (usersRes.data ?? []).map(userFromRow),
    leads: (leadsRes.data ?? []).map(leadFromRow),
    activities: (activitiesRes.data ?? []).map(activityFromRow),
  };
}

export async function upsertUser(user: User): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("team_members").upsert(userToRow(user));
  if (error) throw error;
}

export async function patchUser(id: string, updates: Partial<User>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("team_members")
    .update(userUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function upsertLead(lead: Lead): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("leads").upsert(leadToRow(lead));
  if (error) throw error;
}

export async function patchLead(id: string, updates: Partial<Lead>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("leads")
    .update(leadUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function insertActivity(activity: Activity): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("activities").insert(activityToRow(activity));
  if (error) throw error;
}

export function subscribeToCrmChanges(onChange: () => void): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel("crm-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_members" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leads" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activities" },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  activityFromRow,
  activityToRow,
  leadFromRow,
  leadToRow,
  leadUpdatesToRow,
  towerFromRow,
  towerOutageFromRow,
  towerOutageToRow,
  towerOutageUpdatesToRow,
  towerToRow,
  towerUpdatesToRow,
  userFromRow,
  userToRow,
  userUpdatesToRow,
} from "@/lib/supabase/mappers";
import type {
  Activity,
  CrmData,
  Lead,
  PublicNetworkOutage,
  Tower,
  TowerOutage,
  User,
} from "@/lib/types";

export async function fetchCrmDataFromSupabase(): Promise<CrmData> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client unavailable");

  const [usersRes, leadsRes, activitiesRes, towersRes, outagesRes] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("activities").select("*").order("created_at", { ascending: false }),
    supabase.from("towers").select("*").order("name"),
    supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (activitiesRes.error) throw activitiesRes.error;
  if (towersRes.error) throw towersRes.error;
  if (outagesRes.error) throw outagesRes.error;

  return {
    users: (usersRes.data ?? []).map(userFromRow),
    leads: (leadsRes.data ?? []).map(leadFromRow),
    activities: (activitiesRes.data ?? []).map(activityFromRow),
    towers: (towersRes.data ?? []).map(towerFromRow),
    towerOutages: (outagesRes.data ?? []).map(towerOutageFromRow),
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

export async function patchTower(id: string, updates: Partial<Tower>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("towers")
    .update(towerUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function insertTowerOutage(outage: TowerOutage): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("tower_outages").insert(towerOutageToRow(outage));
  if (error) throw error;
}

export async function patchTowerOutage(id: string, updates: Partial<TowerOutage>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("tower_outages")
    .update(towerOutageUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function fetchActivePublicOutages(): Promise<PublicNetworkOutage[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const [outagesRes, towersRes] = await Promise.all([
    supabase
      .from("tower_outages")
      .select("*")
      .is("resolved_at", null)
      .eq("is_public", true)
      .order("started_at", { ascending: false }),
    supabase.from("towers").select("id, name"),
  ]);

  if (outagesRes.error) throw outagesRes.error;
  if (towersRes.error) throw towersRes.error;

  const towerNames = new Map(
    (towersRes.data ?? []).map((t) => [t.id, t.name as string])
  );

  return (outagesRes.data ?? []).map((row) => ({
    id: row.id,
    towerId: row.tower_id,
    towerName: towerNames.get(row.tower_id) ?? "Unknown tower",
    title: row.title,
    message: row.message,
    affectedAreas: row.affected_areas ?? [],
    startedAt: row.started_at,
  }));
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
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "towers" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tower_outages" },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

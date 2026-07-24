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
  towerUpdatesToRow,
  userFromRow,
  userToRow,
  userUpdatesToRow,
} from "@/lib/supabase/mappers";
import type {
  Activity,
  CrmData,
  Lead,
  Tower,
  TowerOutage,
  User,
} from "@/lib/types";

export async function fetchCrmDataFromSupabase(accessToken?: string | null): Promise<CrmData> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client unavailable");

  const [usersRes, leadsRes, activitiesRes] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("activities").select("*").order("created_at", { ascending: false }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (activitiesRes.error) throw activitiesRes.error;

  let towers: Tower[] = [];
  let towerOutages: TowerOutage[] = [];

  if (accessToken) {
    const res = await fetch("/api/support/towers", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as {
        towers?: Tower[];
        towerOutages?: TowerOutage[];
      };
      towers = body.towers ?? [];
      towerOutages = body.towerOutages ?? [];
    } else {
      // Fall back to direct read (may be empty under RLS)
      const [towersRes, outagesRes] = await Promise.all([
        supabase.from("towers").select("*").order("name"),
        supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
      ]);
      if (!towersRes.error) towers = (towersRes.data ?? []).map(towerFromRow);
      if (!outagesRes.error) towerOutages = (outagesRes.data ?? []).map(towerOutageFromRow);
    }
  } else {
    const [towersRes, outagesRes] = await Promise.all([
      supabase.from("towers").select("*").order("name"),
      supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
    ]);
    if (!towersRes.error) towers = (towersRes.data ?? []).map(towerFromRow);
    if (!outagesRes.error) towerOutages = (outagesRes.data ?? []).map(towerOutageFromRow);
  }

  return {
    users: (usersRes.data ?? []).map(userFromRow),
    leads: (leadsRes.data ?? []).map(leadFromRow),
    activities: (activitiesRes.data ?? []).map(activityFromRow),
    towers,
    towerOutages,
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

async function supportTowersRequest(
  accessToken: string | null | undefined,
  body: unknown
): Promise<void> {
  if (!accessToken) {
    throw new Error("Not signed in — cannot update towers");
  }
  const res = await fetch("/api/support/towers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Tower update failed");
  }
}

export async function patchTower(
  id: string,
  updates: Partial<Tower>,
  accessToken?: string | null
): Promise<void> {
  if (accessToken) {
    await supportTowersRequest(accessToken, {
      action: "patchTower",
      towerId: id,
      updates,
    });
    return;
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("towers")
    .update(towerUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function insertTowerOutage(
  outage: TowerOutage,
  accessToken?: string | null
): Promise<void> {
  if (accessToken) {
    await supportTowersRequest(accessToken, {
      action: "createOutage",
      outage,
    });
    return;
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("tower_outages").insert(towerOutageToRow(outage));
  if (error) throw error;
}

export async function patchTowerOutage(
  id: string,
  updates: Partial<TowerOutage>,
  accessToken?: string | null,
  towerId?: string
): Promise<void> {
  if (accessToken && updates.resolvedAt && towerId) {
    await supportTowersRequest(accessToken, {
      action: "resolveOutage",
      outageId: id,
      towerId,
    });
    return;
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("tower_outages")
    .update(towerOutageUpdatesToRow(updates))
    .eq("id", id);
  if (error) throw error;
}

export async function setTowerStatusViaApi(
  towerId: string,
  status: "online" | "maintenance",
  updatedById: string,
  accessToken: string | null | undefined
): Promise<void> {
  await supportTowersRequest(accessToken, {
    action: "setStatus",
    towerId,
    status,
    updatedById,
  });
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

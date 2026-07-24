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

export async function fetchStaffUsersFromSupabase(): Promise<User[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client unavailable");
  const usersRes = await supabase.from("team_members").select("*").order("name");
  if (usersRes.error) throw usersRes.error;
  return (usersRes.data ?? []).map(userFromRow);
}

export type CrmFetchOptions = {
  accessToken?: string | null;
  /** Sales CRM pipeline + activities */
  includeLeads?: boolean;
  /** Support towers / outages */
  includeTowers?: boolean;
};

async function fetchTowersBundle(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  accessToken?: string | null
): Promise<{ towers: Tower[]; towerOutages: TowerOutage[] }> {
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
      return {
        towers: body.towers ?? [],
        towerOutages: body.towerOutages ?? [],
      };
    }
  }
  const [towersRes, outagesRes] = await Promise.all([
    supabase.from("towers").select("*").order("name"),
    supabase.from("tower_outages").select("*").order("started_at", { ascending: false }),
  ]);
  return {
    towers: towersRes.error ? [] : (towersRes.data ?? []).map(towerFromRow),
    towerOutages: outagesRes.error
      ? []
      : (outagesRes.data ?? []).map(towerOutageFromRow),
  };
}

/** CRM sales/support slice — users come from the staff store. */
export async function fetchCrmDataFromSupabase(
  accessTokenOrOptions?: string | null | CrmFetchOptions
): Promise<CrmData> {
  const options: CrmFetchOptions =
    typeof accessTokenOrOptions === "object" && accessTokenOrOptions !== null
      ? accessTokenOrOptions
      : { accessToken: accessTokenOrOptions, includeLeads: true, includeTowers: true };

  const includeLeads = options.includeLeads !== false;
  const includeTowers = options.includeTowers !== false;
  const accessToken = options.accessToken;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client unavailable");

  let leads: Lead[] = [];
  let activities: Activity[] = [];
  let towers: Tower[] = [];
  let towerOutages: TowerOutage[] = [];

  if (includeLeads) {
    const [leadsRes, activitiesRes] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("activities").select("*").order("created_at", { ascending: false }),
    ]);
    if (leadsRes.error) throw leadsRes.error;
    if (activitiesRes.error) throw activitiesRes.error;
    leads = (leadsRes.data ?? []).map(leadFromRow);
    activities = (activitiesRes.data ?? []).map(activityFromRow);
  }

  if (includeTowers) {
    const bundle = await fetchTowersBundle(supabase, accessToken);
    towers = bundle.towers;
    towerOutages = bundle.towerOutages;
  }

  return {
    users: [],
    leads,
    activities,
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

export function subscribeToStaffChanges(onChange: () => void): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel("staff-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_members" },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToCrmChanges(
  onChange: () => void,
  options?: { includeLeads?: boolean; includeTowers?: boolean }
): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => undefined;

  const includeLeads = options?.includeLeads !== false;
  const includeTowers = options?.includeTowers !== false;

  let channel = supabase.channel("crm-changes");
  if (includeLeads) {
    channel = channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        onChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        onChange
      );
  }
  if (includeTowers) {
    channel = channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "towers" },
        onChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tower_outages" },
        onChange
      );
  }
  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

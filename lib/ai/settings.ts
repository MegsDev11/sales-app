import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatEffort } from "./client";

/**
 * Assistant settings, editable by the owner in /ai.
 *
 * Every field falls back to the environment variable it replaces, so this layer can be
 * missing entirely — migration not yet applied, row deleted, database briefly
 * unreachable — and the assistant behaves exactly as it did in 056 rather than going
 * dark. Settings are a convenience over the env vars, never a dependency.
 */

export interface AiAgentSettings {
  enabled: boolean;
  greeting: string;
  effort: ChatEffort;
  oncallEmail: string;
  officeOpensHour: number;
  officeClosesHour: number;

  /** The project advisor — same row, same fallback-to-environment rule. See 062. */
  advisorEnabled: boolean;
  advisorEffort: ChatEffort;
  advisorHouseRules: string;
}

const EFFORTS: ChatEffort[] = ["low", "medium", "high", "xhigh", "max"];

export const CHATBOT_CATEGORIES = ["connectivity", "billing", "sales", "general"] as const;
export type ChatbotCategory = (typeof CHATBOT_CATEGORIES)[number];

/**
 * Which desk owns which category.
 *
 * Mirrored by the RLS policies in 057_ai_agents.sql. Changing the routing means
 * changing both — the policy is the one that actually enforces it; this map only
 * decides what each screen asks for.
 */
export const CATEGORY_ROUTING: Record<ChatbotCategory, { module: string; desk: string }> = {
  connectivity: { module: "support", desk: "Support" },
  general: { module: "support", desk: "Support" },
  billing: { module: "financial", desk: "Financial" },
  sales: { module: "crm", desk: "Sales" },
};

/** The scopes a department screen can ask for, and the categories each may read. */
export const SCOPE_CATEGORIES: Record<string, ChatbotCategory[]> = {
  support: ["connectivity", "general"],
  financial: ["billing"],
  sales: ["sales"],
  all: [...CHATBOT_CATEGORIES],
};

function envEffort(): ChatEffort {
  const raw = (process.env.SUPPORT_CHAT_EFFORT ?? "").trim().toLowerCase();
  return (EFFORTS as string[]).includes(raw) ? (raw as ChatEffort) : "medium";
}

/**
 * The advisor starts higher than the assistant.
 *
 * The assistant follows a troubleshooting tree; the advisor reasons across the whole
 * delivery history and has to cite it correctly. `high` is the floor where that stops
 * producing claims the record does not support.
 */
function envAdvisorEffort(): ChatEffort {
  const raw = (process.env.PROJECT_ADVISOR_EFFORT ?? "").trim().toLowerCase();
  return (EFFORTS as string[]).includes(raw) ? (raw as ChatEffort) : "high";
}

export function defaultSettings(): AiAgentSettings {
  return {
    enabled: true,
    greeting: "",
    effort: envEffort(),
    oncallEmail: (process.env.SUPPORT_ONCALL_EMAIL ?? "").trim(),
    officeOpensHour: 8,
    officeClosesHour: 17,
    advisorEnabled: true,
    advisorEffort: envAdvisorEffort(),
    advisorHouseRules: "",
  };
}

export async function loadAiSettings(db: SupabaseClient): Promise<AiAgentSettings> {
  const fallback = defaultSettings();
  try {
    const { data, error } = await db
      .from("ai_agent_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error) return fallback;

    const row = data as Record<string, unknown> | null;
    if (!row) return fallback;

    const effort = String(row.effort ?? "").trim().toLowerCase();
    const advisorEffort = String(row.advisor_effort ?? "").trim().toLowerCase();
    const oncall = String(row.oncall_email ?? "").trim();

    return {
      enabled: row.enabled !== false,
      greeting: String(row.greeting ?? "").trim(),
      // A blank column means "use the environment", not "use an empty value".
      effort: (EFFORTS as string[]).includes(effort) ? (effort as ChatEffort) : fallback.effort,
      oncallEmail: oncall || fallback.oncallEmail,
      officeOpensHour: numberOr(row.office_opens_hour, 8),
      officeClosesHour: numberOr(row.office_closes_hour, 17),
      // Columns absent until 062 is applied — `?? true` keeps the advisor on rather
      // than silently switching it off on an older database.
      advisorEnabled: row.advisor_enabled !== false,
      advisorEffort: (EFFORTS as string[]).includes(advisorEffort)
        ? (advisorEffort as ChatEffort)
        : fallback.advisorEffort,
      advisorHouseRules: String(row.advisor_house_rules ?? "").trim(),
    };
  } catch {
    // Table missing (migration 057 not yet applied) — behave exactly as 056 did.
    return fallback;
  }
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

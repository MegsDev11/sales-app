import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place the Anthropic client and its cost model are configured.
 *
 * Environment:
 *   ANTHROPIC_API_KEY        required — without it /api/chat returns 503 and the
 *                            widget hides itself rather than showing a dead box
 *   SUPPORT_CHAT_EFFORT      optional — low | medium | high | xhigh | max
 *   SUPPORT_ONCALL_EMAIL     optional — where after-hours escalations are sent
 */

export const CHAT_MODEL = "claude-opus-5";

/**
 * Server-side refusal fallback.
 *
 * Opus 5 runs safety classifiers that can decline a request outright — the call
 * returns HTTP 200 with `stop_reason: "refusal"` and no usable content. Most of this
 * chat is nowhere near a policy boundary, but a client typing "someone is hacking my
 * wifi" or "my network is being attacked" is ordinary support traffic that reads like
 * a cyber question. Rather than have that turn dead-end, `fallbacks: "default"` lets
 * the API re-run the same request on Anthropic's recommended fallback model inside the
 * same call. A decline before any output is not billed at all.
 *
 * "default" routes by refusal category, so there is no pinned model to migrate when
 * the recommendation changes.
 */
export const CHAT_BETAS = ["server-side-fallback-2026-07-01"] as const;

export type ChatEffort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: ChatEffort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Effort is the cost and latency dial for this feature, and the one worth tuning.
 *
 * `medium` is the default because the work is instruction-following rather than deep
 * reasoning: pick the right tool, walk a troubleshooting tree, never state a figure a
 * tool did not return. `low` is materially faster and still strong on Opus 5 — drop to
 * it if replies feel slow. Raise it only if the assistant starts skipping tool calls.
 */
export function chatEffort(): ChatEffort {
  const raw = (process.env.SUPPORT_CHAT_EFFORT ?? "").trim().toLowerCase();
  return (EFFORTS as string[]).includes(raw) ? (raw as ChatEffort) : "medium";
}

/**
 * Thinking is on by default on Opus 5 and shares the `max_tokens` budget with the
 * reply, so this is not "8000 tokens of answer" — it is the ceiling for both. Left
 * generous because a truncated reply mid-troubleshooting is worse than a long one, and
 * comfortably under the threshold where a non-streaming request risks an HTTP timeout.
 */
export const CHAT_MAX_TOKENS = 8000;

/** Model turns per user message before the loop gives up. */
export const MAX_TOOL_ITERATIONS = 6;

let client: Anthropic | null = null;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getAnthropic(): Anthropic {
  if (!client) {
    // Explicit rather than relying on the zero-arg constructor's env lookup: this runs
    // on a server where a missing key should fail loudly at the call site.
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Claude Opus 5, USD per million tokens. Cache reads bill at ~0.1x input and cache
 * writes at 1.25x, which is what makes the cached system prompt worth having.
 *
 * Stored per interaction rather than derived at read time — see the note on
 * ai_interactions in 056_support_chat.sql.
 */
const PRICE_PER_MTOK = {
  input: 5,
  output: 25,
  cacheRead: 0.5,
  cacheWrite: 6.25,
} as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(total: TokenUsage, usage: Anthropic.Beta.BetaUsage | undefined): void {
  if (!usage) return;
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
}

export function costUsd(usage: TokenUsage): number {
  const cost =
    (usage.inputTokens * PRICE_PER_MTOK.input +
      usage.outputTokens * PRICE_PER_MTOK.output +
      usage.cacheReadTokens * PRICE_PER_MTOK.cacheRead +
      usage.cacheWriteTokens * PRICE_PER_MTOK.cacheWrite) /
    1_000_000;
  // Six decimals: a single cheap turn costs well under a cent and rounding it to
  // zero would make the monthly total wrong.
  return Number(cost.toFixed(6));
}

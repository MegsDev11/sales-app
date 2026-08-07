"use client";

import { useState } from "react";
import { Bot, Settings2, Sparkles } from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ChatbotRequests } from "@/components/ai/chatbot-requests";
import { ChatbotSettings } from "@/components/ai/chatbot-settings";
import { AdvisorSettings } from "@/components/ai/advisor-settings";
import { cn } from "@/lib/utils";

/**
 * AI Agents — the owner's view of the website assistant.
 *
 * Sections are in-page tabs rather than sidebar entries, following Administration:
 * settings and the request queue are one job done in one place.
 *
 * The requests tab is scoped `all`, which is the only scope that crosses departments.
 * Each desk sees its own slice on its own Chatbot page; this is the view that shows
 * whether the routing is actually working.
 */

const TABS = [
  { key: "requests", label: "Requests", icon: Bot },
  { key: "settings", label: "Website assistant", icon: Settings2 },
  { key: "advisor", label: "Project advisor", icon: Sparkles },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AiAgentsPage() {
  const [tab, setTab] = useState<TabKey>("requests");

  return (
    <PageShell>
      <PageHeader
        eyebrow="AI Agents"
        title="AI agents"
        description="The website assistant and the project advisor — what they were asked, and the settings behind them."
      />

      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition",
                tab === t.key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "requests" ? <ChatbotRequests scope="all" showCategory /> : null}
      {tab === "settings" ? <ChatbotSettings /> : null}
      {tab === "advisor" ? <AdvisorSettings /> : null}
    </PageShell>
  );
}

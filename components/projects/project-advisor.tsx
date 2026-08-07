"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { AlertBanner, Panel } from "@/components/layout/page-shell";
import { SERIES } from "@/components/charts/tokens";
import {
  AdvisorAnswer,
  EvidenceFooter,
  isReply,
  type StoredAnswer,
} from "@/components/projects/advisor-answer";
import type { Project } from "@/lib/projects/constants";
import {
  ArrowUp,
  Database,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

/**
 * The advisor, as a conversation.
 *
 * Laid out the way a chat product is because that is what it is: pick a project, ask,
 * read, ask again. An empty thread shows a centred composer rather than a blank panel —
 * the first screen has to say what this can do, since "ask an AI about your projects"
 * means nothing until you have seen it answer with your own numbers in it.
 *
 * The two things this deliberately does NOT do like a generic chat product:
 *
 *   - It names its sources. Every answer carries the size of the record it was argued
 *     from, and the opening read cites a figure per risk. A confident paragraph with no
 *     provenance is the failure mode here, not a feature.
 *   - It does not pretend to be a person. No typing dots, no "let me think about that".
 *     The busy state says what it is actually doing — reading the delay log.
 */

interface Props {
  accessToken: string;
  /** Pass a list to show the picker; pass one project to pin the conversation to it. */
  projects?: Project[];
  projectId?: string;
  projectName?: string;
  /** Compact framing for the project page, where this is one panel among many. */
  compact?: boolean;
}

/** Openers that show what the thing is for, in the words a site manager would use. */
const SUGGESTIONS = [
  "What is most likely to make this one run late?",
  "Where could we buy the stock cheaper?",
  "What did we get wrong on the last job like this?",
  "Is the quote realistic against what these actually cost us?",
];

export function ProjectAdvisor({
  accessToken,
  projects,
  projectId: fixedProjectId,
  projectName: fixedProjectName,
  compact,
}: Props) {
  const [selected, setSelected] = useState<string>(fixedProjectId ?? "");
  const [thread, setThread] = useState<StoredAnswer[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const projectId = fixedProjectId ?? selected;
  const projectName =
    fixedProjectName ?? projects?.find((p) => p.id === projectId)?.name ?? "";

  // Default the picker to something rather than making an empty select the first
  // thing anyone sees.
  useEffect(() => {
    if (!fixedProjectId && !selected && projects?.length) setSelected(projects[0].id);
  }, [fixedProjectId, selected, projects]);

  const load = useCallback(async () => {
    if (!accessToken || !projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/projects/advisor?projectId=${encodeURIComponent(projectId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load the conversation");
      setThread(body.advice ?? []);
      setCanGenerate(Boolean(body.canGenerate));
      setConfigured(Boolean(body.configured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the conversation");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (thread.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length]);

  const send = async (question: string, mode?: "report") => {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch("/api/projects/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ projectId, question: question.trim(), mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The advisor could not answer");
      // A run that could not be filed still came back — show it rather than losing
      // work that has already been paid for.
      if (body.saved === false && body.advice) setThread((prev) => [...prev, body.advice]);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The advisor could not answer");
      setDraft(question);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(
        `/api/projects/advisor?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const empty = thread.length === 0 && !isLoading;
  const disabled = !configured || !canGenerate || !projectId;

  const composer = (
    <div className="rounded-xl border border-border bg-card shadow-panel">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={compact ? 2 : 3}
        disabled={disabled || busy}
        placeholder={
          projectName
            ? `Ask anything about ${projectName}…`
            : "Pick a project to ask about…"
        }
        className="resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          // Enter sends, shift+enter is a newline — the convention everywhere else.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (draft.trim()) void send(draft);
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-2.5 py-2">
        {/* Pinned to a project on the project page; a picker in the tab. */}
        {projects ? (
          <SelectField
            className="max-w-[16rem]"
            aria-label="Project to ask about"
            value={projectId}
            onValueChange={(v) => {
              setSelected(v);
              setThread([]);
            }}
            disabled={busy}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : null}

        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => void send("Give me your full read on this project.", "report")}
          title="The structured read: risks with evidence, sourcing, do and don't"
        >
          <FileText className="mr-1 h-3.5 w-3.5" /> Full read
        </Button>

        <Button
          size="sm"
          className="ml-auto bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={disabled || busy || !draft.trim()}
          onClick={() => void send(draft)}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );

  const body = (
    <div className={compact ? "space-y-3" : "mx-auto w-full max-w-3xl space-y-4"}>
      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {!configured ? (
        <AlertBanner tone="warn">
          <span className="flex-1">
            Claude isn&rsquo;t switched on yet — <span className="font-mono text-xs">ANTHROPIC_API_KEY</span>{" "}
            is not set on the server. Everything else on this page works; the advisor
            needs a key before it can answer.
          </span>
        </AlertBanner>
      ) : null}

      {empty ? (
        // The landing state. Centred and quiet, because the first thing anyone needs
        // is a sense of what to ask.
        <div className={compact ? "" : "flex flex-col items-center pt-6 text-center"}>
          {!compact ? (
            <>
              <span
                aria-hidden
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `${SERIES[0]}18` }}
              >
                <Sparkles className="h-5 w-5" style={{ color: SERIES[0] }} />
              </span>
              <h2 className="text-balance text-xl font-semibold tracking-[-0.01em]">
                {projectName
                  ? `What do you want to know about ${projectName}?`
                  : "Which project can I help with?"}
              </h2>
              <p className="mt-2 max-w-[46ch] text-pretty text-sm text-muted-foreground">
                I read your delay log, your costs and what you have actually paid
                suppliers, then answer from that. Every claim comes with the figure it
                rests on.
              </p>
            </>
          ) : null}

          <div className={compact ? "" : "mt-6 w-full"}>{composer}</div>

          {!disabled ? (
            <div
              className={`flex flex-wrap gap-2 ${compact ? "mt-3" : "mt-4 justify-center"}`}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {isLoading && thread.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading the conversation…
              </p>
            ) : null}

            {thread.map((answer) => (
              <div key={answer.id} className="space-y-2.5">
                {answer.question ? (
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm">
                      {answer.question}
                    </p>
                  </div>
                ) : null}

                <div className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${SERIES[0]}18` }}
                  >
                    <Sparkles className="h-3.5 w-3.5" style={{ color: SERIES[0] }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <AdvisorAnswer answer={answer} />
                    {/* Only the structured reads carry a provenance line; a two-sentence
                        follow-up with a footer under it is more chrome than answer. */}
                    {isReply(answer.advice) ? null : <EvidenceFooter answer={answer} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(answer.id)}
                    disabled={busy}
                    className="h-6 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus:opacity-100 group-hover:opacity-100 md:opacity-60"
                    aria-label="Delete this answer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading your delay log, costs and buying history…
              </p>
            ) : null}
            <div ref={bottom} />
          </div>

          <div className={compact ? "" : "sticky bottom-4"}>{composer}</div>
        </>
      )}

      {!compact && thread.length > 0 ? (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Database className="h-3 w-3" />
          Answers get sharper as projects finish — each one adds its delay causes, real
          costs and supplier prices to what Claude is shown.
        </p>
      ) : null}
    </div>
  );

  // The Advisor tab owns its whole screen and supplies its own framing. On a project
  // page it is one section among a dozen titled panels, and an untitled text box
  // floating between two of them reads as a stray input rather than a feature.
  if (!compact) return body;

  return (
    <Panel
      title="Ask Claude about this project"
      description="Advice argued from your own delay log, costs and buying history"
    >
      {body}
    </Panel>
  );
}

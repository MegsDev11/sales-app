"use client";

import { SERIES, STATUS } from "@/components/charts/tokens";
import type { ProjectAdvice } from "@/lib/ai/project-advisor";
import { AlertTriangle, Ban, Check, Database, TrendingDown, Wrench } from "lucide-react";

/**
 * One answer from the advisor, in whichever of its two shapes came back.
 *
 * A `report` is the structured opening read and renders as sections; a `reply` is a
 * follow-up and renders as prose. Shared between the Advisor tab and the panel on a
 * project page so the two cannot drift — the same answer must look the same wherever
 * it is read.
 */

export interface StoredAnswer {
  id: string;
  question: string;
  headline: string;
  advice: (ProjectAdvice & { kind?: string }) | { kind: "reply"; text: string };
  evidence?: {
    projects?: number;
    finished?: number;
    issues?: number;
    daysLost?: number;
    suppliers?: number;
    purchaseLines?: number;
    priceComparisons?: number;
  };
  cost_usd?: number;
  created_at?: string;
}

export function isReply(
  a: StoredAnswer["advice"]
): a is { kind: "reply"; text: string } {
  return (a as { kind?: string })?.kind === "reply";
}

export function AdvisorAnswer({ answer }: { answer: StoredAnswer }) {
  const a = answer.advice;

  if (isReply(a)) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{a.text}</div>
    );
  }

  const report = a as ProjectAdvice;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{report.headline}</p>
        {report.verdict ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {report.verdict}
          </p>
        ) : null}
      </div>

      {report.watchOuts?.length ? (
        <Section icon={AlertTriangle} colour={STATUS.serious} title="Watch out for">
          <ul className="space-y-2.5">
            {report.watchOuts.map((w, i) => (
              <li key={i}>
                <p className="text-sm font-medium">{w.risk}</p>
                {/* The evidence line is the whole point — without it this is guesswork
                    in a confident voice. */}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium">Because:</span> {w.evidence}
                </p>
                <p className="mt-0.5 text-xs">
                  <span className="font-medium">Do:</span> {w.mitigation}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {report.sourcing?.length ? (
        <Section icon={TrendingDown} colour={STATUS.good} title="Buying it cheaper">
          <ul className="space-y-2.5">
            {report.sourcing.map((s, i) => (
              <li key={i}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                  {s.opportunity}
                  {s.estimatedSaving && s.estimatedSaving !== "unknown" ? (
                    <span className="text-xs font-semibold" style={{ color: STATUS.good }}>
                      {s.estimatedSaving}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.evidence}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {report.doThis?.length ? (
          <Section icon={Check} colour={STATUS.good} title="Do this">
            <Bullets items={report.doThis} />
          </Section>
        ) : null}
        {report.avoidThis?.length ? (
          <Section icon={Ban} colour={STATUS.critical} title="Don't do this">
            <Bullets items={report.avoidThis} />
          </Section>
        ) : null}
      </div>

      {report.suggestedPlan?.stages?.length ? (
        <Section icon={Wrench} colour={SERIES[6]} title="Suggested plan">
          <p className="text-xs text-muted-foreground">
            {report.suggestedPlan.estimatedBlocks}{" "}
            {report.suggestedPlan.blockNoun.toLowerCase()}
            {report.suggestedPlan.estimatedBlocks === 1 ? "" : "s"} through:
          </p>
          <p className="mt-1 flex flex-wrap gap-1">
            {report.suggestedPlan.stages.map((s) => (
              <span
                key={s}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </p>
          {report.suggestedPlan.plant?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Plant: {report.suggestedPlan.plant.join(", ")}
            </p>
          ) : null}
        </Section>
      ) : null}

      {report.improve?.length ? (
        <Section icon={TrendingDown} colour={SERIES[3]} title="Where you could improve">
          <Bullets items={report.improve} />
        </Section>
      ) : null}

      {report.dataGaps?.length ? (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium">Record this and the next answer gets better:</span>{" "}
          {report.dataGaps.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the answer was built on.
 *
 * Advice off three projects and advice off thirty look identical on a page; this is the
 * only thing that tells them apart, which is why it sits under every answer rather than
 * in a settings screen nobody opens.
 */
export function EvidenceFooter({ answer }: { answer: StoredAnswer }) {
  const e = answer.evidence ?? {};
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <Database className="h-3 w-3" />
      <span>
        From {e.projects ?? 0} project{e.projects === 1 ? "" : "s"}
        {e.issues ? `, ${e.issues} logged issues (${e.daysLost ?? 0} days lost)` : ""}
        {e.purchaseLines ? `, ${e.purchaseLines} purchase lines` : ""}
        {e.priceComparisons ? `, ${e.priceComparisons} price comparisons` : ""}
      </span>
      {answer.created_at ? (
        <span>
          ·{" "}
          {new Date(answer.created_at).toLocaleString("en-ZA", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ) : null}
    </p>
  );
}

function Section({
  icon: Icon,
  colour,
  title,
  children,
}: {
  icon: typeof AlertTriangle;
  colour: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" style={{ color: colour }} />
        {title}
      </p>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span aria-hidden className="text-muted-foreground">
            •
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

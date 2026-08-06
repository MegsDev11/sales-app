"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { User } from "@/lib/types";
import { ClipboardList, FileText, HardHat, Package, Trash2, UserPlus } from "lucide-react";

/**
 * The Phase-2 integration panels on the project detail page: field work,
 * stock (needed vs booked), commercial (quotes + invoices) and phase staffing.
 *
 * All data arrives pre-joined from GET /api/projects?id= (loadIntegration) and
 * every mutation goes through the page's post() helper, which injects
 * projectId and reloads. Until migrations 067/068 are applied the slices are
 * simply empty — the panels then explain what they will hold.
 */

export interface ProjectIntegration {
  lead: {
    id: string;
    clientName: string;
    leadSource: string;
    dealValue: number | null;
    repId: string | null;
    repName: string | null;
  } | null;
  jobs: {
    id: string;
    title: string;
    clientName: string | null;
    status: string;
    jobType: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    blockId: string | null;
    blockName: string | null;
  }[];
  jobCards: {
    id: string;
    jobId: string;
    cardNumber: string | null;
    technicianName: string;
    submittedAt: string | null;
    status: string;
  }[];
  labour: {
    totalMinutes: number;
    byTech: { technicianId: string; name: string; minutes: number }[];
  };
  stockLines: {
    id: string;
    productId: string | null;
    sundryId: string | null;
    name: string;
    qtyNeeded: number;
    unitCost: number | null;
    note: string;
  }[];
  stockRequests: { id: string; title: string; status: string; technicianName: string }[];
  stockBookings: {
    id: string;
    productName: string | null;
    serialNumber: string;
    technicianName: string;
    bookedOutAt: string | null;
    returnedAt: string | null;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string | null;
    totalIncl: number;
    status: string;
    kind: string;
  }[];
  quotes: {
    id: string;
    quoteNumber: string;
    quoteDate: string | null;
    totalIncl: number;
    status: string;
    invoiceId: string | null;
  }[];
  phaseStaff: {
    id: string;
    technicianId: string;
    technicianName: string;
    blockId: string | null;
    blockName: string | null;
    stageId: string | null;
    stageName: string | null;
    role: string;
  }[];
  blocks: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}

export const EMPTY_INTEGRATION: ProjectIntegration = {
  lead: null,
  jobs: [],
  jobCards: [],
  labour: { totalMinutes: 0, byTech: [] },
  stockLines: [],
  stockRequests: [],
  stockBookings: [],
  invoices: [],
  quotes: [],
  phaseStaff: [],
  blocks: [],
  stages: [],
};

const money = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`;
};

const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
    : "—";

export function ProjectLeadStrip({ lead }: { lead: ProjectIntegration["lead"] }) {
  if (!lead) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">Won from</span>
      <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
        {lead.clientName}
      </Link>
      {lead.leadSource ? (
        <span>
          <span className="text-muted-foreground">Source: </span>
          <span className="capitalize">{lead.leadSource.replace(/-/g, " ")}</span>
        </span>
      ) : null}
      {lead.repName ? (
        <span>
          <span className="text-muted-foreground">Salesperson: </span>
          {lead.repName}
        </span>
      ) : null}
      {lead.dealValue != null ? (
        <span>
          <span className="text-muted-foreground">Deal: </span>
          {money(lead.dealValue)}
        </span>
      ) : null}
    </div>
  );
}

export function ProjectIntegrationPanels({
  data,
  users,
  canEdit,
  busy,
  post,
}: {
  data: ProjectIntegration;
  users: User[];
  canEdit: boolean;
  busy: boolean;
  post: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  // --- BOM add form ---
  const [bomDesc, setBomDesc] = useState("");
  const [bomQty, setBomQty] = useState("");
  const [bomCost, setBomCost] = useState("");

  // --- staffing add form ---
  const [staffTech, setStaffTech] = useState("");
  const [staffBlock, setStaffBlock] = useState("");
  const [staffStage, setStaffStage] = useState("");
  const [staffRole, setStaffRole] = useState("");

  const techOptions = useMemo(
    () => [
      { value: "", label: "Pick a person…" },
      ...users
        .filter((u) => u.active !== false)
        .map((u) => ({ value: u.id, label: u.name })),
    ],
    [users]
  );

  const bomEstimate = data.stockLines.reduce(
    (sum, l) => sum + (l.unitCost != null ? l.unitCost * l.qtyNeeded : 0),
    0
  );

  const addBomLine = async () => {
    const ok = await post({
      action: "addStockLine",
      description: bomDesc,
      qtyNeeded: Number(bomQty),
      unitCost: bomCost ? Number(bomCost) : null,
    });
    if (ok) {
      setBomDesc("");
      setBomQty("");
      setBomCost("");
    }
  };

  const addStaff = async () => {
    const ok = await post({
      action: "addPhaseStaff",
      technicianId: staffTech,
      blockId: staffBlock || null,
      stageId: staffStage || null,
      role: staffRole,
    });
    if (ok) {
      setStaffTech("");
      setStaffBlock("");
      setStaffStage("");
      setStaffRole("");
    }
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------ field work */}
        <Panel title="Field work" padded={false}>
          {data.jobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No jobs are linked yet. Coordination picks this project when raising a job.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.jobs.map((j) => (
                <li key={j.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{j.title}</span>
                    {j.blockName ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {j.blockName}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {j.clientName ? `${j.clientName} · ` : ""}
                      {day(j.scheduledStart)}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs uppercase text-muted-foreground">
                    {j.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.jobCards.length > 0 ? (
            <div className="border-t border-border px-4 py-2.5">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <HardHat className="mr-1 inline h-3.5 w-3.5" />
                Job cards
              </p>
              <ul className="space-y-1 text-sm">
                {data.jobCards.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs">{c.cardNumber ?? c.id}</span>
                      <span className="ml-2 text-muted-foreground">{c.technicianName}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{day(c.submittedAt)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/coordination/job-cards"
                className="mt-1.5 inline-block text-xs text-primary hover:underline"
              >
                Open job cards
              </Link>
            </div>
          ) : null}
          {data.labour.totalMinutes > 0 ? (
            <div className="border-t border-border px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Hours logged: </span>
              <span className="font-medium">{hours(data.labour.totalMinutes)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {data.labour.byTech
                  .slice(0, 4)
                  .map((t) => `${t.name} ${hours(t.minutes)}`)
                  .join(" · ")}
              </span>
            </div>
          ) : null}
        </Panel>

        {/* ------------------------------------------------ stock */}
        <Panel title="Stock" padded={false}>
          <div className="px-4 py-2.5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Package className="mr-1 inline h-3.5 w-3.5" />
              Needed (bill of materials)
              {bomEstimate > 0 ? (
                <span className="ml-2 normal-case text-muted-foreground">
                  est. {money(bomEstimate)}
                </span>
              ) : null}
            </p>
            {data.stockLines.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nothing planned yet — list what this build needs.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.stockLines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>
                      {l.name}
                      <span className="ml-2 text-xs text-muted-foreground">× {l.qtyNeeded}</span>
                      {l.unitCost != null ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          @ {money(l.unitCost)}
                        </span>
                      ) : null}
                    </span>
                    {canEdit ? (
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => void post({ action: "removeStockLine", lineId: l.id })}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Input
                  value={bomDesc}
                  onChange={(e) => setBomDesc(e.target.value)}
                  placeholder="Material (e.g. ADSS 24-core, per metre)"
                  className="h-8 max-w-64 text-xs"
                />
                <Input
                  value={bomQty}
                  onChange={(e) => setBomQty(e.target.value)}
                  placeholder="Qty"
                  type="number"
                  className="h-8 w-20 text-xs"
                />
                <Input
                  value={bomCost}
                  onChange={(e) => setBomCost(e.target.value)}
                  placeholder="Unit R"
                  type="number"
                  className="h-8 w-24 text-xs"
                />
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || !bomDesc.trim() || !(Number(bomQty) > 0)}
                  onClick={() => void addBomLine()}
                >
                  Add
                </Button>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
              Pick lists & booked out
            </p>
            {data.stockRequests.length === 0 && data.stockBookings.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No stock has been requested for this project yet. Stock picks this project
                when raising a pick list.
              </p>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {data.stockRequests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>
                        {r.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.technicianName}
                        </span>
                      </span>
                      <span className="text-xs uppercase text-muted-foreground">{r.status}</span>
                    </li>
                  ))}
                </ul>
                {data.stockBookings.length > 0 ? (
                  <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5 text-sm">
                    {data.stockBookings.slice(0, 10).map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2">
                        <span>
                          {b.productName ?? "Unit"}
                          {b.serialNumber ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {b.serialNumber}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {b.returnedAt ? "returned" : `out · ${b.technicianName}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </Panel>

        {/* ------------------------------------------------ commercial */}
        <Panel title="Quotes & invoices" padded={false}>
          <div className="px-4 py-2.5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <FileText className="mr-1 inline h-3.5 w-3.5" />
              Quotes
            </p>
            {data.quotes.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No quotes yet — raise one under Accounts → Quotes and pick this project.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2">
                    <span>
                      <Link
                        href={`/accounts/quotes?id=${encodeURIComponent(q.id)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {q.quoteNumber}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{day(q.quoteDate)}</span>
                    </span>
                    <span className="tabular-nums">
                      {money(q.totalIncl)}
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        {q.invoiceId ? "invoiced" : q.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Invoices
            </p>
            {data.invoices.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nothing invoiced against this project yet.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{i.invoiceNumber}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {day(i.invoiceDate)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {money(i.totalIncl)}
                      <span className="ml-2 text-xs uppercase text-muted-foreground">{i.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* ------------------------------------------------ phase staffing */}
        <Panel title="Who works which phase" padded={false}>
          {data.phaseStaff.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nobody is assigned to a phase yet. Assignments here answer “who was on
              splicing in Block 12” — the delivery grid stays the source of what got done.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.phaseStaff.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    <span className="font-medium">{p.technicianName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[p.blockName ?? "whole project", p.stageName ?? "all stages"]
                        .filter(Boolean)
                        .join(" · ")}
                      {p.role ? ` · ${p.role}` : ""}
                    </span>
                  </span>
                  {canEdit ? (
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => void post({ action: "removePhaseStaff", staffId: p.id })}
                      aria-label="Remove assignment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-1.5 border-t border-border px-4 py-2.5">
              <Field label="Person" htmlFor="staff-tech">
                <SelectField
                  id="staff-tech"
                  className="w-44"
                  value={staffTech}
                  onValueChange={setStaffTech}
                  options={techOptions}
                />
              </Field>
              <Field label="Block" htmlFor="staff-block">
                <SelectField
                  id="staff-block"
                  className="w-36"
                  value={staffBlock}
                  onValueChange={setStaffBlock}
                  options={[
                    { value: "", label: "Whole project" },
                    ...data.blocks.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </Field>
              <Field label="Stage" htmlFor="staff-stage">
                <SelectField
                  id="staff-stage"
                  className="w-36"
                  value={staffStage}
                  onValueChange={setStaffStage}
                  options={[
                    { value: "", label: "All stages" },
                    ...data.stages.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </Field>
              <Field label="Role" htmlFor="staff-role">
                <Input
                  id="staff-role"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  placeholder="e.g. splicer"
                  className="h-9 w-28 text-xs"
                />
              </Field>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !staffTech}
                onClick={() => void addStaff()}
              >
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                Assign
              </Button>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, CheckSquare, MapPin, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { ServiceTypeBadge } from "@/components/leads/service-type-badge";
import { CoverageBadge } from "@/components/leads/coverage-badge";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { StatCard } from "@/components/stats/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STAGE_LABELS,
  LEAD_SOURCE_LABELS,
  ACTIVITY_LABELS,
  LOST_REASON_LABELS,
  INSTALLATION_LABELS,
  TEMPERATURE_LABELS,
} from "@/lib/constants";
import { ACTIVITY_TEMPLATES } from "@/lib/data/packages";
import { daysInStage, daysToClose, totalPipelineDays, isOverdue } from "@/lib/utils/time";
import { addDaysISO, formatFollowUpDate } from "@/lib/utils/leads";
import type { ActivityType } from "@/lib/types";

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { leads, getUserById, getLeadActivities, updateLead, addActivity, reassignLead, deleteLead, users } = useCrmStore();
  const { currentUser, isAdmin } = useAuth();
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("call");
  const [showEdit, setShowEdit] = useState(false);

  const lead = leads.find((l) => l.id === id && !l.deleted);
  if (!lead) notFound();
  if (!isAdmin && lead.assignedToId !== currentUser?.id) notFound();

  const rep = lead.assignedToId ? getUserById(lead.assignedToId) : null;
  const activities = getLeadActivities(lead.id);
  const salesReps = users.filter((u) => u.role === "sales");

  const handleLogActivity = (title?: string) => {
    const t = title ?? activityTitle.trim();
    if (!t) return;
    addActivity(lead.id, activityType, t);
    setActivityTitle("");
  };

  const setFollowUp = (days: number, action: string) => {
    updateLead(lead.id, { nextFollowUpAt: addDaysISO(days), nextAction: action });
  };

  const stageDurations = lead.stageHistory.slice().reverse().map((entry, i, arr) => {
    const next = arr[i + 1];
    const end = next ? new Date(next.enteredAt) : new Date();
    const days = Math.floor((end.getTime() - new Date(entry.enteredAt).getTime()) / 86400000);
    return { stage: entry.stage, days };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/board" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to board
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => { deleteLead(lead.id); router.push("/board"); }}>
            <Trash2 className="mr-1 h-3 w-3" /> Archive
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{lead.clientName}</h1>
          {lead.company && <p className="text-muted-foreground">{lead.company}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ServiceTypeBadge type={lead.serviceType} />
            <CoverageBadge status={lead.coverageStatus} />
            <Badge variant="outline">{STAGE_LABELS[lead.stage]}</Badge>
            <Badge variant="outline">{TEMPERATURE_LABELS[lead.temperature]}</Badge>
            {lead.priority === "high" && <Badge className="bg-[#C83733] hover:bg-[#C83733]">High Priority</Badge>}
            {isOverdue(lead) && <Badge variant="destructive">Overdue</Badge>}
          </div>
        </div>
        {rep && (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: rep.color }} />
            <span className="text-sm font-medium">{rep.name}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`tel:${lead.phone}`}><Button variant="outline" size="sm"><Phone className="mr-1 h-3 w-3" />{lead.phone}</Button></a>
        <a href={`mailto:${lead.email}`}><Button variant="outline" size="sm"><Mail className="mr-1 h-3 w-3" />Email</Button></a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Days in Stage" value={`${daysInStage(lead)}d`} accent={isOverdue(lead) ? "#dc2626" : "#16a34a"} />
        <StatCard title="Pipeline Time" value={`${totalPipelineDays(lead)}d`} />
        <StatCard title="Days to Close" value={daysToClose(lead) !== null ? `${daysToClose(lead)}d` : "—"} />
        <StatCard title="Deal Value" value={lead.dealValue ? `R${lead.dealValue.toLocaleString()}` : "—"} accent="#C83733" />
      </div>

      <Card>
        <CardHeader><CardTitle>Follow-up</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm"><strong>Next:</strong> {lead.nextAction ?? "—"} · {formatFollowUpDate(lead.nextFollowUpAt)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setFollowUp(1, "Follow up tomorrow")}>Tomorrow</Button>
            <Button size="sm" variant="outline" onClick={() => setFollowUp(3, "Call in 3 days")}>In 3 days</Button>
            <Button size="sm" variant="outline" onClick={() => setFollowUp(7, "Check in next week")}>Next week</Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Custom next action..." value={lead.nextAction ?? ""} onChange={(e) => updateLead(lead.id, { nextAction: e.target.value })} />
            <Input type="datetime-local" onChange={(e) => e.target.value && updateLead(lead.id, { nextFollowUpAt: new Date(e.target.value).toISOString() })} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Client Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Address" value={lead.address ?? "—"} />
            <DetailRow label="Zone" value={lead.serviceZone} />
            <DetailRow label="Package" value={lead.packageTier} />
            <DetailRow label="Lead Source" value={LEAD_SOURCE_LABELS[lead.leadSource]} />
            {lead.lostReason && <DetailRow label="Lost Reason" value={LOST_REASON_LABELS[lead.lostReason]} />}
            {lead.installationStatus && <DetailRow label="Installation" value={INSTALLATION_LABELS[lead.installationStatus]} />}
            {lead.siteSurveyDate && <DetailRow label="Site Survey" value={formatFollowUpDate(lead.siteSurveyDate)} />}
            {isAdmin && (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium text-muted-foreground">Reassign to</label>
                <Select value={lead.assignedToId ?? "unassigned"} onValueChange={(v) => { if (typeof v === "string") reassignLead(lead.id, v === "unassigned" ? null : v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesReps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stage History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stageDurations.map((s) => (
              <div key={s.stage} className="flex justify-between text-sm">
                <span>{STAGE_LABELS[s.stage]}</span>
                <span className="font-medium">{s.days}d</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["call", "email", "task", "site_visit"] as ActivityType[]).map((type) => (
                  <Button key={type} variant={activityType === type ? "default" : "outline"} size="sm"
                    className={activityType === type ? "bg-[#C83733] hover:bg-[#a82f2b]" : ""}
                    onClick={() => setActivityType(type)}>{ACTIVITY_LABELS[type]}</Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {ACTIVITY_TEMPLATES.map((t) => (
                  <Button key={t} variant="ghost" size="xs" className="text-xs" onClick={() => handleLogActivity(t)}>{t}</Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Activity description..." value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogActivity()} />
                <Button onClick={() => handleLogActivity()} className="bg-[#C83733] hover:bg-[#a82f2b]">Log</Button>
              </div>
            </div>
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>
      </div>

      <LeadFormDialog open={showEdit} onOpenChange={setShowEdit} lead={lead} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

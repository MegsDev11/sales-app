"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isActiveLead, isInLeadInbox } from "@/lib/utils/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { getSalesStaff } from "@/lib/permissions";
import { SERVICE_LABELS } from "@/lib/constants";
import { X } from "lucide-react";

export default function InboxPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { leads, users, reassignLead, updateLead } = useCrmStore();

  useEffect(() => {
    if (!isAdmin) router.replace("/board");
  }, [isAdmin, router]);

  const unassigned = leads.filter(isInLeadInbox);
  const salesReps = getSalesStaff(users);

  const dismissFromInbox = (leadId: string) => {
    updateLead(leadId, { inboxDismissedAt: new Date().toISOString() });
  };

  const assignNext = () => {
    if (unassigned.length === 0) return;
    const repCounts = salesReps.map((r) => ({
      id: r.id,
      count: leads.filter((l) => l.assignedToId === r.id && isActiveLead(l)).length,
    }));
    repCounts.sort((a, b) => a.count - b.count);
    reassignLead(unassigned[0].id, repCounts[0].id);
  };

  if (!isAdmin) return null;

  return (
    <PageShell>
      <PageHeader
        title="Lead Inbox"
        description="Unassigned inbound leads waiting for a rep"
        actions={
          unassigned.length > 0 ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={assignNext}>
              Assign Next (Round Robin)
            </Button>
          ) : undefined
        }
      />

      {unassigned.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No unassigned leads. Great job!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {unassigned.map((lead) => (
            <Card key={lead.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{lead.clientName}</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title="Remove from inbox"
                  aria-label={`Remove ${lead.clientName} from inbox`}
                  onClick={() => dismissFromInbox(lead.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline">{SERVICE_LABELS[lead.serviceType]}</Badge>
                  <Badge variant="outline">{lead.serviceZone}</Badge>
                  <Badge variant="outline">R{(lead.dealValue ?? 0).toLocaleString()}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{lead.address}</p>
                <div className="flex items-center gap-2">
                  <Select onValueChange={(v) => { if (typeof v === "string") reassignLead(lead.id, v); }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                    <SelectContent>
                      {salesReps.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Link href={`/leads/${lead.id}`}>
                    <Button variant="outline" size="sm">View</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

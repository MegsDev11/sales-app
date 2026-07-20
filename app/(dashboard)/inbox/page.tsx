"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { isActiveLead, isLeadVisible } from "@/lib/utils/leads";
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
import { SERVICE_LABELS } from "@/lib/constants";

export default function InboxPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { leads, users, reassignLead } = useCrmStore();

  useEffect(() => {
    if (!isAdmin) router.replace("/board");
  }, [isAdmin, router]);

  const unassigned = leads.filter((l) => isLeadVisible(l) && !l.assignedToId && isActiveLead(l));
  const salesReps = users.filter((u) => u.role === "sales");

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
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lead Inbox</h1>
          <p className="text-sm text-muted-foreground">Unassigned inbound leads waiting for a rep</p>
        </div>
        {unassigned.length > 0 && (
          <Button className="bg-[#C83733] hover:bg-[#a82f2b]" onClick={assignNext}>
            Assign Next (Round Robin)
          </Button>
        )}
      </div>

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
              <CardHeader>
                <CardTitle className="text-base">{lead.clientName}</CardTitle>
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
    </div>
  );
}

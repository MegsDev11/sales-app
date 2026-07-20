"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { filterLeadsForUser, isLeadVisible } from "@/lib/utils/leads";
import { formatFollowUpDate } from "@/lib/utils/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

export default function SurveysPage() {
  const { currentUser, isAdmin } = useAuth();
  const { leads, getUserById } = useCrmStore();

  const surveys = useMemo(() => {
    return filterLeadsForUser(leads.filter(isLeadVisible), currentUser?.id, isAdmin)
      .filter((l) => l.siteSurveyDate)
      .sort((a, b) => new Date(a.siteSurveyDate!).getTime() - new Date(b.siteSurveyDate!).getTime());
  }, [leads, currentUser, isAdmin]);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Site Surveys</h1>
        <p className="text-sm text-muted-foreground">Upcoming site survey appointments</p>
      </div>

      {surveys.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No surveys scheduled.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {surveys.map((lead) => {
            const rep = lead.assignedToId ? getUserById(lead.assignedToId) : null;
            return (
              <Card key={lead.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                      <MapPin className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <Link href={`/leads/${lead.id}`} className="font-semibold hover:text-[#C83733]">
                        {lead.clientName}
                      </Link>
                      <p className="text-sm text-muted-foreground">{lead.address}</p>
                      {lead.siteSurveyNotes && (
                        <p className="mt-1 text-xs text-muted-foreground">{lead.siteSurveyNotes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatFollowUpDate(lead.siteSurveyDate)}</p>
                    {rep && (
                      <Badge className="mt-1 text-white" style={{ backgroundColor: rep.color }}>
                        {rep.name.split(" ")[0]}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCrmStore } from "@/lib/store/crm-store";
import { useSupportAccess } from "@/lib/hooks/use-support-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";

export default function SupportClientsPage() {
  const { allowed, isLoading } = useSupportAccess();
  const { towers, assignLeadTower, getVisibleLeads } = useCrmStore();
  const [search, setSearch] = useState("");
  const [towerFilter, setTowerFilter] = useState("all");

  const visibleLeads = getVisibleLeads();

  const filteredLeads = useMemo(() => {
    return visibleLeads.filter((lead) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        lead.clientName.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.email.toLowerCase().includes(q);
      const matchesTower =
        towerFilter === "all" ||
        (towerFilter === "unassigned" && !lead.towerId) ||
        lead.towerId === towerFilter;
      return matchesSearch && matchesTower;
    });
  }, [visibleLeads, search, towerFilter]);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader
        title="Client Assignment"
        description="Link clients to towers for outage notifications and support routing"
      />

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={towerFilter} onValueChange={(v) => { if (typeof v === "string") setTowerFilter(v); }}>
            <SelectTrigger><SelectValue placeholder="Filter by tower" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {towers.map((tower) => (
                <SelectItem key={tower.id} value={tower.id}>{tower.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">
            Clients ({filteredLeads.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredLeads.length === 0 && (
            <p className="text-sm text-muted-foreground">No clients match your filters.</p>
          )}
          {filteredLeads.map((lead) => {
            const tower = towers.find((t) => t.id === lead.towerId);
            return (
              <div
                key={lead.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{lead.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.phone || "No phone"} · {lead.email || "No email"}
                  </p>
                  {lead.address && (
                    <p className="text-xs text-muted-foreground">{lead.address}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:w-64">
                  <Select
                    value={lead.towerId ?? "unassigned"}
                    onValueChange={(v) => {
                      if (typeof v === "string") {
                        assignLeadTower(lead.id, v === "unassigned" ? null : v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Assign tower" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">No tower assigned</SelectItem>
                      {towers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Link
                    href={`/leads/${lead.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    View lead
                  </Link>
                  {tower && (
                    <p className="text-xs text-muted-foreground">Current: {tower.name}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </PageShell>
  );
}
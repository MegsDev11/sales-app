"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_LABELS } from "@/lib/constants";
import type { CoverageStatus, LeadStage, Priority, ServiceType, SortField } from "@/lib/types";

export interface BoardFilterState {
  search: string;
  serviceFilter: ServiceType | "all";
  priorityFilter: Priority | "all";
  zoneFilter: string;
  coverageFilter: CoverageStatus | "all";
  temperatureFilter: "all" | "hot" | "warm" | "cold";
  dueTodayOnly: boolean;
  overdueOnly: boolean;
  sortField: SortField;
}

export const defaultFilters: BoardFilterState = {
  search: "",
  serviceFilter: "all",
  priorityFilter: "all",
  zoneFilter: "all",
  coverageFilter: "all",
  temperatureFilter: "all",
  dueTodayOnly: false,
  overdueOnly: false,
  sortField: "followUp",
};

interface BoardFiltersProps {
  filters: BoardFilterState;
  onChange: (filters: BoardFilterState) => void;
  zones: string[];
}

export function BoardFilters({ filters, onChange, zones }: BoardFiltersProps) {
  const set = <K extends keyof BoardFilterState>(key: K, value: BoardFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          className="pl-8"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>
      <Select value={filters.sortField} onValueChange={(v) => { if (typeof v === "string") set("sortField", v as SortField); }}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Sort by" /></SelectTrigger>
        <SelectContent>
          {Object.entries(SORT_LABELS).map(([k, label]) => (
            <SelectItem key={k} value={k}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.priorityFilter} onValueChange={(v) => { if (typeof v === "string") set("priorityFilter", v as Priority | "all"); }}>
        <SelectTrigger className="w-28"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priority</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.zoneFilter} onValueChange={(v) => { if (typeof v === "string") set("zoneFilter", v); }}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Zone" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All zones</SelectItem>
          {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.coverageFilter} onValueChange={(v) => { if (typeof v === "string") set("coverageFilter", v as CoverageStatus | "all"); }}>
        <SelectTrigger className="w-32"><SelectValue placeholder="Coverage" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All coverage</SelectItem>
          <SelectItem value="confirmed">Confirmed</SelectItem>
          <SelectItem value="pending_survey">Survey needed</SelectItem>
          <SelectItem value="not_available">No coverage</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.temperatureFilter} onValueChange={(v) => { if (typeof v === "string") set("temperatureFilter", v as BoardFilterState["temperatureFilter"]); }}>
        <SelectTrigger className="w-28"><SelectValue placeholder="Temp" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All temps</SelectItem>
          <SelectItem value="hot">Hot</SelectItem>
          <SelectItem value="warm">Warm</SelectItem>
          <SelectItem value="cold">Cold</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

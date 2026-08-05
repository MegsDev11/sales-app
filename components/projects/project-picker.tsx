"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Optional project link for records raised in other modules (pick lists,
 * quotes). Feeds off GET /api/projects?options=1, which is open to
 * coordination/stock/accounts access — not just projects. Renders nothing
 * while there are no projects to offer, so screens stay unchanged for
 * companies not using the projects module.
 */

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

export function ProjectPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (projectId: string) => void;
  className?: string;
}) {
  const { accessToken } = useAuth();
  const [options, setOptions] = useState<ProjectOption[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects?options=1", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && res.ok) setOptions(json.options ?? []);
      } catch {
        /* picker simply stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (options.length === 0) return null;

  const label = (id: string) => {
    const p = options.find((o) => o.id === id);
    return p ? `${p.code} · ${p.name}` : "Linked project";
  };

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className={className ?? "w-full"}>
        <SelectValue placeholder="Project (optional)">
          {(v) => (v ? label(String(v)) : "Project (optional)")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">No project</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.code} · {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

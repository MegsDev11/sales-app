"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The department list, from the table that actually defines it.
 *
 * Departments stopped being a hardcoded union in migration 040 — /admin/departments
 * inserts and deletes rows, so "Human Resources" is data. The new-staff dialog had
 * not caught up: it listed ten department keys inline, so a department created in
 * Administration could never be assigned to anybody, and one that was deleted stayed
 * on offer. Reading the same table both screens write is the fix.
 *
 * `FALLBACK_DEPARTMENTS` is the seed set from migration 040, used only when the
 * request fails, so the form still works offline rather than presenting an empty
 * required field.
 */

export interface DepartmentOption {
  key: string;
  label: string;
}

export const FALLBACK_DEPARTMENTS: DepartmentOption[] = [
  { key: "sales", label: "Sales" },
  { key: "support", label: "Support" },
  { key: "stock", label: "Stock" },
  { key: "coordination", label: "Coordination" },
  { key: "wireless", label: "Wireless" },
  { key: "fiber", label: "Fiber" },
  { key: "financial", label: "Financial" },
  { key: "general", label: "General" },
  { key: "accounts", label: "Accounts" },
  { key: "reception", label: "Reception" },
];

interface DepartmentRow {
  key: string;
  label: string;
  active?: boolean;
}

export function useDepartments(accessToken: string | null, enabled = true) {
  const [departments, setDepartments] = useState<DepartmentOption[]>(FALLBACK_DEPARTMENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !enabled) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/departments", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load departments");
      const rows: DepartmentRow[] = body.departments ?? [];
      // Inactive departments stay in the table for historical rows but must not be
      // assignable to somebody new.
      const active = rows
        .filter((d) => d.active !== false)
        .map((d) => ({ key: d.key, label: d.label || d.key }));
      if (active.length) {
        setDepartments(active);
        setIsLive(true);
      }
    } catch {
      // Keep the fallback list rather than emptying a required field.
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { departments, isLoading, isLive, reload: load };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Loader2, Plus, Trash2, Users } from "lucide-react";

interface DepartmentRow {
  key: string;
  label: string;
  manager_id: string | null;
  sort_order: number;
  active: boolean;
  staffCount: number;
}
interface StaffLite {
  id: string;
  name: string;
}

export default function AdminDepartmentsPage() {
  const { accessToken } = useAuth();
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newManager, setNewManager] = useState("");
  const [newSort, setNewSort] = useState("100");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/departments", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load departments");
      setDepartments(body.departments ?? []);
      setStaff(body.staff ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    if (!accessToken) throw new Error("Not signed in");
    const res = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Request failed");
    return body;
  }

  async function createDept() {
    if (!newLabel.trim()) return setError("Give the department a name");
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "create",
        label: newLabel.trim(),
        key: newKey.trim() || undefined,
        managerId: newManager || null,
        sortOrder: Number(newSort) || 100,
      });
      setNewLabel("");
      setNewKey("");
      setNewManager("");
      setNewSort("100");
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setBusy(false);
    }
  }

  async function updateDept(key: string, patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await post({ action: "update", key, ...patch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update department");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDept(key: string, label: string) {
    if (!window.confirm(`Delete the "${label}" department? Staff in it will be left unassigned.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post({ action: "delete", key });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete department");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Departments"
        description="Org structure — who sits where and who manages them. Access to software is set separately in Access Control."
        actions={
          <Button
            onClick={() => setAddOpen((v) => !v)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add department
          </Button>
        }
      />

      <AdminTabs />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {addOpen ? (
        <Panel title="New department">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Human Resources" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Key (optional)</label>
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="auto from name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Manager</label>
              <select
                value={newManager}
                onChange={(e) => setNewManager(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                aria-label="Department manager"
              >
                <option value="">No manager</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Sort order</label>
              <Input type="number" value={newSort} onChange={(e) => setNewSort(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void createDept()}
              disabled={busy}
            >
              Create department
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title={`${departments.length} departments`} padded={false}>
        {isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : departments.length === 0 ? (
          <div className="py-10 text-center">
            <Briefcase className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No departments yet.</p>
            <Button variant="outline" className="mt-3" onClick={() => setAddOpen(true)}>
              Add the first one
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Manager</th>
                  <th className="px-4 py-2 text-right font-medium">Staff</th>
                  <th className="px-4 py-2 text-center font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {d.key}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={d.manager_id ?? ""}
                        onChange={(e) => void updateDept(d.key, { managerId: e.target.value || null })}
                        disabled={busy}
                        className="h-8 max-w-[180px] rounded-md border border-border bg-background px-2 text-sm"
                        aria-label={`Manager for ${d.label}`}
                      >
                        <option value="">No manager</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> {d.staffCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateDept(d.key, { active: !d.active })}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          d.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {d.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        onClick={() => void deleteDept(d.key, d.label)}
                        aria-label={`Delete ${d.label}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

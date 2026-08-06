"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProcurement } from "@/lib/procurement/use-procurement";
import {
  categoryLabel,
  fmtMoney,
  type Supplier,
  type SupplierWithStats,
} from "@/lib/procurement/constants";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import {
  ChevronLeft,
  Clock,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";

export default function SuppliersPage() {
  const { suppliers, canEdit, isLoading, error, reload, post } = useProcurement();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!showInactive && !s.active) return false;
      if (q && !`${s.name} ${s.category} ${s.contact_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [suppliers, search, showInactive]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (s: SupplierWithStats) => {
    setEditing(s);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        title="Suppliers"
        description="Who we buy from — contacts, lead times and spend"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/procurement">
              <Button variant="outline">
                <ChevronLeft className="mr-1 h-4 w-4" /> Procurement
              </Button>
            </Link>
            {canEdit ? (
              <Button
                onClick={openNew}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New supplier
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="pl-8"
          />
        </div>
        <Button
          variant={showInactive ? "default" : "outline"}
          onClick={() => setShowInactive((v) => !v)}
          className={showInactive ? "bg-primary text-primary-foreground" : ""}
        >
          Show inactive
        </Button>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <Panel title={`${filtered.length} supplier${filtered.length === 1 ? "" : "s"}`} padded={false}>
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {suppliers.length === 0 ? "No suppliers yet." : "No suppliers match that search."}
            </p>
            {canEdit && suppliers.length === 0 ? (
              <Button variant="outline" className="mt-3" onClick={openNew}>
                Add the first one
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{s.name}</span>
                    {!s.active ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        inactive
                      </span>
                    ) : null}
                    {s.category ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                        {categoryLabel(s.category)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {s.contact_name ? <span>{s.contact_name}</span> : null}
                    {s.email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {s.email}
                      </span>
                    ) : null}
                    {s.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {s.phone}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {s.lead_time_days}d lead time
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {s.open_pos} open PO{s.open_pos === 1 ? "" : "s"}
                    </p>
                    <p className="text-sm font-medium tabular-nums">{fmtMoney(s.total_spend)}</p>
                  </div>
                  {canEdit ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)} title="Edit">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {dialogOpen ? (
        <SupplierFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            void reload();
          }}
          supplier={editing}
          post={post}
        />
      ) : null}
    </PageShell>
  );
}

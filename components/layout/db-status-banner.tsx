"use client";

import { AlertTriangle, Database } from "lucide-react";
import { useCrmStore } from "@/lib/store/crm-store";

export function DbStatusBanner() {
  const { isLoaded, dbError } = useCrmStore();

  if (!isLoaded) return null;

  if (dbError) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <div className="mx-auto flex max-w-6xl items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Supabase connection issue</p>
            <p className="text-amber-800">{dbError}</p>
            <p className="mt-1 text-amber-700">
              Run the SQL in{" "}
              <code className="rounded bg-amber-100 px-1">
                supabase/migrations/001_initial_schema.sql
              </code>{" "}
              in your Supabase SQL Editor, then refresh.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-800">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <Database className="size-3.5" />
        Connected to Supabase — changes sync to your database
      </div>
    </div>
  );
}

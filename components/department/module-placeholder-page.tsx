"use client";

import { PageHeader, PageShell, Panel } from "@/components/layout/page-shell";
import { MODULES } from "@/lib/modules";
import type { ModuleKey } from "@/lib/types";

/**
 * Shell for modules that are granted and navigable but not built out yet.
 *
 * Access is already enforced by RouteGuard in the dashboard layout, so this
 * component only renders content — it does not repeat the permission check.
 */
export function ModulePlaceholderPage({
  moduleKey,
  note,
}: {
  moduleKey: ModuleKey;
  note?: string;
}) {
  const mod = MODULES[moduleKey];

  return (
    <PageShell>
      <PageHeader title={mod.label} description={mod.description} />
      <Panel title="Not built out yet">
        <p className="text-sm text-muted-foreground">
          {note ??
            `${mod.label} is enabled for your account and staff can be granted access to it, but its screens haven't been built yet.`}
        </p>
      </Panel>
    </PageShell>
  );
}

"use client";

import { usePlaceholderDepartmentAccess } from "@/lib/hooks/use-placeholder-department-access";
import { getDepartmentLabel, type PlaceholderDepartment } from "@/lib/permissions";
import { PageHeader, PageShell, Panel } from "@/components/layout/page-shell";

export function PlaceholderDepartmentPage({
  department,
  description,
}: {
  department: PlaceholderDepartment;
  description: string;
}) {
  const { allowed, isLoading } = usePlaceholderDepartmentAccess(department);
  const label = getDepartmentLabel(department);

  if (isLoading || !allowed) return null;

  return (
    <PageShell>
      <PageHeader title={label} description={description} />
      <Panel title="Coming soon">
        <p className="text-sm text-muted-foreground">
          This department is ready for staff assignment. Tools and workflows for{" "}
          {label.toLowerCase()} will be added here next.
        </p>
      </Panel>
    </PageShell>
  );
}

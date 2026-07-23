"use client";

import { usePlaceholderDepartmentAccess } from "@/lib/hooks/use-placeholder-department-access";
import { getDepartmentLabel, type PlaceholderDepartment } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">{label}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This department is ready for staff assignment. Tools and workflows for {label.toLowerCase()}{" "}
          will be added here next.
        </CardContent>
      </Card>
    </div>
  );
}

import { COVERAGE_LABELS } from "@/lib/constants";
import type { CoverageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const colors: Record<CoverageStatus, string> = {
  confirmed: "bg-green-100 text-green-800 border-green-200",
  pending_survey: "bg-amber-100 text-amber-800 border-amber-200",
  not_available: "bg-red-100 text-red-800 border-red-200",
};

export function CoverageBadge({ status, className }: { status: CoverageStatus; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", colors[status], className)}>
      {COVERAGE_LABELS[status]}
    </span>
  );
}

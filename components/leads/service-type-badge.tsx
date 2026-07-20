import { Badge } from "@/components/ui/badge";
import { SERVICE_LABELS } from "@/lib/constants";
import type { ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const colors: Record<ServiceType, string> = {
  fiber: "bg-blue-100 text-blue-800 border-blue-200",
  wireless: "bg-amber-100 text-amber-800 border-amber-200",
  both: "bg-purple-100 text-purple-800 border-purple-200",
};

export function ServiceTypeBadge({
  type,
  className,
}: {
  type: ServiceType;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", colors[type], className)}>
      {SERVICE_LABELS[type]}
    </Badge>
  );
}

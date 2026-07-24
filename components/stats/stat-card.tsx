import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  className?: string;
  accent?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
  accent,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-elevated px-4 py-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {Icon ? (
          <Icon
            className="h-4 w-4 shrink-0 text-muted-foreground"
            style={accent ? { color: accent } : undefined}
          />
        ) : null}
      </div>
      <p
        className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

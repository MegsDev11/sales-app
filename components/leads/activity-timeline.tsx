import {
  Phone,
  Mail,
  CheckSquare,
  MapPin,
} from "lucide-react";
import { ACTIVITY_LABELS } from "@/lib/constants";
import { formatRelativeDate } from "@/lib/utils/time";
import type { Activity, ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconMap: Record<ActivityType, typeof Phone> = {
  call: Phone,
  email: Mail,
  task: CheckSquare,
  site_visit: MapPin,
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activities logged yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => {
        const Icon = iconMap[activity.type];
        return (
          <div key={activity.id} className="flex gap-3">
            <div className="relative flex flex-col items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                <Icon className="h-4 w-4 text-gray-600" />
              </div>
              {index < activities.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-gray-200" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <p className="text-sm font-medium">{activity.title}</p>
              <p className="text-xs text-muted-foreground">
                {ACTIVITY_LABELS[activity.type]} · {formatRelativeDate(activity.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ActivityIcon({
  type,
  className,
}: {
  type: ActivityType;
  className?: string;
}) {
  const Icon = iconMap[type];
  return <Icon className={cn("h-4 w-4", className)} />;
}

import Link from "next/link";
import { ArrowLeft, Clock, Zap, Thermometer, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimulationStatusBadge } from "@/components/simulations/simulation-status-badge";
import { formatHour, formatHourRange, formatDuration } from "@/lib/utils";
import type { TickStatus } from "@/lib/sim/engine/types";
import type { EnvironmentSnapshot, TickSnapshot } from "@/lib/sim/prompts/types";

interface TickDetailProps {
  hour: number;
  day: number;
  status: TickStatus;
  startedAt: string | null;
  finishedAt: string | null;
  tickSnapshot: TickSnapshot | null;
  environment: EnvironmentSnapshot | null;
  simulationId: string;
  dayId: string;
}

const weatherIcons: Record<EnvironmentSnapshot["weather"], string> = {
  sunny: "text-yellow-500",
  cloudy: "text-gray-500",
  rainy: "text-blue-500",
  hot: "text-orange-500",
  cold: "text-cyan-500",
};

export function TickDetail({
  hour,
  day,
  status,
  startedAt,
  finishedAt,
  tickSnapshot,
  environment,
  simulationId,
  dayId,
}: TickDetailProps) {
  const duration = formatDuration(startedAt, finishedAt);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/simulations/${simulationId}/days/${dayId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Day {day}
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {formatHour(hour)}
          </h1>
          <SimulationStatusBadge status={status} />
        </div>

        <p className="text-sm text-muted-foreground">
          Day {day} &middot; {formatHourRange(hour)}
        </p>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {duration}
            </span>
          )}
          {tickSnapshot?.event && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {formatTickEvent(tickSnapshot.event)}
            </Badge>
          )}
          {environment && (
            <>
              <span className="flex items-center gap-1">
                <Cloud className={`h-4 w-4 ${weatherIcons[environment.weather]}`} />
                <span className="capitalize">{environment.weather}</span>
              </span>
              <span className="flex items-center gap-1">
                <Thermometer className="h-4 w-4" />
                {environment.temperature}°F
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTickEvent(event: string): string {
  return event
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

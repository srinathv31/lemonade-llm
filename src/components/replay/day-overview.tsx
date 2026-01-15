import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimulationStatusBadge } from "@/components/simulations/simulation-status-badge";
import type { DayStatus } from "@/lib/sim/engine/types";

interface DayOverviewProps {
  day: number;
  status: DayStatus;
  seed: number;
  startedAt: string | null;
  finishedAt: string | null;
  simulationId: string;
  simulationName: string;
}

export function DayOverview({
  day,
  status,
  seed,
  startedAt,
  finishedAt,
  simulationId,
  simulationName,
}: DayOverviewProps) {
  const duration = calculateDuration(startedAt, finishedAt);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/simulations/${simulationId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {simulationName}
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Day {day}
          </h1>
          <SimulationStatusBadge status={status} />
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Hash className="h-4 w-4" />
            Seed: {seed}
          </span>
          {startedAt && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(startedAt)}
            </span>
          )}
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {duration}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function calculateDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

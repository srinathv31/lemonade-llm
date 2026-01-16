import Link from "next/link";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimulationStatusBadge } from "./simulation-status-badge";
import type { SimulationWithDetails } from "@/lib/queries/simulations";

interface SimulationHeaderProps {
  simulation: SimulationWithDetails;
}

export function SimulationHeader({ simulation }: SimulationHeaderProps) {
  const config = simulation.config as { numDays?: number };
  const numDays = config?.numDays ?? 5;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/simulations">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Simulations
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {simulation.name}
          </h1>
          <SimulationStatusBadge status={simulation.status} />
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {numDays} {numDays === 1 ? "day" : "days"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Created {formatDate(simulation.createdAt)}
          </span>
          {simulation.finishedAt && (
            <span>Finished {formatDate(simulation.finishedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

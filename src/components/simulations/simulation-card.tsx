import Link from "next/link";
import { SimulationStatusBadge } from "./simulation-status-badge";
import type { SimulationListItem } from "@/lib/queries/simulations";

interface SimulationCardProps {
  simulation: SimulationListItem;
}

export function SimulationCard({ simulation }: SimulationCardProps) {
  return (
    <Link href={`/simulations/${simulation.id}`}>
      <div className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold truncate">{simulation.name}</h3>
          <SimulationStatusBadge status={simulation.status} />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {simulation.agentCount} agent{simulation.agentCount !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Created {simulation.createdAt.toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

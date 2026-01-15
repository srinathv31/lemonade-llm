import { SimulationCard } from "./simulation-card";
import type { SimulationListItem } from "@/lib/queries/simulations";

interface SimulationListProps {
  simulations: SimulationListItem[];
}

export function SimulationList({ simulations }: SimulationListProps) {
  if (simulations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-semibold">No simulations yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first simulation to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {simulations.map((simulation) => (
        <SimulationCard key={simulation.id} simulation={simulation} />
      ))}
    </div>
  );
}

import { Suspense } from "react";
import {
  getSimulations,
  type SimulationStatus,
} from "@/lib/queries/simulations";
import { SimulationList } from "@/components/simulations/simulation-list";
import { CreateSimulationDialog } from "@/components/simulations/create-simulation-dialog";
import { SimulationFilter } from "@/components/simulations/simulation-filter";

interface SimulationsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function SimulationsPage({
  searchParams,
}: SimulationsPageProps) {
  const { status } = await searchParams;

  // Validate status is a valid SimulationStatus or undefined
  const validStatuses = ["pending", "running", "completed", "partial", "failed"];
  const statusFilter =
    status && validStatuses.includes(status)
      ? (status as SimulationStatus)
      : undefined;

  const { simulations, total } = await getSimulations({
    status: statusFilter,
    limit: 10,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
          <p className="text-muted-foreground">
            Manage your lemonade stand simulations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <SimulationFilter />
          </Suspense>
          <CreateSimulationDialog />
        </div>
      </div>

      <SimulationList simulations={simulations} />

      {total > 10 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {simulations.length} of {total} simulations
        </p>
      )}
    </div>
  );
}

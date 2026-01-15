import { getSimulations } from "@/lib/queries/simulations";
import { SimulationList } from "@/components/simulations/simulation-list";
import { CreateSimulationDialog } from "@/components/simulations/create-simulation-dialog";

export default async function SimulationsPage() {
  const { simulations, total } = await getSimulations({ limit: 10 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
          <p className="text-muted-foreground">
            Manage your lemonade stand simulations
          </p>
        </div>
        <CreateSimulationDialog />
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

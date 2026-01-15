import { getSimulations } from "@/lib/queries/simulations";

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
        {/* TODO: Add create simulation button */}
      </div>

      {simulations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <h3 className="text-lg font-semibold">No simulations yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first simulation to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {simulations.map((sim) => (
            <div
              key={sim.id}
              className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold truncate">{sim.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    sim.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : sim.status === "running"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : sim.status === "failed"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {sim.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {sim.agentCount} agent{sim.agentCount !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {sim.createdAt.toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {total > 10 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {simulations.length} of {total} simulations
        </p>
      )}
    </div>
  );
}

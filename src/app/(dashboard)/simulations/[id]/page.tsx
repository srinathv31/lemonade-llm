import { notFound } from "next/navigation";
import { getSimulation } from "@/lib/queries/simulations";
import { SimulationHeader } from "@/components/simulations/simulation-header";
import { SimulationSummary } from "@/components/simulations/simulation-summary";
import { AgentList } from "@/components/simulations/agent-list";
import { DayProgressGrid } from "@/components/simulations/day-progress-grid";
import { RunControls } from "@/components/simulations/run-controls";

interface SimulationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SimulationDetailPage({
  params,
}: SimulationDetailPageProps) {
  const { id } = await params;
  const simulation = await getSimulation(id);

  if (!simulation) {
    notFound();
  }

  // Find the next pending day number (first day not completed)
  const nextPendingDay = simulation.summary
    ? simulation.days.find((d) => d.status !== "completed")?.day ??
      (simulation.summary.completedDays < simulation.summary.totalDays
        ? simulation.summary.completedDays + 1
        : null)
    : 1;

  return (
    <div className="space-y-6">
      <SimulationHeader simulation={simulation} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <DayProgressGrid
            simulationId={id}
            days={simulation.days}
            totalDays={simulation.summary?.totalDays ?? 5}
          />
          <RunControls
            simulationId={id}
            status={simulation.status}
            nextPendingDay={nextPendingDay}
          />
        </div>
        <div className="space-y-6">
          <SimulationSummary summary={simulation.summary} />
          <AgentList agents={simulation.agents} />
        </div>
      </div>
    </div>
  );
}

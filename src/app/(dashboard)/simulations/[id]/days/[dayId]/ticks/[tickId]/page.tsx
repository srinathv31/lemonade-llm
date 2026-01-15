import { notFound } from "next/navigation";
import { loadTickReplay, loadDayReplay } from "@/lib/queries/replay";
import { getSimulation } from "@/lib/queries/simulations";
import { TickDetail } from "@/components/replay/tick-detail";
import { TickNavigation } from "@/components/replay/tick-navigation";
import { AgentDecisionCard } from "@/components/replay/agent-decision-card";
import { AgentOutcomeCard } from "@/components/replay/agent-outcome-card";
import { DemandFactorsCard } from "@/components/replay/demand-factors-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Bot } from "lucide-react";

interface TickReplayPageProps {
  params: Promise<{ id: string; dayId: string; tickId: string }>;
}

export default async function TickReplayPage({ params }: TickReplayPageProps) {
  const { id, dayId, tickId } = await params;

  // Fetch tick, day, and simulation data in parallel
  const [tickResult, dayResult, simulation] = await Promise.all([
    loadTickReplay(tickId),
    loadDayReplay(dayId),
    getSimulation(id),
  ]);

  if (!tickResult.success || !dayResult.success || !simulation) {
    notFound();
  }

  const tick = tickResult.data;
  const day = dayResult.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <TickDetail
        hour={tick.hour}
        day={tick.day}
        status={tick.status}
        startedAt={tick.startedAt}
        finishedAt={tick.finishedAt}
        tickSnapshot={tick.tickSnapshot}
        environment={tick.environment}
        simulationId={id}
        dayId={dayId}
      />

      {/* Navigation */}
      <TickNavigation
        simulationId={id}
        dayId={dayId}
        currentHour={tick.hour}
        ticks={day.ticks}
      />

      {/* Agent Turns */}
      {tick.agentTurns.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {tick.agentTurns.map((turn) => (
            <div key={turn.agentId} className="space-y-4">
              <AgentDecisionCard
                agentId={turn.agentId}
                modelName={turn.modelName}
                decision={turn.decision}
                metadata={turn.metadata}
              />
              <AgentOutcomeCard
                agentId={turn.agentId}
                modelName={turn.modelName}
                outcome={turn.outcome}
              />
              {turn.outcome?.demandFactors && (
                <DemandFactorsCard
                  agentId={turn.agentId}
                  modelName={turn.modelName}
                  demandFactors={turn.outcome.demandFactors}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bot}
          title="No agent turns"
          description="This tick has no recorded agent decisions."
        />
      )}
    </div>
  );
}

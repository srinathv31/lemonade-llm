"use client";

import { useTransition } from "react";
import { Play, PlayCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { runSimulationDay, runFullSimulation } from "@/app/actions/simulations";

interface RunControlsProps {
  simulationId: string;
  status: string;
  nextPendingDay: number | null;
}

export function RunControls({
  simulationId,
  status,
  nextPendingDay,
}: RunControlsProps) {
  const [isPendingDay, startTransitionDay] = useTransition();
  const [isPendingAll, startTransitionAll] = useTransition();

  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isDisabled = isRunning || isCompleted || isPendingDay || isPendingAll;

  function handleRunDay() {
    if (!nextPendingDay) return;

    startTransitionDay(async () => {
      const result = await runSimulationDay(simulationId, nextPendingDay);
      if (!result.success) {
        console.error("Failed to run day:", result.error);
      }
    });
  }

  function handleRunAll() {
    startTransitionAll(async () => {
      const result = await runFullSimulation(simulationId);
      if (!result.success) {
        console.error("Failed to run simulation:", result.error);
      }
    });
  }

  if (isCompleted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Simulation completed. All days have been run.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleRunDay}
            disabled={isDisabled || !nextPendingDay}
          >
            {isPendingDay ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Day {nextPendingDay}...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {nextPendingDay ? `Run Day ${nextPendingDay}` : "No pending days"}
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={handleRunAll}
            disabled={isDisabled || !nextPendingDay}
          >
            {isPendingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running All...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Run All
              </>
            )}
          </Button>
        </div>

        {isRunning && (
          <p className="text-sm text-muted-foreground mt-3">
            Simulation is currently running...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

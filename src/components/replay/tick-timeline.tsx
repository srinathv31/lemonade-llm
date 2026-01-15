"use client";

import Link from "next/link";
import { cn, formatCurrency, formatHour } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TickSummaryEntry } from "@/lib/sim/replay/types";

interface TickTimelineProps {
  ticks: TickSummaryEntry[];
  simulationId: string;
  dayId: string;
}

const statusColors: Record<TickSummaryEntry["status"], string> = {
  completed: "bg-green-500 hover:bg-green-600",
  partial: "bg-yellow-500 hover:bg-yellow-600",
  failed: "bg-red-500 hover:bg-red-600",
};

const statusBgColors: Record<TickSummaryEntry["status"], string> = {
  completed: "bg-green-100 dark:bg-green-900/30",
  partial: "bg-yellow-100 dark:bg-yellow-900/30",
  failed: "bg-red-100 dark:bg-red-900/30",
};

export function TickTimeline({
  ticks,
  simulationId,
  dayId,
}: TickTimelineProps) {
  // Create array of 8 hours (9am-5pm, hours 0-7)
  const hours = Array.from({ length: 8 }, (_, i) => i);
  const tickMap = new Map(ticks.map((t) => [t.hour, t]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Timeline (9 AM - 5 PM)</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="flex gap-2">
            {hours.map((hour) => {
              const tick = tickMap.get(hour);

              return (
                <Tooltip key={hour}>
                  <TooltipTrigger asChild>
                    {tick ? (
                      <Link
                        href={`/simulations/${simulationId}/days/${dayId}/ticks/${tick.tickId}`}
                        className={cn(
                          "flex-1 p-2 rounded-lg transition-colors cursor-pointer",
                          statusBgColors[tick.status],
                          "hover:ring-2 hover:ring-primary hover:ring-offset-2"
                        )}
                      >
                        <TickSlot hour={hour} tick={tick} />
                      </Link>
                    ) : (
                      <div
                        className={cn(
                          "flex-1 p-2 rounded-lg bg-muted",
                          "opacity-50"
                        )}
                      >
                        <TickSlot hour={hour} tick={null} />
                      </div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <div className="space-y-1">
                      <div className="font-medium">{formatHour(hour)}</div>
                      {tick ? (
                        <>
                          <div className="capitalize">Status: {tick.status}</div>
                          <div>Customers: {tick.totalCustomers}</div>
                          <div>Revenue: {formatCurrency(tick.totalRevenue)}</div>
                          <div>Agents: {tick.successfulAgents}/{tick.agentCount}</div>
                        </>
                      ) : (
                        <div className="text-muted-foreground">Not yet run</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span>Partial</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span>Failed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-muted" />
            <span>Pending</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TickSlotProps {
  hour: number;
  tick: TickSummaryEntry | null;
}

function TickSlot({ hour, tick }: TickSlotProps) {
  return (
    <div className="text-center space-y-1">
      <div className="text-xs font-medium">{formatHour(hour)}</div>
      {tick ? (
        <>
          <div
            className={cn(
              "w-3 h-3 rounded-full mx-auto",
              statusColors[tick.status]
            )}
          />
          <div className="text-xs text-muted-foreground">
            ${tick.totalRevenue.toFixed(0)}
          </div>
        </>
      ) : (
        <>
          <div className="w-3 h-3 rounded-full mx-auto bg-muted-foreground/30" />
          <div className="text-xs text-muted-foreground">-</div>
        </>
      )}
    </div>
  );
}

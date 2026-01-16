import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SimulationDayStatus } from "@/lib/queries/simulations";

interface DayProgressGridProps {
  simulationId: string;
  days: SimulationDayStatus[];
  totalDays: number;
}

export function DayProgressGrid({
  simulationId,
  days,
  totalDays,
}: DayProgressGridProps) {
  // Create a map of day number to day data for quick lookup
  const dayMap = new Map(days.map((d) => [d.day, d]));

  // Generate all day cells (1 to totalDays)
  const dayCells = Array.from({ length: totalDays }, (_, i) => {
    const dayNumber = i + 1;
    const dayData = dayMap.get(dayNumber);
    return { dayNumber, dayData };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Day Progress</CardTitle>
        <CardDescription>
          Click a day to view its replay
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
          {dayCells.map(({ dayNumber, dayData }) => (
            <DayCell
              key={dayNumber}
              simulationId={simulationId}
              dayNumber={dayNumber}
              dayData={dayData}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface DayCellProps {
  simulationId: string;
  dayNumber: number;
  dayData?: SimulationDayStatus;
}

function DayCell({ simulationId, dayNumber, dayData }: DayCellProps) {
  const status = dayData?.status ?? "future";
  const tickProgress = dayData
    ? `${dayData.completedTicks}/${dayData.tickCount || 8}`
    : null;

  const statusStyles = {
    completed: "bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700",
    running: "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700 animate-pulse",
    pending: "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700",
    partial: "bg-orange-100 border-orange-300 dark:bg-orange-900/30 dark:border-orange-700",
    failed: "bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-700",
    future: "bg-muted/50 border-muted-foreground/20",
  };

  const cellContent = (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors min-h-[60px]",
        statusStyles[status as keyof typeof statusStyles] ?? statusStyles.future,
        dayData && "hover:ring-2 hover:ring-primary/50 cursor-pointer"
      )}
    >
      <span className="text-sm font-semibold">Day {dayNumber}</span>
      {tickProgress && (
        <span className="text-xs text-muted-foreground">{tickProgress}</span>
      )}
      {!dayData && (
        <span className="text-xs text-muted-foreground">--</span>
      )}
    </div>
  );

  // Only link if there's day data (day has been created)
  if (dayData) {
    return (
      <Link
        href={`/simulations/${simulationId}/days/${dayData.id}`}
        className="focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
      >
        {cellContent}
      </Link>
    );
  }

  return cellContent;
}

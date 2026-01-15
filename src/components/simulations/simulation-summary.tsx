import { DollarSign, Calendar, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SimulationSummaryProps {
  summary?: {
    totalDays: number;
    completedDays: number;
    totalTicks: number;
    completedTicks: number;
    totalRevenue: number;
  };
}

export function SimulationSummary({ summary }: SimulationSummaryProps) {
  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
          <CardDescription>No data yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run the simulation to see summary statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  const dayProgress =
    summary.totalDays > 0
      ? (summary.completedDays / summary.totalDays) * 100
      : 0;

  const tickProgress =
    summary.totalTicks > 0
      ? (summary.completedTicks / summary.totalTicks) * 100
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Summary</CardTitle>
        <CardDescription>Simulation progress and totals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-xl font-bold">{formatCurrency(summary.totalRevenue)}</p>
          </div>
        </div>

        {/* Days Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Days
            </span>
            <span className="text-muted-foreground">
              {summary.completedDays} / {summary.totalDays}
            </span>
          </div>
          <Progress value={dayProgress} className="h-2" />
        </div>

        {/* Ticks Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Ticks
            </span>
            <span className="text-muted-foreground">
              {summary.completedTicks} / {summary.totalTicks}
            </span>
          </div>
          <Progress value={tickProgress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

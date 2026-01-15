import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { DemandFactors } from "@/lib/sim/customers/types";

interface AgentOutcomeCardProps {
  agentId: string;
  modelName: string;
  outcome: {
    customersServed: number;
    salesVolume: number;
    revenue: number;
    marketShare: number;
    demandFactors: DemandFactors | null;
  } | null;
  previousOutcome?: {
    revenue: number;
    customersServed: number;
    marketShare: number;
  } | null;
}

export function AgentOutcomeCard({
  outcome,
  previousOutcome,
}: AgentOutcomeCardProps) {
  if (!outcome) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No outcome recorded
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Outcome</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4 text-green-500" />
              Revenue
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {formatCurrency(outcome.revenue)}
              </span>
              {previousOutcome && (
                <DeltaIndicator
                  current={outcome.revenue}
                  previous={previousOutcome.revenue}
                  format={(v) => formatCurrency(v, 0)}
                />
              )}
            </div>
          </div>

          {/* Customers Served */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4 text-blue-500" />
              Customers
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {outcome.customersServed}
              </span>
              {previousOutcome && (
                <DeltaIndicator
                  current={outcome.customersServed}
                  previous={previousOutcome.customersServed}
                  format={(v) => v.toString()}
                />
              )}
            </div>
          </div>

          {/* Sales Volume */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <ShoppingCart className="h-4 w-4 text-purple-500" />
              Sales Volume
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {outcome.salesVolume} cups
              </span>
            </div>
          </div>

          {/* Market Share */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <PieChart className="h-4 w-4 text-orange-500" />
              Market Share
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {formatPercent(outcome.marketShare)}
              </span>
              {previousOutcome && (
                <DeltaIndicator
                  current={outcome.marketShare}
                  previous={previousOutcome.marketShare}
                  format={(v) => formatPercent(v)}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DeltaIndicatorProps {
  current: number;
  previous: number;
  format: (value: number) => string;
}

function DeltaIndicator({ current, previous, format }: DeltaIndicatorProps) {
  const delta = current - previous;
  const threshold = Math.abs(previous) * 0.01; // 1% threshold

  if (Math.abs(delta) < threshold) {
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  }

  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 text-green-600 text-xs">
        <TrendingUp className="h-3 w-3" />
        +{format(delta)}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-0.5 text-red-600 text-xs">
      <TrendingDown className="h-3 w-3" />
      {format(delta)}
    </span>
  );
}

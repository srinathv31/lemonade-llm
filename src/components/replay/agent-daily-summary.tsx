import { Bot, DollarSign, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AgentDailySummary as AgentDailySummaryType } from "@/lib/sim/engine/types";

interface AgentDailySummaryProps {
  agentSummaries: AgentDailySummaryType[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function AgentDailySummary({ agentSummaries }: AgentDailySummaryProps) {
  // Sort by total revenue descending
  const sortedAgents = [...agentSummaries].sort(
    (a, b) => b.totalRevenue - a.totalRevenue
  );

  const maxRevenue = sortedAgents[0]?.totalRevenue ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Agent Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedAgents.map((agent, index) => (
          <AgentCard
            key={agent.agentId}
            agent={agent}
            rank={index + 1}
            maxRevenue={maxRevenue}
          />
        ))}

        {agentSummaries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No agent data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface AgentCardProps {
  agent: AgentDailySummaryType;
  rank: number;
  maxRevenue: number;
}

function AgentCard({ agent, rank, maxRevenue }: AgentCardProps) {
  const revenuePercent = maxRevenue > 0 ? (agent.totalRevenue / maxRevenue) * 100 : 0;

  return (
    <div className="p-3 rounded-lg border space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            <span className="text-muted-foreground">#{rank}</span>
            {agent.modelName}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-green-500" />
          <span className="text-muted-foreground">Revenue:</span>
          <span className="font-medium">{formatCurrency(agent.totalRevenue)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-blue-500" />
          <span className="text-muted-foreground">Customers:</span>
          <span className="font-medium">{agent.totalCustomersServed}</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-purple-500" />
          <span className="text-muted-foreground">Market Share:</span>
          <span className="font-medium">
            {(agent.marketShareAverage * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Avg Price:</span>
          <span className="font-medium">{formatCurrency(agent.averagePrice)}</span>
        </div>
      </div>

      {/* Revenue Progress */}
      <div className="space-y-1">
        <Progress value={revenuePercent} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {agent.successfulDecisions}/{agent.ticksParticipated} ticks
          </span>
          <span>
            Q:{agent.averageQuality.toFixed(1)} M:{agent.averageMarketing.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}

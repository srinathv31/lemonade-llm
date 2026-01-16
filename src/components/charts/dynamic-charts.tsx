"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { TickSummaryEntry } from "@/lib/sim/replay/types";
import type { AgentDailySummary } from "@/lib/sim/engine/types";

// Chart loading skeleton
function ChartSkeleton() {
  return <Skeleton className="h-[300px] w-full" />;
}

// Dynamic imports for heavy chart components - reduces initial bundle by ~300KB
const RevenueChartLazy = dynamic(
  () =>
    import("@/components/charts/revenue-chart").then((m) => m.RevenueChart),
  {
    ssr: false,
    loading: ChartSkeleton,
  }
);

const MarketShareChartLazy = dynamic(
  () =>
    import("@/components/charts/market-share-chart").then(
      (m) => m.MarketShareChart
    ),
  {
    ssr: false,
    loading: ChartSkeleton,
  }
);

// Wrapper components that can be imported from server components
export function DynamicRevenueChart({ ticks }: { ticks: TickSummaryEntry[] }) {
  return <RevenueChartLazy ticks={ticks} />;
}

export function DynamicMarketShareChart({
  agentSummaries,
}: {
  agentSummaries: AgentDailySummary[];
}) {
  return <MarketShareChartLazy agentSummaries={agentSummaries} />;
}

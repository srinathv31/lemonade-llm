"use client";

import { useMemo } from "react";
import { Pie, PieChart, Cell, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AgentDailySummary } from "@/lib/sim/engine/types";

interface MarketShareChartProps {
  agentSummaries: AgentDailySummary[];
}

// Chart colors from CSS variables
const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function MarketShareChart({ agentSummaries }: MarketShareChartProps) {
  const { chartData, chartConfig, totalCustomers } = useMemo(() => {
    const total = agentSummaries.reduce(
      (sum, a) => sum + a.totalCustomersServed,
      0
    );

    const data = agentSummaries.map((agent, index) => ({
      name: agent.modelName,
      value: agent.totalCustomersServed,
      fill: COLORS[index % COLORS.length],
    }));

    const config = agentSummaries.reduce((acc, agent, index) => {
      acc[agent.modelName] = {
        label: agent.modelName,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as ChartConfig);

    return { chartData: data, chartConfig: config, totalCustomers: total };
  }, [agentSummaries]);

  if (agentSummaries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market Share</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Market Share</CardTitle>
        <CardDescription>Customer distribution by agent</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[200px]">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => {
                    const percent = totalCustomers > 0
                      ? ((Number(value) / totalCustomers) * 100).toFixed(1)
                      : "0";
                    return `${value} customers (${percent}%)`;
                  }}
                  nameKey="name"
                />
              }
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {totalCustomers}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 20}
                          className="fill-muted-foreground text-xs"
                        >
                          customers
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

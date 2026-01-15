"use client";

import { useMemo } from "react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TickSummaryEntry } from "@/lib/sim/replay/types";

interface RevenueChartProps {
  ticks: TickSummaryEntry[];
}

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--chart-1))",
  },
  customers: {
    label: "Customers",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

function formatHour(hour: number): string {
  const displayHour = hour + 9;
  if (displayHour === 12) return "12PM";
  if (displayHour < 12) return `${displayHour}AM`;
  return `${displayHour - 12}PM`;
}

export function RevenueChart({ ticks }: RevenueChartProps) {
  const chartData = useMemo(() => {
    // Create data for all 8 hours
    return Array.from({ length: 8 }, (_, i) => {
      const tick = ticks.find((t) => t.hour === i);
      return {
        hour: formatHour(i),
        revenue: tick?.totalRevenue ?? 0,
        customers: tick?.totalCustomers ?? 0,
      };
    });
  }, [ticks]);

  const totalRevenue = ticks.reduce((sum, t) => sum + t.totalRevenue, 0);
  const totalCustomers = ticks.reduce((sum, t) => sum + t.totalCustomers, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Revenue Over Time</CardTitle>
        <CardDescription>
          Total: ${totalRevenue.toFixed(2)} from {totalCustomers} customers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
              tickFormatter={(value) => `$${value}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    if (name === "revenue") {
                      return `$${Number(value).toFixed(2)}`;
                    }
                    return value;
                  }}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              dot={{ fill: "var(--color-revenue)", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

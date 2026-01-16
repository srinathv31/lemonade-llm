"use client";

import { useState } from "react";
import {
  ChevronDown,
  Calculator,
  Cloud,
  Zap,
  Target,
  Users,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { DemandFactors } from "@/lib/sim/customers/types";

interface DemandFactorsCardProps {
  agentId: string;
  modelName: string;
  demandFactors: DemandFactors;
  defaultOpen?: boolean;
}

export function DemandFactorsCard({
  demandFactors,
  defaultOpen = false,
}: DemandFactorsCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Demand Breakdown
              </CardTitle>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform text-muted-foreground",
                  isOpen && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Input Values */}
            <FactorSection title="Environment" icon={Cloud}>
              <FactorRow label="Base Demand" value={demandFactors.baseDemand} />
              <FactorRow
                label="Demand Multiplier"
                value={`${demandFactors.demandMultiplier.toFixed(2)}x`}
              />
              <FactorRow
                label="Weather"
                value={capitalizeFirst(demandFactors.weather)}
              />
              {demandFactors.specialEvent && (
                <FactorRow
                  label="Special Event"
                  value={capitalizeFirst(demandFactors.specialEvent)}
                />
              )}
            </FactorSection>

            <Separator />

            {/* Agent Decision Inputs */}
            <FactorSection title="Decision Inputs" icon={Target}>
              <FactorRow
                label="Price"
                value={formatCurrency(demandFactors.price)}
              />
              <FactorRow label="Quality" value={`${demandFactors.quality}/10`} />
              <FactorRow
                label="Marketing"
                value={`${demandFactors.marketing}%`}
              />
            </FactorSection>

            <Separator />

            {/* Calculated Scores */}
            <FactorSection title="Calculated Scores" icon={Calculator}>
              <FactorRow
                label="Price Score"
                value={demandFactors.priceScore.toFixed(2)}
              />
              <FactorRow
                label="Quality Score"
                value={demandFactors.qualityScore.toFixed(2)}
              />
              <FactorRow
                label="Marketing Score"
                value={demandFactors.marketingScore.toFixed(2)}
              />
              <FactorRow
                label="Total Agent Score"
                value={demandFactors.totalAgentScore.toFixed(2)}
                highlight
              />
            </FactorSection>

            <Separator />

            {/* Market Context */}
            <FactorSection title="Market Context" icon={Percent}>
              <FactorRow
                label="Total Market Score"
                value={demandFactors.totalMarketScore.toFixed(2)}
              />
              <FactorRow
                label="Market Share"
                value={formatPercent(demandFactors.marketShare)}
                highlight
              />
            </FactorSection>

            <Separator />

            {/* Modifiers */}
            <FactorSection title="Modifiers Applied" icon={Zap}>
              <FactorRow
                label="Weather Demand"
                value={`${demandFactors.weatherDemandModifier.toFixed(2)}x`}
              />
              <FactorRow
                label="Weather Quality"
                value={`${demandFactors.weatherQualityImportance.toFixed(2)}x`}
              />
              <FactorRow
                label="Event Modifier"
                value={`${demandFactors.eventModifier.toFixed(2)}x`}
              />
            </FactorSection>

            <Separator />

            {/* Final Allocation */}
            <FactorSection title="Final Result" icon={Users}>
              <FactorRow
                label="Available Customers"
                value={demandFactors.totalAvailableCustomers}
              />
              <FactorRow
                label="Customers Allocated"
                value={demandFactors.customersAllocated}
                highlight
              />
            </FactorSection>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface FactorSectionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function FactorSection({ title, icon: Icon, children }: FactorSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pl-6">
        {children}
      </div>
    </div>
  );
}

interface FactorRowProps {
  label: string;
  value: string | number;
  highlight?: boolean;
}

function FactorRow({ label, value, highlight }: FactorRowProps) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-right", highlight && "font-semibold")}>
        {value}
      </span>
    </>
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

"use client";

import { useState } from "react";
import {
  Bot,
  DollarSign,
  Star,
  Megaphone,
  MessageSquare,
  AlertTriangle,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency, formatMs, cn } from "@/lib/utils";

interface AgentDecisionCardProps {
  agentId: string;
  modelName: string;
  decision: {
    price: number;
    quality: number;
    marketing: number;
    reasoning: string | null;
  };
  metadata: {
    artifactId: string | null;
    durationMs: number | null;
    usedFallback: boolean;
    error: string | null;
  };
}

export function AgentDecisionCard({
  modelName,
  decision,
  metadata,
}: AgentDecisionCardProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <span>{modelName}</span>
          </div>
          <div className="flex items-center gap-2">
            {metadata.usedFallback && (
              <Badge variant="secondary" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Fallback
              </Badge>
            )}
            {metadata.durationMs !== null && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatMs(metadata.durationMs)}
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Decision Stats */}
        <div className="grid gap-4">
          {/* Price */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-4 w-4 text-green-500" />
                Price
              </span>
              <span className="font-medium">{formatCurrency(decision.price)}</span>
            </div>
          </div>

          {/* Quality */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Star className="h-4 w-4 text-yellow-500" />
                Quality
              </span>
              <span className="font-medium">{decision.quality}/10</span>
            </div>
            <Progress value={decision.quality * 10} className="h-2" />
          </div>

          {/* Marketing */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Megaphone className="h-4 w-4 text-blue-500" />
                Marketing
              </span>
              <span className="font-medium">{decision.marketing}%</span>
            </div>
            <Progress value={decision.marketing} className="h-2" />
          </div>
        </div>

        {/* Error Alert */}
        {metadata.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {metadata.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Reasoning (Collapsible) */}
        {decision.reasoning && (
          <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between"
              >
                <span className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" />
                  Reasoning
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    reasoningOpen && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                {decision.reasoning}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

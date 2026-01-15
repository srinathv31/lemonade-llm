import { Bot } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SimulationAgent } from "@/lib/queries/simulations";

interface AgentListProps {
  agents: SimulationAgent[];
}

export function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agents</CardTitle>
          <CardDescription>No agents configured</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This simulation has no agents.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Agents</CardTitle>
        <CardDescription>
          {agents.length} {agents.length === 1 ? "agent" : "agents"} competing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {agents.map((agent) => (
            <li key={agent.id} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <Badge variant="secondary" className="font-mono text-xs">
                  {agent.modelName}
                </Badge>
                {agent.strategy && Object.keys(agent.strategy).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Custom strategy
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

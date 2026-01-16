import {
  Sun,
  Cloud,
  CloudRain,
  Thermometer,
  Snowflake,
  Users,
  PartyPopper,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EnvironmentSnapshot } from "@/lib/sim/prompts/types";

interface EnvironmentCardProps {
  environment: EnvironmentSnapshot;
}

const weatherConfig: Record<
  EnvironmentSnapshot["weather"],
  { icon: React.ElementType; label: string; color: string }
> = {
  sunny: { icon: Sun, label: "Sunny", color: "text-yellow-500" },
  cloudy: { icon: Cloud, label: "Cloudy", color: "text-gray-500" },
  rainy: { icon: CloudRain, label: "Rainy", color: "text-blue-500" },
  hot: { icon: Thermometer, label: "Hot", color: "text-orange-500" },
  cold: { icon: Snowflake, label: "Cold", color: "text-cyan-500" },
};

export function EnvironmentCard({ environment }: EnvironmentCardProps) {
  const weather = weatherConfig[environment.weather];
  const WeatherIcon = weather.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Environment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Weather */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div
              className={`h-10 w-10 rounded-full bg-muted flex items-center justify-center ${weather.color}`}
            >
              <WeatherIcon className="h-5 w-5" />
            </div>
            <span className="text-sm text-muted-foreground">Weather</span>
            <span className="font-medium">{weather.label}</span>
          </div>

          {/* Temperature */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-red-500">
              <Thermometer className="h-5 w-5" />
            </div>
            <span className="text-sm text-muted-foreground">Temperature</span>
            <span className="font-medium">{environment.temperature}°F</span>
          </div>

          {/* Base Demand */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-green-500">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-sm text-muted-foreground">Base Demand</span>
            <span className="font-medium">{environment.baseDemand}/hr</span>
          </div>

          {/* Special Event */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-purple-500">
              <PartyPopper className="h-5 w-5" />
            </div>
            <span className="text-sm text-muted-foreground">Special Event</span>
            {environment.specialEvent ? (
              <Badge variant="secondary" className="capitalize">
                {environment.specialEvent}
              </Badge>
            ) : (
              <span className="font-medium text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

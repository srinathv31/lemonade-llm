"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SimulationDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Simulation detail error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load simulation</AlertTitle>
        <AlertDescription>
          {error.message || "An unexpected error occurred while loading the simulation."}
        </AlertDescription>
      </Alert>

      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link href="/simulations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Simulations
          </Link>
        </Button>
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  );
}

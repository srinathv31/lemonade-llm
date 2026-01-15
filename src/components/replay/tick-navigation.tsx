"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatHour } from "@/lib/utils";
import type { TickSummaryEntry } from "@/lib/sim/replay/types";

interface TickNavigationProps {
  simulationId: string;
  dayId: string;
  currentHour: number;
  ticks: TickSummaryEntry[];
}

export function TickNavigation({
  simulationId,
  dayId,
  currentHour,
  ticks,
}: TickNavigationProps) {
  const router = useRouter();

  // Find adjacent ticks
  const sortedTicks = [...ticks].sort((a, b) => a.hour - b.hour);
  const currentIndex = sortedTicks.findIndex((t) => t.hour === currentHour);
  const prevTick = currentIndex > 0 ? sortedTicks[currentIndex - 1] : null;
  const nextTick =
    currentIndex < sortedTicks.length - 1 ? sortedTicks[currentIndex + 1] : null;

  // Build URLs
  const baseUrl = `/simulations/${simulationId}/days/${dayId}/ticks`;
  const prevUrl = prevTick ? `${baseUrl}/${prevTick.tickId}` : null;
  const nextUrl = nextTick ? `${baseUrl}/${nextTick.tickId}` : null;

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft" && prevUrl) {
        e.preventDefault();
        router.push(prevUrl);
      } else if (e.key === "ArrowRight" && nextUrl) {
        e.preventDefault();
        router.push(nextUrl);
      }
    },
    [router, prevUrl, nextUrl]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex items-center justify-between py-2">
      {prevUrl ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={prevUrl}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {formatHour(prevTick!.hour)}
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
      )}

      <span className="text-xs text-muted-foreground">
        Use arrow keys to navigate
      </span>

      {nextUrl ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={nextUrl}>
            {formatHour(nextTick!.hour)}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  );
}

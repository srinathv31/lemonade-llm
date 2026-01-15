"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

// Map route segments to display labels
const segmentLabels: Record<string, string> = {
  simulations: "Simulations",
  settings: "Settings",
  days: "Days",
  ticks: "Ticks",
};

/**
 * Format a segment for display.
 * Known segments get pretty labels, UUIDs are truncated.
 */
function formatSegment(segment: string): string {
  // Check if it's a known label
  if (segmentLabels[segment]) {
    return segmentLabels[segment];
  }

  // Check if it looks like a UUID (8-4-4-4-12 or similar)
  if (/^[0-9a-f-]{36}$/i.test(segment)) {
    return segment.slice(0, 8) + "...";
  }

  // Check if it's a number (day or tick number)
  if (/^\d+$/.test(segment)) {
    return segment;
  }

  // Default: capitalize first letter
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Don't show breadcrumb on root
  if (segments.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm text-muted-foreground"
    >
      <Link
        href="/"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>

      {segments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        const label = formatSegment(segment);

        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                href={href}
                className={cn(
                  "hover:text-foreground transition-colors",
                  "max-w-[100px] truncate sm:max-w-none"
                )}
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

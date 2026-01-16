import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as USD currency.
 */
export function formatCurrency(
  value: number,
  minimumFractionDigits = 2
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
  }).format(value);
}

/**
 * Format an internal hour (0-7) to display time (9 AM - 4 PM).
 */
export function formatHour(hour: number): string {
  const displayHour = hour + 9; // Convert 0-7 to 9-16
  if (displayHour === 12) return "12 PM";
  if (displayHour < 12) return `${displayHour} AM`;
  return `${displayHour - 12} PM`;
}

/**
 * Format an hour with full time range (e.g., "9:00 AM - 10:00 AM").
 */
export function formatHourRange(hour: number): string {
  const startHour = hour + 9;
  const endHour = hour + 10;

  const formatTime = (h: number) => {
    if (h === 12) return "12:00 PM";
    if (h < 12) return `${h}:00 AM`;
    return `${h - 12}:00 PM`;
  };

  return `${formatTime(startHour)} - ${formatTime(endHour)}`;
}

/**
 * Calculate and format duration from ISO strings.
 */
export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null
): string | null {
  if (!startedAt || !finishedAt) return null;
  const durationMs =
    new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return formatMs(durationMs);
}

/**
 * Format milliseconds to human readable duration.
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a decimal value as a percentage.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format an ISO date string to a readable date.
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

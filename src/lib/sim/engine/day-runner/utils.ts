import type { DayRunnerLogEntry } from "../types";

/**
 * Hours in a simulation day (9am to 5pm inclusive).
 * Each tick represents one hour of operation.
 */
export const DAY_HOURS = [9, 10, 11, 12, 13, 14, 15, 16] as const;

/**
 * Total ticks per day.
 */
export const TICKS_PER_DAY = 8;

/**
 * Round a number to a specified number of decimal places.
 */
export function roundToDecimals(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Log a day runner operation in structured JSON format.
 * Only logs in development environment per CLAUDE.md guidelines.
 */
export function logDayOperation(entry: DayRunnerLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

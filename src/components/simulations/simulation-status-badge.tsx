import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  completed:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  partial:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

interface SimulationStatusBadgeProps {
  status: string;
  className?: string;
}

export function SimulationStatusBadge({
  status,
  className,
}: SimulationStatusBadgeProps) {
  const colorClass = statusColors[status] ?? statusColors.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {status}
    </span>
  );
}

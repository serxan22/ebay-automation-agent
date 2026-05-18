import { cn } from "@/lib/utils/cn";

export function StatusBadge({
  status,
  tone = "neutral"
}: {
  status: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200",
        tone === "success" && "bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-300",
        tone === "warning" && "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        tone === "danger" && "bg-coral-50 text-coral-700 dark:bg-coral-500/15 dark:text-coral-300"
      )}
    >
      {status}
    </span>
  );
}

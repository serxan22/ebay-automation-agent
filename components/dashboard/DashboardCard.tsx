import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function DashboardCard({
  title,
  value,
  detail,
  icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500 dark:text-ink-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-ink-950 dark:text-white">{value}</p>
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            tone === "neutral" && "bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200",
            tone === "success" && "bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-300",
            tone === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
            tone === "danger" && "bg-coral-50 text-coral-700 dark:bg-coral-500/15 dark:text-coral-300"
          )}
        >
          {icon}
        </div>
      </div>
      {detail ? <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">{detail}</p> : null}
    </div>
  );
}

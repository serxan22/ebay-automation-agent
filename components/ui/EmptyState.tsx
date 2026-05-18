import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  title,
  description,
  action,
  className
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-ink-300 bg-white/70 p-8 text-center dark:border-white/15 dark:bg-white/[0.03]",
        className
      )}
    >
      <h3 className="text-base font-semibold text-ink-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-ink-500 dark:text-ink-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

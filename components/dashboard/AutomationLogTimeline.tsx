import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { AutomationLogLevel } from "@/lib/types";

export function AutomationLogTimeline({
  logs
}: {
  logs: Array<{ level: AutomationLogLevel; module: string; message: string; time: string }>;
}) {
  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div
          key={`${log.time}-${log.message}`}
          className="grid grid-cols-[64px_1fr] gap-4 rounded-lg border border-ink-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]"
        >
          <span className="text-sm text-ink-500 dark:text-ink-400">{log.time}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={log.level}
                tone={log.level === "success" ? "success" : log.level === "error" ? "danger" : log.level === "warning" ? "warning" : "neutral"}
              />
              <span className="text-sm font-medium text-ink-900 dark:text-white">{log.module}</span>
            </div>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{log.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

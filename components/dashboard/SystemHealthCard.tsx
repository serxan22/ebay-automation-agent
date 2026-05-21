import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { SystemHealthSummary, HealthSeverity } from "@/lib/system/health-check";

export function SystemHealthCard({ health }: { health: SystemHealthSummary }) {
  const Icon = health.status === "ready" ? CheckCircle2 : health.status === "attention" ? CircleAlert : AlertTriangle;

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200">
            <Icon size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-ink-950 dark:text-white">System health</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{health.suggestedNextAction}</p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{health.publishReadiness}</p>
          </div>
        </div>
        <StatusBadge status={getStatusLabel(health.status)} tone={getStatusTone(health.status)} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Products" value={String(health.counts.supplierProducts)} />
        <Metric label="Analyzed" value={String(health.counts.analyzedProducts)} />
        <Metric label="Approved" value={String(health.counts.approvedProducts)} />
        <Metric label="Drafts" value={String(health.counts.listingDrafts)} />
        <Metric label="Approved drafts" value={String(health.counts.approvedDrafts)} />
        <Metric label="Publish-ready" value={String(health.counts.publishReadyDrafts)} />
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {health.checks.map((check) => (
          <div key={check.key} className="rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{check.label}</p>
              <StatusBadge status={getStatusLabel(check.status)} tone={getStatusTone(check.status)} />
            </div>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{check.message}</p>
            {check.nextAction ? (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{check.nextAction}</p>
            ) : null}
          </div>
        ))}
      </div>

      {health.lastBlockingIssue || health.lastAutomationError || health.lastEbayError ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {health.lastBlockingIssue ? <p>Last blocking issue: {health.lastBlockingIssue}</p> : null}
          {health.lastAutomationError ? <p>Last automation error: {health.lastAutomationError}</p> : null}
          {health.lastEbayError ? <p>Last integration warning: {health.lastEbayError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
      <p className="text-xs font-medium uppercase text-ink-400 dark:text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950 dark:text-white">{value}</p>
    </div>
  );
}

function getStatusLabel(status: HealthSeverity) {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "attention") {
    return "Needs attention";
  }

  return "Missing requirement";
}

function getStatusTone(status: HealthSeverity) {
  if (status === "ready") {
    return "success" as const;
  }

  return "warning" as const;
}

import { AlertTriangle, Bot, CircleDollarSign, ClipboardList, ListChecks, Store, Zap } from "lucide-react";
import { AutomationLogTimeline } from "@/components/dashboard/AutomationLogTimeline";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SystemHealthCard } from "@/components/dashboard/SystemHealthCard";
import { demoAnalyses, demoLogs, demoProducts, demoSuppliers } from "@/lib/demo-data";
import { getSystemHealth } from "@/lib/system/health-check";
import { requireUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const health = await getSystemHealth({ supabase, user });
  const activeSuppliers = demoSuppliers.filter((supplier) => supplier.status === "active").length;
  const approved = demoAnalyses.filter((analysis) => analysis.approvedForListing);
  const rejected = demoAnalyses.length - approved.length;
  const estimatedProfit = approved.reduce((sum, analysis) => sum + analysis.estimatedProfit, 0);

  return (
    <div className="space-y-6">
      <SystemHealthCard health={health} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Listed today" value="0 / 5" detail="Manual approval mode is active." icon={<ListChecks size={18} />} tone="warning" />
        <DashboardCard title="Active listings" value="0" detail="eBay sandbox publish starts in Phase 2." icon={<ClipboardList size={18} />} />
        <DashboardCard title="Estimated profit" value={formatCurrency(estimatedProfit)} detail={`${approved.length} products passed checks.`} icon={<CircleDollarSign size={18} />} tone="success" />
        <DashboardCard title="Risk alerts" value={String(rejected)} detail="Rejected before draft creation." icon={<AlertTriangle size={18} />} tone={rejected ? "warning" : "success"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-950 dark:text-white">Latest automation logs</h2>
            <StatusBadge status="No silent failures" tone="success" />
          </div>
          <AutomationLogTimeline logs={demoLogs} />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink-950 dark:text-white">Supplier health</h2>
              <StatusBadge status={`${activeSuppliers}/${demoSuppliers.length} active`} tone="success" />
            </div>
            <div className="mt-5 space-y-4">
              {demoSuppliers.map((supplier) => (
                <div key={supplier.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800 dark:text-ink-100">{supplier.name}</span>
                    <span className="text-ink-500 dark:text-ink-400">{supplier.defaultShippingDays} days</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-ink-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-mint-500"
                      style={{ width: supplier.status === "active" ? "88%" : supplier.status === "needs_attention" ? "58%" : "18%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="font-semibold text-ink-950 dark:text-white">Connection status</h2>
            <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
                <span className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <Zap size={16} /> eBay sandbox
                </span>
                <StatusBadge status="Not connected" tone="warning" />
              </div>
              <div className="flex items-center justify-between rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
                <span className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <Bot size={16} /> Telegram
                </span>
                <StatusBadge status="Skeleton ready" tone="neutral" />
              </div>
              <div className="flex items-center justify-between rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
                <span className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <Store size={16} /> Supplier products
                </span>
                <StatusBadge status={`${demoProducts.length} loaded`} tone="success" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

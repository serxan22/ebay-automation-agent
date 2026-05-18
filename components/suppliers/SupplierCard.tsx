import { DatabaseZap, FileSpreadsheet, PlugZap } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { Supplier } from "@/lib/types";

export function SupplierCard({ supplier }: { supplier: Supplier }) {
  const Icon = supplier.type === "csv" ? FileSpreadsheet : supplier.type === "custom" ? PlugZap : DatabaseZap;
  const tone = supplier.status === "active" ? "success" : supplier.status === "needs_attention" ? "warning" : "danger";

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200">
            <Icon size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-ink-950 dark:text-white">{supplier.name}</h3>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {supplier.type.toUpperCase()} - {supplier.country ?? "Global"} - {supplier.defaultShippingDays} day default
            </p>
          </div>
        </div>
        <StatusBadge status={supplier.status.replace("_", " ")} tone={tone} />
      </div>
      <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">{supplier.notes}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge
          status={supplier.allowsDropshipping ? "Resale approved" : "Permission missing"}
          tone={supplier.allowsDropshipping ? "success" : "danger"}
        />
        <StatusBadge status="Sync ready" tone="neutral" />
      </div>
    </div>
  );
}

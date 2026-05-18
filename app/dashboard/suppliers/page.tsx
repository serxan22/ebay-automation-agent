import { SupplierCard } from "@/components/suppliers/SupplierCard";
import { SupplierCsvImporter } from "@/components/suppliers/SupplierCsvImporter";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { demoSuppliers } from "@/lib/demo-data";

const connectors = ["Doba", "Wholesale2B", "Inventory Source", "Syncee", "Custom API"];

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Suppliers</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Approved wholesale sources, CSV feeds, and future API connectors.
          </p>
        </div>
        <StatusBadge status="Marketplace-to-marketplace blocked" tone="success" />
      </div>

      <SupplierCsvImporter />

      <section className="grid gap-4 xl:grid-cols-3">
        {demoSuppliers.map((supplier) => (
          <SupplierCard key={supplier.id} supplier={supplier} />
        ))}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-semibold text-ink-950 dark:text-white">Connector queue</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {connectors.map((connector) => (
            <div key={connector} className="rounded-md border border-ink-200 bg-ink-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-medium text-ink-900 dark:text-white">{connector}</p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Credential-ready placeholder</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

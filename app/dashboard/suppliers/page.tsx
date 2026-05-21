import { SupplierCard } from "@/components/suppliers/SupplierCard";
import { SupplierCsvImporter } from "@/components/suppliers/SupplierCsvImporter";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { demoSuppliers } from "@/lib/demo-data";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { Supplier } from "@/lib/types";

const connectors = ["Doba", "Wholesale2B", "Inventory Source", "Syncee", "Custom API"];

export default async function SuppliersPage() {
  const { suppliers, statsBySupplier } = await loadSuppliersDashboardData();

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
        {suppliers.map((supplier) => (
          <SupplierCard
            key={supplier.id}
            supplier={supplier}
            productCount={statsBySupplier.get(supplier.id)?.count ?? 0}
            latestImportedAt={statsBySupplier.get(supplier.id)?.latestImportedAt ?? null}
          />
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

async function loadSuppliersDashboardData() {
  if (!hasSupabaseServerEnv()) {
    return { suppliers: demoSuppliers, statsBySupplier: new Map<string, SupplierStats>() };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { suppliers: demoSuppliers, statsBySupplier: new Map<string, SupplierStats>() };
  }

  const [suppliersResponse, productsResponse] = await Promise.all([
    supabase.from("suppliers").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("supplier_products").select("supplier_id,created_at").eq("user_id", user.id).limit(2000)
  ]);

  if (suppliersResponse.error || productsResponse.error) {
    return { suppliers: demoSuppliers, statsBySupplier: new Map<string, SupplierStats>() };
  }

  const suppliers = ((suppliersResponse.data ?? []) as Array<Record<string, any>>).map(mapSupplier);
  const statsBySupplier = new Map<string, SupplierStats>();

  for (const row of (productsResponse.data ?? []) as Array<Record<string, any>>) {
    const supplierId = row.supplier_id as string;
    const current = statsBySupplier.get(supplierId) ?? { count: 0, latestImportedAt: null };
    const createdAt = row.created_at as string | null;

    statsBySupplier.set(supplierId, {
      count: current.count + 1,
      latestImportedAt:
        createdAt && (!current.latestImportedAt || new Date(createdAt) > new Date(current.latestImportedAt))
          ? createdAt
          : current.latestImportedAt
    });
  }

  return {
    suppliers: suppliers.length ? suppliers : demoSuppliers,
    statsBySupplier
  };
}

interface SupplierStats {
  count: number;
  latestImportedAt: string | null;
}

function mapSupplier(row: Record<string, any>): Supplier {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    status: row.status,
    country: row.country,
    defaultShippingDays: Number(row.default_shipping_days ?? 5),
    allowsDropshipping: Boolean(row.allows_dropshipping),
    notes: row.notes
  };
}

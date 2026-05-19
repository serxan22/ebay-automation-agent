import { CheckCircle2, CircleDollarSign, Search, ShieldAlert, Sparkles, UploadCloud, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { RiskScore } from "@/components/dashboard/RiskScore";
import { ProfitScore } from "@/components/dashboard/ProfitScore";
import { ProductDrawer } from "@/components/products/ProductDrawer";
import { Button } from "@/components/ui/Button";
import type { ProductAnalysis, SupplierProduct } from "@/lib/types";

export function ProductTable({
  products,
  analyses
}: {
  products: SupplierProduct[];
  analyses: ProductAnalysis[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-ink-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04] md:grid-cols-6">
        {["Supplier", "Category", "Margin", "Risk score", "Stock", "Shipping days"].map((filter) => (
          <label key={filter} className="text-xs font-medium text-ink-500 dark:text-ink-400">
            {filter}
            <input
              className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              placeholder="Any"
            />
          </label>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-ink-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
        <table className="min-w-full divide-y divide-ink-200 dark:divide-white/10">
          <thead className="bg-ink-50 dark:bg-white/[0.03]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Product
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Profit
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Risk
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Latest analysis
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Supply
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-white/10">
            {products.map((product, index) => {
              const analysis = analyses[index];
              return (
                <tr key={product.supplierSku} className="align-top">
                  <td className="max-w-sm px-4 py-4">
                    <p className="font-medium text-ink-950 dark:text-white">{product.title}</p>
                    <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                      {product.category ?? "Uncategorized"} - SKU {product.supplierSku}
                    </p>
                    <div className="mt-3">
                      <ProductDrawer product={product} analysis={analysis} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <ProfitScore profit={analysis.estimatedProfit} margin={analysis.marginPercentage} />
                  </td>
                  <td className="px-4 py-4">
                    <RiskScore score={analysis.riskScore} />
                  </td>
                  <td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">
                    <p className="font-medium text-ink-950 dark:text-white">
                      Rec. ${analysis.recommendedEbayPrice.toFixed(2)}
                    </p>
                    <p>Final score {analysis.finalScore}</p>
                    <p>{analysis.approvedForListing ? "Approved" : "Rejected"}</p>
                    {analysis.rejectionReasons.length ? (
                      <p className="mt-2 max-w-xs text-xs text-coral-700 dark:text-coral-300">
                        {analysis.rejectionReasons.slice(0, 2).join(" ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">
                    <p>{product.stockQuantity} in stock</p>
                    <p>{product.shippingDays} day shipping</p>
                  </td>
                  <td className="px-4 py-4">
                    {analysis.approvedForListing ? (
                      <StatusBadge status="Ready for draft" tone="success" />
                    ) : (
                      <StatusBadge status="Needs review" tone="warning" />
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary">
                        <Sparkles size={16} /> Analyze
                      </Button>
                      <Button variant="secondary">
                        <UploadCloud size={16} /> Draft
                      </Button>
                      <Button variant="secondary">
                        <CheckCircle2 size={16} /> Approve
                      </Button>
                      <Button variant="ghost">
                        <XCircle size={16} /> Reject
                      </Button>
                      <Button variant="ghost">
                        <CircleDollarSign size={16} /> Publish
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Phase 1 keeps publishing disabled. Products can be analyzed and drafted, then held for manual approval before
          the Phase 2 eBay sandbox flow is connected.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
        <Search size={16} />
        Product research placeholders are ready for demand and competition APIs.
      </div>
    </div>
  );
}

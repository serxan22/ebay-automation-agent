import { RiskScore } from "@/components/dashboard/RiskScore";
import { ProfitScore } from "@/components/dashboard/ProfitScore";
import type { ProductAnalysis, SupplierProduct } from "@/lib/types";

export function ProductDrawer({
  product,
  analysis
}: {
  product: SupplierProduct;
  analysis: ProductAnalysis;
}) {
  return (
    <details className="rounded-lg border border-ink-200 bg-ink-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <summary className="cursor-pointer text-sm font-medium text-ink-900 dark:text-white">
        View product analysis
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <RiskScore score={analysis.riskScore} />
        <ProfitScore profit={analysis.estimatedProfit} margin={analysis.marginPercentage} />
        <div>
          <p className="text-sm font-semibold text-ink-950 dark:text-white">Final score {analysis.finalScore}</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">{product.supplierSku}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">{analysis.aiNotes}</p>
      {analysis.rejectionReasons.length ? (
        <ul className="mt-4 space-y-2 text-sm text-coral-700 dark:text-coral-300">
          {analysis.rejectionReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

import { formatCurrency, formatPercentage } from "@/lib/utils/format";

export function ProfitScore({ profit, margin }: { profit: number; margin: number }) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-950 dark:text-white">{formatCurrency(profit)}</p>
      <p className="text-xs text-ink-500 dark:text-ink-400">{formatPercentage(margin)} margin</p>
    </div>
  );
}

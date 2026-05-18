import { cn } from "@/lib/utils/cn";

export function RiskScore({ score }: { score: number }) {
  const tone = score >= 80 ? "safe" : score >= 60 ? "review" : "risk";

  return (
    <div className="min-w-36">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-500 dark:text-ink-400">Risk safety</span>
        <span className="font-semibold text-ink-900 dark:text-white">{score}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-ink-100 dark:bg-white/10">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "safe" && "bg-mint-500",
            tone === "review" && "bg-amber-500",
            tone === "risk" && "bg-coral-500"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

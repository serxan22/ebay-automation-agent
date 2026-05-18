import type { AgentTaskResult, ProductAnalysis } from "@/lib/types";

export interface DailyReportInput {
  scanned: number;
  analyses: ProductAnalysis[];
  draftsCreated: number;
  listed: number;
  failed: number;
  supplierIssues?: string[];
}

export function generateDailyReport(input: DailyReportInput): AgentTaskResult {
  const rejected = input.analyses.filter((analysis) => !analysis.approvedForListing);
  const approved = input.analyses.filter((analysis) => analysis.approvedForListing);
  const estimatedProfit = approved.reduce((sum, analysis) => sum + analysis.estimatedProfit, 0);
  const averageMargin =
    approved.length > 0
      ? approved.reduce((sum, analysis) => sum + analysis.marginPercentage, 0) / approved.length
      : 0;
  const rejectionReasons = rejected.flatMap((analysis) => analysis.rejectionReasons).slice(0, 6);

  return {
    ok: true,
    message: `${input.scanned} products scanned, ${rejected.length} rejected, ${input.draftsCreated} drafts created, ${input.listed} listed, ${input.failed} failed. Estimated profit: $${estimatedProfit.toFixed(2)}.`,
    metrics: {
      scanned: input.scanned,
      rejected: rejected.length,
      draftsCreated: input.draftsCreated,
      listed: input.listed,
      failed: input.failed,
      averageMargin: Number(averageMargin.toFixed(2)),
      estimatedProfit: Number(estimatedProfit.toFixed(2))
    },
    warnings: [...rejectionReasons, ...(input.supplierIssues ?? [])]
  };
}

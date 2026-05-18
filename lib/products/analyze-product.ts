import type { AutomationSettings, ProductAnalysis, Supplier, SupplierProduct } from "@/lib/types";
import { calculateRiskScore } from "@/lib/compliance/risk-score";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { clampScore } from "@/lib/utils/format";

export interface AnalyzeProductInput {
  product: SupplierProduct;
  settings: AutomationSettings;
  supplier?: Supplier | null;
}

export function analyzeProduct({ product, settings, supplier }: AnalyzeProductInput): ProductAnalysis {
  const price = calculatePrice({ product, settings });
  const risk = calculateRiskScore({ product, settings, supplier });
  const rejectionReasons = [...risk.reasons];

  if (price.marginPercentage < settings.minMarginPercentage) {
    rejectionReasons.push(
      `Margin ${price.marginPercentage.toFixed(1)}% is below minimum ${settings.minMarginPercentage}%.`
    );
  }

  if (price.estimatedProfit < settings.minProfitAmount) {
    rejectionReasons.push(
      `Estimated profit ${price.estimatedProfit.toFixed(2)} is below minimum ${settings.minProfitAmount.toFixed(2)}.`
    );
  }

  if (risk.score < settings.riskTolerance) {
    rejectionReasons.push(`Risk score ${risk.score} is below required threshold ${settings.riskTolerance}.`);
  }

  const imageScore = product.imageUrls.length > 0 ? Math.min(100, 60 + product.imageUrls.length * 12) : 0;
  const shippingScore = clampScore(100 - Math.max(product.shippingDays - 2, 0) * 12);
  const stockScore = clampScore((product.stockQuantity / Math.max(settings.minStockQuantity * 4, 1)) * 100);
  const profitScore = clampScore((price.marginPercentage / Math.max(settings.minMarginPercentage * 1.8, 1)) * 100);
  const demandScore = estimateDemandScore(product);
  const competitionScore = estimateCompetitionScore(product);
  const finalScore = clampScore(
    profitScore * 0.24 +
      risk.score * 0.28 +
      demandScore * 0.14 +
      competitionScore * 0.12 +
      imageScore * 0.1 +
      shippingScore * 0.12
  );

  if (imageScore < settings.requireImageQualityScore) {
    rejectionReasons.push(`Image quality score ${imageScore} is below required ${settings.requireImageQualityScore}.`);
  }

  const approvedForListing = rejectionReasons.length === 0 && finalScore >= settings.riskTolerance;

  return {
    profitScore,
    riskScore: risk.score,
    demandScore,
    competitionScore,
    imageScore,
    shippingScore,
    finalScore,
    estimatedEbayFees: price.estimatedEbayFees,
    estimatedTotalCost: price.totalCost,
    recommendedEbayPrice: price.recommendedEbayPrice,
    estimatedProfit: price.estimatedProfit,
    marginPercentage: price.marginPercentage,
    aiNotes: buildAiNotes(product, rejectionReasons, risk.flags),
    rejectionReasons,
    approvedForListing
  };
}

function estimateDemandScore(product: SupplierProduct) {
  const text = `${product.title} ${product.category ?? ""}`.toLowerCase();
  let score = 45;

  if (/(home|kitchen|storage|organizer|decor|pet|office|garden|tool)/.test(text)) {
    score += 20;
  }

  if (product.stockQuantity > 25) {
    score += 10;
  }

  if (product.supplierPrice >= 8 && product.supplierPrice <= 80) {
    score += 10;
  }

  return clampScore(score);
}

function estimateCompetitionScore(product: SupplierProduct) {
  const titleLength = product.title.length;
  const score = 72 - Math.max(titleLength - 90, 0) * 0.35 - Math.max(product.supplierPrice - 120, 0) * 0.12;
  return clampScore(score);
}

function buildAiNotes(product: SupplierProduct, rejectionReasons: string[], flags: string[]) {
  if (rejectionReasons.length === 0) {
    return `${product.title} passes the Phase 1 profitability and compliance checks. Keep manual approval enabled until eBay sandbox publishing is validated.`;
  }

  return `Hold listing for review. Key concerns: ${rejectionReasons.slice(0, 4).join(" ")}${
    flags.length ? ` Flags: ${flags.join(", ")}.` : ""
  }`;
}

import type { AutomationSettings, PriceCalculation, SupplierProduct } from "@/lib/types";

export interface PriceCalculationInput {
  product: SupplierProduct;
  settings: Pick<
    AutomationSettings,
    "minMarginPercentage" | "pricingBufferPercentage" | "promotedListingPercentage"
  >;
  estimatedFeeRate?: number;
}

export function calculatePrice({
  product,
  settings,
  estimatedFeeRate = 0.1325
}: PriceCalculationInput): PriceCalculation {
  const supplierCost = roundMoney(product.supplierPrice);
  const shippingCost = roundMoney(product.shippingCost);
  const totalCost = supplierCost + shippingCost;
  const targetMargin = Math.max(settings.minMarginPercentage, 1) / 100;
  const promotedRate = Math.max(settings.promotedListingPercentage, 0) / 100;
  const bufferRate = Math.max(settings.pricingBufferPercentage, 0) / 100;
  const variableRate = estimatedFeeRate + promotedRate + bufferRate + targetMargin;
  const denominator = Math.max(1 - variableRate, 0.1);
  const recommendedEbayPrice = roundMoney(Math.max(totalCost / denominator, totalCost + 1));
  const estimatedEbayFees = roundMoney(recommendedEbayPrice * estimatedFeeRate);
  const promotedCost = roundMoney(recommendedEbayPrice * promotedRate);
  const buffer = roundMoney(recommendedEbayPrice * bufferRate);
  const estimatedProfit = roundMoney(
    recommendedEbayPrice - totalCost - estimatedEbayFees - promotedCost - buffer
  );
  const marginPercentage = recommendedEbayPrice > 0 ? (estimatedProfit / recommendedEbayPrice) * 100 : 0;

  return {
    supplierCost,
    shippingCost,
    totalCost,
    estimatedEbayFees,
    promotedCost,
    buffer,
    recommendedEbayPrice,
    estimatedProfit,
    marginPercentage: roundPercent(marginPercentage),
    estimatedFeeRate
  };
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

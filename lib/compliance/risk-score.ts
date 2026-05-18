import type { AutomationSettings, Supplier, SupplierProduct } from "@/lib/types";
import { clampScore } from "@/lib/utils/format";

const restrictedCategoryKeywords = [
  "electronics",
  "supplement",
  "vitamin",
  "medical",
  "health",
  "cosmetic",
  "beauty",
  "children safety",
  "baby safety",
  "weapon",
  "tactical",
  "adult",
  "luxury",
  "designer",
  "fandom",
  "licensed",
  "trademark"
];

const riskyBrandHints = [
  "apple",
  "nike",
  "adidas",
  "louis vuitton",
  "gucci",
  "disney",
  "pokemon",
  "lego",
  "sony",
  "samsung",
  "dyson"
];

export interface RiskScoreInput {
  product: SupplierProduct;
  settings: AutomationSettings;
  supplier?: Supplier | null;
}

export interface RiskScoreResult {
  score: number;
  reasons: string[];
  flags: string[];
}

export function calculateRiskScore({ product, settings, supplier }: RiskScoreInput): RiskScoreResult {
  let score = 100;
  const reasons: string[] = [];
  const flags: string[] = [];
  const category = normalize(product.category);
  const brand = normalize(product.brand);
  const title = normalize(product.title);
  const description = normalize(product.description ?? "");
  const combined = `${title} ${description} ${category} ${brand}`;

  if (supplier && supplier.status !== "active") {
    score -= 35;
    reasons.push("Supplier is not active.");
    flags.push("supplier_inactive");
  }

  if (supplier && !supplier.allowsDropshipping) {
    score -= 45;
    reasons.push("Supplier is not marked as approved for dropshipping/reselling.");
    flags.push("supplier_not_approved");
  }

  for (const blockedCategory of settings.blockedCategories) {
    if (category.includes(normalize(blockedCategory))) {
      score -= 45;
      reasons.push(`Blocked category matched: ${blockedCategory}.`);
      flags.push("blocked_category");
      break;
    }
  }

  for (const allowedCategory of settings.allowedCategories) {
    if (settings.allowedCategories.length > 0 && !category.includes(normalize(allowedCategory))) {
      score -= 12;
      reasons.push("Category is outside the allowed category list.");
      flags.push("category_not_allowed");
      break;
    }
  }

  for (const blockedBrand of settings.blockedBrands) {
    if (brand.includes(normalize(blockedBrand)) || title.includes(normalize(blockedBrand))) {
      score -= 45;
      reasons.push(`Blocked brand matched: ${blockedBrand}.`);
      flags.push("blocked_brand");
      break;
    }
  }

  if (brand && riskyBrandHints.some((hint) => brand.includes(hint) || title.includes(hint))) {
    score -= 25;
    reasons.push("Brand has potential IP/VERO risk and needs manual review.");
    flags.push("brand_ip_review");
  }

  if (restrictedCategoryKeywords.some((keyword) => combined.includes(keyword))) {
    score -= settings.newAccountSafeMode ? 35 : 20;
    reasons.push("Product appears to be in a restricted or high-risk category.");
    flags.push("restricted_category_risk");
  }

  if (product.shippingDays > settings.maxShippingDays) {
    score -= 20;
    reasons.push(`Shipping time is ${product.shippingDays} days, above the ${settings.maxShippingDays}-day rule.`);
    flags.push("shipping_too_slow");
  }

  if (product.stockQuantity < settings.minStockQuantity) {
    score -= 20;
    reasons.push(`Stock is below minimum quantity ${settings.minStockQuantity}.`);
    flags.push("low_stock");
  }

  if (product.imageUrls.length === 0) {
    score -= 25;
    reasons.push("No usable supplier images were provided.");
    flags.push("missing_images");
  }

  if (!product.description || product.description.trim().length < 30) {
    score -= 10;
    reasons.push("Description is too thin for confident listing generation.");
    flags.push("thin_description");
  }

  if (!product.supplierSku || !product.title || product.supplierPrice <= 0) {
    score -= 40;
    reasons.push("Required SKU, title, or supplier price is missing.");
    flags.push("missing_required_data");
  }

  return {
    score: clampScore(score),
    reasons,
    flags
  };
}

export function getRiskToleranceLabel(score: number) {
  if (score >= 80) {
    return "Conservative";
  }

  if (score >= 60) {
    return "Balanced";
  }

  return "Aggressive";
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

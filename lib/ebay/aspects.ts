import { ebayTaxonomyFetch } from "@/lib/ebay/taxonomy";

export interface EbayAspect {
  localizedAspectName: string;
  aspectConstraint?: {
    aspectRequired?: boolean;
    aspectMode?: "FREE_TEXT" | "SELECTION_ONLY" | string;
    aspectDataType?: string;
    itemToAspectCardinality?: "SINGLE" | "MULTI" | string;
    aspectUsage?: string;
  };
  aspectValues?: Array<{ localizedValue?: string }>;
}

export interface CategoryAspectsResponse {
  aspects?: EbayAspect[];
}

export interface GeneratedItemSpecifics {
  itemSpecifics: Record<string, string | string[]>;
  requiredAspects: string[];
  missingRequiredAspects: string[];
  warnings: string[];
}

export async function getItemAspectsForCategory({
  accessToken,
  categoryTreeId,
  categoryId,
  timeoutMs = 15_000
}: {
  accessToken: string;
  categoryTreeId: string;
  categoryId: string;
  timeoutMs?: number;
}) {
  return ebayTaxonomyFetch<CategoryAspectsResponse>({
    accessToken,
    path: `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTreeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
    timeoutMs
  });
}

export function generateItemSpecificsFromAspects({
  aspects,
  existingSpecifics,
  productTitle,
  productDescription,
  supplierBrand,
  supplierCategory,
  categoryName,
  categoryPath
}: {
  aspects: EbayAspect[];
  existingSpecifics?: Record<string, unknown> | null;
  productTitle?: string | null;
  productDescription?: string | null;
  supplierBrand?: string | null;
  supplierCategory?: string | null;
  categoryName?: string | null;
  categoryPath?: string | null;
}): GeneratedItemSpecifics {
  const normalizedExisting = normalizeExistingSpecifics(existingSpecifics);
  const itemSpecifics: Record<string, string | string[]> = { ...normalizedExisting };
  const requiredAspects = aspects
    .filter((aspect) => isRequiredAspect(aspect))
    .map((aspect) => aspect.localizedAspectName)
    .filter(Boolean);
  const missingRequiredAspects: string[] = [];
  const warnings: string[] = [];
  const text = `${productTitle ?? ""} ${productDescription ?? ""} ${supplierCategory ?? ""} ${categoryName ?? ""} ${categoryPath ?? ""}`;

  for (const aspect of aspects) {
    const name = aspect.localizedAspectName?.trim();

    if (!name || itemSpecifics[name]) {
      continue;
    }

    const inferred = inferAspectValue({
      aspect,
      text,
      supplierBrand,
      supplierCategory,
      categoryName
    });

    if (inferred) {
      itemSpecifics[name] = inferred;
    }
  }

  for (const required of requiredAspects) {
    if (!hasUsableSpecific(itemSpecifics[required])) {
      missingRequiredAspects.push(required);
    }
  }

  if (missingRequiredAspects.length > 0) {
    warnings.push(`Missing required item specifics: ${missingRequiredAspects.join(", ")}.`);
  }

  if (!itemSpecifics.Brand && supplierBrand?.trim() && isSafeBrandValue(supplierBrand)) {
    itemSpecifics.Brand = supplierBrand.trim();
  }

  if (!itemSpecifics.Type && (supplierCategory?.trim() || categoryName?.trim())) {
    itemSpecifics.Type = (supplierCategory || categoryName || "").trim();
  }

  return {
    itemSpecifics,
    requiredAspects,
    missingRequiredAspects,
    warnings
  };
}

function inferAspectValue({
  aspect,
  text,
  supplierBrand,
  supplierCategory,
  categoryName
}: {
  aspect: EbayAspect;
  text: string;
  supplierBrand?: string | null;
  supplierCategory?: string | null;
  categoryName?: string | null;
}) {
  const aspectName = aspect.localizedAspectName.toLowerCase();
  const values = (aspect.aspectValues ?? [])
    .map((value) => value.localizedValue?.trim())
    .filter((value): value is string => Boolean(value));

  if (aspectName === "brand") {
    if (supplierBrand?.trim() && isSafeBrandValue(supplierBrand)) {
      return supplierBrand.trim();
    }

    return pickAllowedValue(values, ["Unbranded", "Generic", "Does Not Apply", "Not Applicable"]);
  }

  if (aspectName === "type") {
    return supplierCategory?.trim() || categoryName?.trim() || pickAllowedValue(values, []);
  }

  if (/color|colour/.test(aspectName)) {
    return extractKnownValue(text, values, ["Black", "White", "Blue", "Red", "Green", "Gray", "Grey", "Silver", "Gold", "Clear"]);
  }

  if (/material/.test(aspectName)) {
    return extractKnownValue(text, values, ["Plastic", "Metal", "Steel", "Aluminum", "Wood", "Cotton", "Silicone", "Glass"]);
  }

  if (/size/.test(aspectName)) {
    return extractSize(text, values);
  }

  if (/model|mpn|manufacturer part number|upc|ean|isbn/.test(aspectName)) {
    return pickAllowedValue(values, ["Does Not Apply", "Not Applicable", "Unbranded"]);
  }

  if (/country.*manufacture|country.*origin/.test(aspectName)) {
    return pickAllowedValue(values, ["China", "United States", "Unknown", "Does Not Apply"]);
  }

  if (isRequiredAspect(aspect) && values.length > 0) {
    const notApplicable = pickAllowedValue(values, ["Does Not Apply", "Not Applicable", "Unknown"]);

    if (notApplicable) {
      return notApplicable;
    }
  }

  return "";
}

function isRequiredAspect(aspect: EbayAspect) {
  return aspect.aspectConstraint?.aspectRequired === true || aspect.aspectConstraint?.aspectUsage === "REQUIRED";
}

function normalizeExistingSpecifics(value?: Record<string, unknown> | null) {
  const normalized: Record<string, string | string[]> = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim()) {
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim()) {
      normalized[key.trim()] = rawValue.trim();
    } else if (Array.isArray(rawValue)) {
      const items = rawValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

      if (items.length > 0) {
        normalized[key.trim()] = items.map((item) => item.trim());
      }
    }
  }

  return normalized;
}

function hasUsableSpecific(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return typeof value === "string" && value.trim().length > 0;
}

function pickAllowedValue(values: string[], preferred: string[]) {
  for (const preferredValue of preferred) {
    const exact = values.find((value) => value.toLowerCase() === preferredValue.toLowerCase());

    if (exact) {
      return exact;
    }
  }

  return "";
}

function extractKnownValue(text: string, values: string[], fallbacks: string[]) {
  const normalizedText = text.toLowerCase();

  for (const value of values) {
    if (value.length >= 3 && normalizedText.includes(value.toLowerCase())) {
      return value;
    }
  }

  for (const fallback of fallbacks) {
    if (normalizedText.includes(fallback.toLowerCase())) {
      return fallback;
    }
  }

  return "";
}

function extractSize(text: string, values: string[]) {
  const normalizedText = text.toLowerCase();
  const exact = values.find((value) => value.length >= 1 && normalizedText.includes(value.toLowerCase()));

  if (exact) {
    return exact;
  }

  const match = text.match(/\b(xs|s|m|l|xl|xxl|\d+(?:\.\d+)?\s?(?:in|inch|cm|mm|oz|lb|pack))\b/i);
  return match?.[0] ?? "";
}

function isSafeBrandValue(value: string) {
  const brand = value.trim();

  if (!brand || /unknown|n\/a|not specified|generic/i.test(brand)) {
    return false;
  }

  return brand.length <= 60;
}

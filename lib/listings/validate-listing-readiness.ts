import type { EbayAccountRecord } from "@/lib/ebay/account";
import { validateImageUrl } from "@/lib/images/validate-image";

export interface ListingReadinessDraft {
  id?: string | null;
  status?: string | null;
  ebay_title?: string | null;
  ebay_description?: string | null;
  ebay_category_id?: string | null;
  ebay_category_name?: string | null;
  ebay_category_path?: string | null;
  category_tree_id?: string | null;
  item_specifics?: unknown;
  required_item_specifics?: string[] | null;
  missing_item_specifics?: string[] | null;
  condition?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  supplier_sku?: string | null;
  optimized_image_urls?: string[] | null;
  image_validation_status?: string | null;
  image_validation_warnings?: string[] | null;
}

export interface ListingReadinessResult {
  ready: boolean;
  score: number;
  missing: string[];
  warnings: string[];
  canPublishSandbox: boolean;
  canPublishProduction: false;
}

export async function validateListingReadiness({
  draft,
  account,
  checkImageAccessibility = false
}: {
  draft: ListingReadinessDraft;
  account?: EbayAccountRecord | null;
  checkImageAccessibility?: boolean;
}): Promise<ListingReadinessResult> {
  const missing: string[] = [];
  const warnings: string[] = [];
  const price = Number(draft.price ?? 0);
  const quantity = Number(draft.quantity ?? 0);
  const imageUrls = Array.isArray(draft.optimized_image_urls) ? draft.optimized_image_urls.filter(Boolean) : [];
  const sandboxPolicyFallbackAllowed =
    process.env.EBAY_ENVIRONMENT !== "production" && process.env.ALLOW_SANDBOX_POLICY_FALLBACK === "true";
  const skuSource = draft.supplier_sku?.trim() || draft.id?.trim() || "";
  const normalizedSku = skuSource.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);

  if (draft.status !== "approved") {
    missing.push("Approve this draft before publishing.");
  }

  if (!draft.ebay_title?.trim()) {
    missing.push("eBay title");
  } else if (draft.ebay_title.length > 80) {
    missing.push("eBay title must be 80 characters or less");
  }

  if (!draft.ebay_description?.trim()) {
    missing.push("eBay description");
  }

  if (!Number.isFinite(price) || price <= 0) {
    missing.push("price greater than 0");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    missing.push("quantity greater than 0");
  }

  if (!normalizedSku || normalizedSku.length < 3) {
    missing.push("SKU");
  } else if (!draft.supplier_sku?.trim()) {
    warnings.push("Supplier SKU is missing; the draft ID will be used as the sandbox SKU.");
  }

  if (!draft.ebay_category_id?.trim()) {
    missing.push("eBay category ID");
  }

  if (draft.ebay_category_id?.trim() && !draft.category_tree_id?.trim()) {
    warnings.push("Category tree ID is missing; item specifics generation will fetch the default EBAY_US tree.");
  }

  if (!isValidSandboxCondition(draft.condition)) {
    missing.push("valid eBay condition");
  }

  const itemSpecifics = isPlainRecord(draft.item_specifics) ? draft.item_specifics : {};
  if (Object.keys(itemSpecifics).length === 0) {
    missing.push("item specifics JSON");
  }

  const missingRequiredAspects = Array.isArray(draft.missing_item_specifics)
    ? draft.missing_item_specifics.filter((item) => item.trim().length > 0)
    : [];

  for (const aspect of missingRequiredAspects) {
    missing.push(`required item specific: ${aspect}`);
  }

  const requiredAspects = Array.isArray(draft.required_item_specifics)
    ? draft.required_item_specifics.filter((item) => item.trim().length > 0)
    : [];
  for (const aspect of requiredAspects) {
    if (!hasSpecificValue(itemSpecifics[aspect])) {
      missing.push(`required item specific: ${aspect}`);
    }
  }

  if (draft.ebay_category_id?.trim() && requiredAspects.length === 0 && missingRequiredAspects.length === 0) {
    warnings.push("Required item specifics have not been checked for this category yet.");
  }

  if (imageUrls.length === 0) {
    missing.push("at least one image URL");
  } else {
    const invalidUrls = imageUrls.filter((url) => !isValidHttpUrl(url));

    for (const url of invalidUrls) {
      missing.push(`valid image URL: ${url}`);
    }

    const nonHttpsUrls = imageUrls.filter((url) => isValidHttpUrl(url) && new URL(url).protocol !== "https:");
    if (nonHttpsUrls.length > 0) {
      warnings.push("Use HTTPS image URLs before production publishing.");
    }

    if (checkImageAccessibility) {
      const validationResults = await Promise.all(imageUrls.map((url) => validateImageUrl(url)));
      for (const result of validationResults) {
        if (!result.ok) {
          missing.push(`accessible image URL: ${result.reason ?? result.url}`);
        }
      }
    }
  }

  if (draft.image_validation_status === "missing") {
    missing.push("at least one image URL");
  } else if (draft.image_validation_status === "invalid") {
    missing.push("valid image");
  } else if (draft.image_validation_status === "external") {
    warnings.push("External image URLs are being used; optimize to Supabase Storage when configured.");
  } else if (!draft.image_validation_status) {
    warnings.push("Images have not been validated yet.");
  }

  if (Array.isArray(draft.image_validation_warnings)) {
    warnings.push(...draft.image_validation_warnings.filter(Boolean).slice(0, 3));
  }

  if (!account || account.status !== "connected") {
    missing.push("connected eBay sandbox account");
  } else {
    if (!account.refresh_token_encrypted) {
      missing.push("stored eBay refresh token");
    }

    if (!account.payment_policy_id) {
      missing.push("payment policy");
    }

    if (!account.return_policy_id) {
      missing.push("return policy");
    }

    if (!account.fulfillment_policy_id) {
      missing.push("fulfillment policy");
      if (sandboxPolicyFallbackAllowed) {
        warnings.push(
          "Sandbox fallback is enabled for diagnostics, but real offer publish is blocked until a real fulfillment policy exists."
        );
      }
    }

    if (!account.fulfillment_policy_id && sandboxPolicyFallbackAllowed) {
      warnings.push(
        "Drafts, image checks, and readiness diagnostics can continue. createOffer and publishOffer stay blocked."
      );
    }

    if (!account.inventory_location_key) {
      missing.push("inventory location");
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push("Supabase Storage uploads are unavailable without SUPABASE_SERVICE_ROLE_KEY; original image URLs will be used.");
  }

  warnings.push("Production publishing is locked; sandbox publishing only.");

  const uniqueMissing = Array.from(new Set(missing));
  const uniqueWarnings = Array.from(new Set(warnings));
  const score = Math.max(0, Math.min(100, 100 - uniqueMissing.length * 12 - uniqueWarnings.length * 4));
  const canPublishSandbox = uniqueMissing.length === 0;

  return {
    ready: canPublishSandbox,
    score,
    missing: uniqueMissing,
    warnings: uniqueWarnings,
    canPublishSandbox,
    canPublishProduction: false
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasSpecificValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.trim().length > 0);
  }

  return typeof value === "string" && value.trim().length > 0;
}

function isValidSandboxCondition(value?: string | null) {
  if (!value) {
    return false;
  }

  const allowed = new Set([
    "NEW",
    "LIKE_NEW",
    "NEW_OTHER",
    "USED",
    "USED_EXCELLENT",
    "USED_VERY_GOOD",
    "USED_GOOD",
    "USED_ACCEPTABLE",
    "FOR_PARTS_OR_NOT_WORKING",
    "CERTIFIED_REFURBISHED",
    "EXCELLENT_REFURBISHED",
    "VERY_GOOD_REFURBISHED",
    "GOOD_REFURBISHED",
    "SELLER_REFURBISHED"
  ]);

  return allowed.has(value.trim().toUpperCase());
}

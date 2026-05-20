import type { EbayAccountRecord } from "@/lib/ebay/account";
import { validateImageUrl } from "@/lib/images/validate-image";

export interface ListingReadinessDraft {
  id?: string | null;
  status?: string | null;
  ebay_title?: string | null;
  ebay_description?: string | null;
  ebay_category_id?: string | null;
  item_specifics?: unknown;
  condition?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  supplier_sku?: string | null;
  optimized_image_urls?: string[] | null;
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
  const fallbackCategoryId = process.env.EBAY_SANDBOX_FALLBACK_CATEGORY_ID?.trim();
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

  if (!draft.ebay_category_id?.trim() && !fallbackCategoryId) {
    missing.push("eBay category ID");
  }

  if (!isValidSandboxCondition(draft.condition)) {
    missing.push("valid eBay condition");
  }

  if (!isPlainRecord(draft.item_specifics) || Object.keys(draft.item_specifics).length === 0) {
    missing.push("item specifics JSON");
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

    if (!account.fulfillment_policy_id && !sandboxPolicyFallbackAllowed) {
      missing.push("fulfillment policy");
    } else if (!account.fulfillment_policy_id && sandboxPolicyFallbackAllowed) {
      warnings.push("Sandbox policy fallback is enabled. Production remains blocked.");
    }

    if (!account.inventory_location_key) {
      missing.push("inventory location");
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push("Supabase Storage uploads are unavailable without SUPABASE_SERVICE_ROLE_KEY; original image URLs will be used.");
  }

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

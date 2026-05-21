import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayAccount, getValidEbayAccessToken, hasRequiredSellerSetup, type EbayAccountRecord } from "@/lib/ebay/account";
import { getEbayConfig } from "@/lib/ebay/client";
import { createOrReplaceInventoryItem } from "@/lib/ebay/inventory";
import { createOffer, publishOffer } from "@/lib/ebay/offers";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";
import { validateListingReadiness } from "@/lib/listings/validate-listing-readiness";

interface DraftProductRow {
  supplier_sku?: string | null;
  currency?: string | null;
  brand?: string | null;
}

export interface ListingDraftRow {
  id: string;
  user_id: string;
  supplier_product_id: string;
  ebay_title: string;
  ebay_description: string;
  ebay_category_id?: string | null;
  item_specifics?: Record<string, string | string[]> | null;
  condition: string;
  quantity: number;
  price: number;
  optimized_image_urls: string[];
  status: string;
  publish_attempts?: number | null;
  supplier_products?: DraftProductRow | DraftProductRow[] | null;
}

export interface PublishListingResult {
  listingId: string;
  offerId: string;
  sku: string;
}

export async function publishListingDraftToEbaySandbox({
  supabase,
  userId,
  draftId,
  marketplaceId
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
  marketplaceId?: string;
}): Promise<PublishListingResult> {
  const config = getEbayConfig();
  const resolvedMarketplaceId = marketplaceId ?? config.marketplaceId;
  const draft = await loadDraftForPublish({ supabase, userId, draftId });
  const attempt = (draft.publish_attempts ?? 0) + 1;

  try {
    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_publish",
      message: "ebay_publish_started",
      metadata: { draftId, attempt, marketplaceId: resolvedMarketplaceId }
    });

    if (draft.status !== "approved") {
      throw new EbayIntegrationError(
        "Approve this draft before publishing.",
        "PUBLISH_READINESS_FAILED",
        getEbayErrorRecommendation("PUBLISH_READINESS_FAILED"),
        { missing: ["Approve this draft before publishing."] }
      );
    }

    const accountForReadiness = await getEbayAccount({
      supabase,
      userId,
      marketplace: resolvedMarketplaceId
    });
    const product = getDraftProduct(draft);
    const readiness = await validateListingReadiness({
      draft: {
        ...draft,
        supplier_sku: product?.supplier_sku ?? null
      },
      account: accountForReadiness,
      checkImageAccessibility: true
    });

    if (!readiness.ready) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "warning",
        module: "ebay_publish",
        message: "ebay_publish_preflight_failed",
        metadata: {
          draftId,
          score: readiness.score,
          missing: readiness.missing,
          warnings: readiness.warnings
        }
      });

      const fulfillmentMissing = readiness.missing.some((item) => /fulfillment policy/i.test(item));

      throw new EbayIntegrationError(
        fulfillmentMissing
          ? "Cannot publish: fulfillment policy missing."
          : `Cannot publish yet: missing ${readiness.missing.join(", ")}.`,
        fulfillmentMissing ? "MISSING_POLICY" : "PUBLISH_READINESS_FAILED",
        getEbayErrorRecommendation(fulfillmentMissing ? "MISSING_POLICY" : "PUBLISH_READINESS_FAILED"),
        readiness
      );
    }

    validateDraftForPublish(draft);
    const { account, accessToken } = await getValidEbayAccessToken({
      supabase,
      userId,
      marketplace: resolvedMarketplaceId
    });
    validateAccountForPublish(account);

    const sku = buildEbaySku(draft, product?.supplier_sku ?? undefined);
    const aspects = sanitizeAspects(draft.item_specifics ?? {});
    const categoryId = draft.ebay_category_id ?? process.env.EBAY_SANDBOX_FALLBACK_CATEGORY_ID ?? "";

    await updateDraftAttempt({ supabase, userId, draftId, attempt, status: "approved" });

    await createOrReplaceInventoryItem(accessToken, {
      sku,
      title: draft.ebay_title,
      description: draft.ebay_description,
      quantity: draft.quantity,
      imageUrls: draft.optimized_image_urls,
      condition: normalizeCondition(draft.condition),
      aspects,
      brand: typeof aspects.Brand === "string" ? aspects.Brand : product?.brand ?? undefined
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_publish",
      message: "ebay_inventory_item_created",
      metadata: { draftId, sku }
    });

    if (!account.fulfillment_policy_id && isSandboxPolicyFallbackAllowed()) {
      throw new EbayIntegrationError(
        "Sandbox fallback is enabled for diagnostics, but real offer publish is blocked until a real fulfillment policy exists.",
        "MISSING_POLICY",
        "Run the official docs fulfillment test. If eBay returns 20500, continue draft/demo workflow and keep publish blocked."
      );
    }

    const offer = await createOffer(accessToken, {
      sku,
      marketplaceId: resolvedMarketplaceId,
      availableQuantity: draft.quantity,
      categoryId,
      listingDescription: draft.ebay_description,
      price: Number(draft.price),
      currency: product?.currency ?? "USD",
      merchantLocationKey: account.inventory_location_key ?? "",
      paymentPolicyId: account.payment_policy_id ?? "",
      returnPolicyId: account.return_policy_id ?? "",
      fulfillmentPolicyId: account.fulfillment_policy_id ?? ""
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_publish",
      message: "ebay_offer_created",
      metadata: { draftId, sku, offerId: offer.offerId }
    });

    const published = await publishOffer(accessToken, offer.offerId);
    const listingId = published.listingId;

    await supabase
      .from("listing_drafts")
      .update({
        status: "published",
        ebay_offer_id: offer.offerId,
        ebay_item_id: listingId,
        ebay_sku: sku,
        error_message: null,
        ebay_error_code: null,
        ebay_error_json: {},
        publish_attempts: attempt,
        last_publish_attempt_at: new Date().toISOString(),
        published_at: new Date().toISOString()
      })
      .eq("id", draft.id)
      .eq("user_id", userId);

    await supabase.from("ebay_listings").insert({
      user_id: userId,
      listing_draft_id: draft.id,
      supplier_product_id: draft.supplier_product_id,
      ebay_item_id: listingId,
      ebay_offer_id: offer.offerId,
      ebay_sku: sku,
      title: draft.ebay_title,
      price: draft.price,
      quantity: draft.quantity,
      status: "active",
      published_at: new Date().toISOString()
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_publish",
      message: "ebay_offer_published",
      metadata: { draftId, sku, offerId: offer.offerId, listingId }
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_publish",
      message: "ebay_publish_success",
      metadata: { draftId, sku, offerId: offer.offerId, listingId }
    });

    return { listingId, offerId: offer.offerId, sku };
  } catch (error) {
    await recordDraftPublishError({
      supabase,
      userId,
      draftId,
      attempt,
      error
    });
    throw error;
  }
}

export async function recordDraftPublishError({
  supabase,
  userId,
  draftId,
  attempt,
  error
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
  attempt?: number;
  error: unknown;
}) {
  const normalized = normalizePublishError(error);

  await supabase
    .from("listing_drafts")
    .update({
      status: "failed",
      error_message: normalized.message,
      ebay_error_code: normalized.code,
      ebay_error_json: normalized.details,
      publish_attempts: attempt,
      last_publish_attempt_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .eq("user_id", userId);

  await logAutomationEvent({
    supabase,
    userId,
    level: "error",
    module: "ebay_publish",
    message: "ebay_publish_failed",
    metadata: {
      draftId,
      error: normalized.message,
      code: normalized.code,
      recommendation: normalized.recommendation,
      details: normalized.details
    }
  });
}

export function normalizePublishError(error: unknown) {
  if (error instanceof EbayIntegrationError) {
    const recommendation = error.recommendation ?? getEbayErrorRecommendation(error.code);

    return {
      code: error.code,
      message: getConciseEbayErrorMessage(error),
      recommendation,
      details: error.details ? { ebay: error.details, status: error.status } : { status: error.status }
    };
  }

  const message = error instanceof Error ? error.message : "Sandbox listing publish failed.";

  return {
    code: "PUBLISH_FAILED",
    message,
    recommendation: getEbayErrorRecommendation("PUBLISH_FAILED"),
    details: { message }
  };
}

function getConciseEbayErrorMessage(error: EbayIntegrationError) {
  if (error.code === "INVALID_SHIPPING_SERVICE") {
    return "Invalid shipping service code for fulfillment policy. The app will retry with another sandbox-safe service.";
  }

  if (error.code === "BUSINESS_POLICY_NOT_ELIGIBLE" || error.code === "SELLING_POLICY_NOT_OPTED_IN") {
    return "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again.";
  }

  return error.message;
}

async function loadDraftForPublish({
  supabase,
  userId,
  draftId
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
}) {
  const { data, error } = await supabase
    .from("listing_drafts")
    .select(
      "id,user_id,supplier_product_id,ebay_title,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,status,publish_attempts,supplier_products(supplier_sku,currency,brand)"
    )
    .eq("id", draftId)
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ListingDraftRow;
}

function validateDraftForPublish(draft: ListingDraftRow) {
  if (draft.status === "published") {
    throw new EbayIntegrationError(
      "This draft is already published.",
      "DUPLICATE_SKU",
      "Create a new draft or revise the existing listing."
    );
  }

  if (!draft.ebay_category_id && !process.env.EBAY_SANDBOX_FALLBACK_CATEGORY_ID) {
    throw new EbayIntegrationError(
      "Missing eBay category ID.",
      "INVALID_CATEGORY",
      getEbayErrorRecommendation("INVALID_CATEGORY")
    );
  }

  if (!draft.optimized_image_urls || draft.optimized_image_urls.length === 0) {
    throw new EbayIntegrationError(
      "At least one eBay-accessible image URL is required before publishing.",
      "IMAGE_ERROR",
      getEbayErrorRecommendation("IMAGE_ERROR")
    );
  }

  if (!draft.item_specifics || Object.keys(draft.item_specifics).length === 0) {
    throw new EbayIntegrationError(
      "Item specifics are required before publishing.",
      "INVALID_ASPECTS",
      getEbayErrorRecommendation("INVALID_ASPECTS")
    );
  }
}

function validateAccountForPublish(account: EbayAccountRecord) {
  const missingFulfillmentOnly =
    account.payment_policy_id &&
    account.return_policy_id &&
    !account.fulfillment_policy_id &&
    account.inventory_location_key &&
    isSandboxPolicyFallbackAllowed();

  if (!hasRequiredSellerSetup(account) && !missingFulfillmentOnly) {
    throw new EbayIntegrationError(
      "eBay sandbox seller setup is incomplete.",
      !account.inventory_location_key ? "MISSING_LOCATION" : "MISSING_POLICY",
      !account.inventory_location_key
        ? getEbayErrorRecommendation("MISSING_LOCATION")
        : getEbayErrorRecommendation("MISSING_POLICY")
    );
  }
}

function isSandboxPolicyFallbackAllowed() {
  return process.env.EBAY_ENVIRONMENT !== "production" && process.env.ALLOW_SANDBOX_POLICY_FALLBACK === "true";
}

function getDraftProduct(draft: ListingDraftRow) {
  if (Array.isArray(draft.supplier_products)) {
    return draft.supplier_products[0];
  }

  return draft.supplier_products ?? null;
}

function buildEbaySku(draft: ListingDraftRow, supplierSku?: string) {
  const raw = supplierSku || draft.id;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
}

function sanitizeAspects(aspects: Record<string, string | string[]>) {
  return Object.fromEntries(
    Object.entries(aspects).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0 && value.every((item) => item.trim().length > 0);
      }

      return typeof value === "string" && value.trim().length > 0;
    })
  );
}

function normalizeCondition(condition: string) {
  return condition.toUpperCase() === "NEW" ? "NEW" : condition;
}

async function updateDraftAttempt({
  supabase,
  userId,
  draftId,
  attempt,
  status
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
  attempt: number;
  status: string;
}) {
  await supabase
    .from("listing_drafts")
    .update({
      status,
      publish_attempts: attempt,
      last_publish_attempt_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .eq("user_id", userId);
}

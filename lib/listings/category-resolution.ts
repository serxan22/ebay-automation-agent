import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayAccount, getValidEbayAccessToken } from "@/lib/ebay/account";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";
import { resolveEbayCategory, type EbayCategorySuggestionResult } from "@/lib/ebay/taxonomy";
import { validateListingReadiness, type ListingReadinessResult } from "@/lib/listings/validate-listing-readiness";

export interface ResolveCategoryForDraftResult {
  ok: boolean;
  draftId: string;
  category: EbayCategorySuggestionResult | null;
  message: string;
  readiness?: ListingReadinessResult;
}

const CATEGORY_RESOLUTION_LIMIT = 20;

export async function resolveCategoryForDraft({
  supabase,
  userId,
  draftId
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
}): Promise<ResolveCategoryForDraftResult> {
  const draft = await loadDraftForCategoryResolution({ supabase, userId, draftId });
  const product = getEmbeddedRow(draft.supplier_products);
  const { accessToken } = await getValidEbayAccessToken({ supabase, userId });

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_taxonomy",
    message: "ebay_category_resolution_started",
    metadata: { draftId }
  });

  const category = await resolveEbayCategory({
    accessToken,
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
    title: draft.ebay_title,
    productTitle: product?.title,
    categoryHint: product?.category,
    keywords: buildKeywords(draft, product)
  });

  if (!category) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "warning",
      module: "ebay_taxonomy",
      message: "ebay_category_resolution_failed",
      metadata: {
        draftId,
        reason: "no_category_suggestion"
      }
    });

    return {
      ok: false,
      draftId,
      category: null,
      message: "Could not auto-resolve eBay category. Enter category ID manually or retry."
    };
  }

  const { error } = await supabase
    .from("listing_drafts")
    .update({
      ebay_category_id: category.categoryId,
      ebay_category_name: category.categoryName,
      ebay_category_path: category.categoryPath,
      category_tree_id: category.categoryTreeId,
      category_confidence: category.confidence,
      error_message: null,
      ebay_error_code: null,
      ebay_error_json: {},
      updated_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const account = await getEbayAccount({ supabase, userId });
  const readiness = await validateListingReadiness({
    draft: {
      ...draft,
      ebay_category_id: category.categoryId,
      supplier_sku: product?.supplier_sku ?? null
    },
    account
  });

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_taxonomy",
    message: "ebay_category_resolution_success",
    metadata: {
      draftId,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryPath: category.categoryPath,
      categoryTreeId: category.categoryTreeId,
      confidence: category.confidence
    }
  });

  return {
    ok: true,
    draftId,
    category,
    readiness,
    message: `Resolved category ${category.categoryId}: ${category.categoryName}.`
  };
}

export async function resolveMissingCategoriesForUser({
  supabase,
  userId,
  limit = CATEGORY_RESOLUTION_LIMIT
}: {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
}) {
  const boundedLimit = Math.max(1, Math.min(limit, CATEGORY_RESOLUTION_LIMIT));
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id")
    .eq("user_id", userId)
    .or("ebay_category_id.is.null,ebay_category_id.eq.")
    .neq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);

  if (error) {
    throw new Error(error.message);
  }

  const results: ResolveCategoryForDraftResult[] = [];

  for (const row of data ?? []) {
    try {
      results.push(await resolveCategoryForDraft({ supabase, userId, draftId: row.id as string }));
    } catch (error) {
      results.push({
        ok: false,
        draftId: row.id as string,
        category: null,
        message: error instanceof Error ? error.message : "Category resolution failed."
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    checked: data?.length ?? 0,
    resolved: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
    message:
      results.length === 0
        ? "No drafts with missing categories were found."
        : `Resolved ${results.filter((result) => result.ok).length}/${results.length} missing categories.`
  };
}

export function normalizeCategoryRouteError(error: unknown) {
  if (error instanceof EbayIntegrationError) {
    return {
      code: error.code,
      error: error.message,
      recommendation: error.recommendation ?? getEbayErrorRecommendation(error.code),
      details: error.details ?? null
    };
  }

  return {
    code: "CATEGORY_RESOLUTION_FAILED",
    error: error instanceof Error ? error.message : "Category resolution failed.",
    recommendation: "Retry category resolution or enter the category ID manually.",
    details: null
  };
}

async function loadDraftForCategoryResolution({
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
      "id,user_id,supplier_product_id,ebay_title,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,status,required_item_specifics,missing_item_specifics,supplier_products(title,description,brand,category,supplier_sku,image_urls)"
    )
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Listing draft was not found.");
  }

  return data as Record<string, any>;
}

function buildKeywords(draft: Record<string, any>, product: Record<string, any> | null) {
  const text = [
    draft.ebay_title,
    stripHtml(draft.ebay_description ?? ""),
    product?.title,
    product?.category,
    product?.brand
  ]
    .filter(Boolean)
    .join(" ");

  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    )
  ).slice(0, 12);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function getEmbeddedRow(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, any> | undefined) ?? null;
  }

  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

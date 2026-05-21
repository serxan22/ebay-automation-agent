import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { generateItemSpecificsFromAspects, getItemAspectsForCategory } from "@/lib/ebay/aspects";
import { getEbayAccount, getValidEbayAccessToken } from "@/lib/ebay/account";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";
import { getDefaultCategoryTreeId } from "@/lib/ebay/taxonomy";
import { validateListingReadiness, type ListingReadinessResult } from "@/lib/listings/validate-listing-readiness";

export interface GenerateItemSpecificsForDraftResult {
  ok: boolean;
  draftId: string;
  itemSpecifics: Record<string, string | string[]>;
  requiredAspects: string[];
  missingRequiredAspects: string[];
  warnings: string[];
  readiness?: ListingReadinessResult;
  message: string;
}

const ITEM_SPECIFICS_BATCH_LIMIT = 20;

export async function generateItemSpecificsForDraft({
  supabase,
  userId,
  draftId
}: {
  supabase: SupabaseClient;
  userId: string;
  draftId: string;
}): Promise<GenerateItemSpecificsForDraftResult> {
  const draft = await loadDraftForItemSpecifics({ supabase, userId, draftId });
  const product = getEmbeddedRow(draft.supplier_products);

  if (!draft.ebay_category_id) {
    return {
      ok: false,
      draftId,
      itemSpecifics: normalizeItemSpecifics(draft.item_specifics),
      requiredAspects: [],
      missingRequiredAspects: ["eBay category ID"],
      warnings: [],
      message: "Resolve eBay category before generating item specifics."
    };
  }

  const { accessToken } = await getValidEbayAccessToken({ supabase, userId });
  let categoryTreeId = String(draft.category_tree_id ?? "").trim();

  if (!categoryTreeId) {
    const defaultTree = await getDefaultCategoryTreeId({
      accessToken,
      marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
    });
    categoryTreeId = defaultTree.categoryTreeId;
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_taxonomy",
    message: "ebay_item_specifics_generation_started",
    metadata: { draftId, categoryId: draft.ebay_category_id, categoryTreeId }
  });

  const aspectsResponse = await getItemAspectsForCategory({
    accessToken,
    categoryTreeId,
    categoryId: String(draft.ebay_category_id)
  });
  const generated = generateItemSpecificsFromAspects({
    aspects: aspectsResponse.aspects ?? [],
    existingSpecifics: normalizeItemSpecifics(draft.item_specifics),
    productTitle: product?.title ?? draft.ebay_title,
    productDescription: product?.description ?? stripHtml(draft.ebay_description ?? ""),
    supplierBrand: product?.brand,
    supplierCategory: product?.category,
    categoryName: draft.ebay_category_name,
    categoryPath: draft.ebay_category_path
  });

  const { error } = await supabase
    .from("listing_drafts")
    .update({
      item_specifics: generated.itemSpecifics,
      required_item_specifics: generated.requiredAspects,
      missing_item_specifics: generated.missingRequiredAspects,
      category_tree_id: categoryTreeId,
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
      item_specifics: generated.itemSpecifics,
      required_item_specifics: generated.requiredAspects,
      missing_item_specifics: generated.missingRequiredAspects,
      category_tree_id: categoryTreeId,
      supplier_sku: product?.supplier_sku ?? null
    },
    account
  });

  const ok = generated.missingRequiredAspects.length === 0;

  await logAutomationEvent({
    supabase,
    userId,
    level: ok ? "success" : "warning",
    module: "ebay_taxonomy",
    message: ok ? "ebay_item_specifics_generation_success" : "ebay_item_specifics_generation_incomplete",
    metadata: {
      draftId,
      categoryId: draft.ebay_category_id,
      requiredAspects: generated.requiredAspects,
      missingRequiredAspects: generated.missingRequiredAspects
    }
  });

  return {
    ok,
    draftId,
    itemSpecifics: generated.itemSpecifics,
    requiredAspects: generated.requiredAspects,
    missingRequiredAspects: generated.missingRequiredAspects,
    warnings: generated.warnings,
    readiness,
    message: ok
      ? "Item specifics generated."
      : `Item specifics generated, but required aspects are missing: ${generated.missingRequiredAspects.join(", ")}.`
  };
}

export async function generateMissingItemSpecificsForUser({
  supabase,
  userId,
  limit = ITEM_SPECIFICS_BATCH_LIMIT
}: {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
}) {
  const boundedLimit = Math.max(1, Math.min(limit, ITEM_SPECIFICS_BATCH_LIMIT));
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id")
    .eq("user_id", userId)
    .not("ebay_category_id", "is", null)
    .neq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);

  if (error) {
    throw new Error(error.message);
  }

  const results: GenerateItemSpecificsForDraftResult[] = [];

  for (const row of data ?? []) {
    try {
      results.push(await generateItemSpecificsForDraft({ supabase, userId, draftId: row.id as string }));
    } catch (error) {
      results.push({
        ok: false,
        draftId: row.id as string,
        itemSpecifics: {},
        requiredAspects: [],
        missingRequiredAspects: [],
        warnings: [],
        message: error instanceof Error ? error.message : "Item specifics generation failed."
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    checked: data?.length ?? 0,
    completed: results.filter((result) => result.ok).length,
    incomplete: results.filter((result) => !result.ok).length,
    results,
    message:
      results.length === 0
        ? "No category-resolved drafts were found."
        : `Generated complete item specifics for ${results.filter((result) => result.ok).length}/${results.length} drafts.`
  };
}

export function normalizeItemSpecificsRouteError(error: unknown) {
  if (error instanceof EbayIntegrationError) {
    return {
      code: error.code,
      error: error.message,
      recommendation: error.recommendation ?? getEbayErrorRecommendation(error.code),
      details: error.details ?? null
    };
  }

  return {
    code: "ITEM_SPECIFICS_FAILED",
    error: error instanceof Error ? error.message : "Item specifics generation failed.",
    recommendation: "Resolve the category first, then retry item specifics. Fill missing required aspects manually if needed.",
    details: null
  };
}

async function loadDraftForItemSpecifics({
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
      "id,user_id,supplier_product_id,ebay_title,ebay_description,ebay_category_id,ebay_category_name,ebay_category_path,category_tree_id,item_specifics,condition,quantity,price,optimized_image_urls,status,required_item_specifics,missing_item_specifics,supplier_products(title,description,brand,category,supplier_sku)"
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

function normalizeItemSpecifics(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, string | string[]>;
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

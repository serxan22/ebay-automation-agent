import { NextResponse } from "next/server";
import { z } from "zod";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getConfiguredAiProvider } from "@/lib/ai";
import { generateListing } from "@/lib/ai/generate-listing";
import {
  createListingDraft,
  createSafeFallbackListingGeneration
} from "@/lib/products/create-listing-draft";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";
import type { AutomationSettings, ProductAnalysis, SupplierProduct } from "@/lib/types";

const createDraftSchema = z.object({
  product: z.custom<SupplierProduct>(),
  analysis: z.custom<ProductAnalysis>(),
  settings: z.custom<AutomationSettings>(),
  optimizedImageUrls: z.array(z.string()).optional(),
  analysisId: z.string().uuid().nullable().optional()
});

const itemSpecificValueSchema = z.union([z.string(), z.array(z.string())]);

const updateDraftSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    draftId: z.string().uuid()
  }),
  z.object({
    action: z.literal("regenerate_copy"),
    draftId: z.string().uuid()
  }),
  z.object({
    action: z.literal("revise"),
    draftId: z.string().uuid(),
    ebayTitle: z.string().trim().min(5).max(80),
    ebayDescription: z.string().trim().min(20),
    price: z.number().min(0),
    quantity: z.number().int().min(1),
    ebayCategoryId: z.string().trim().nullable().optional(),
    itemSpecifics: z.record(itemSpecificValueSchema).default({}),
    optimizedImageUrls: z.array(z.string().trim().min(1)).default([])
  })
]);

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const payload = createDraftSchema.parse(await request.json());

    if (!payload.product.id) {
      return NextResponse.json(
        { error: "missing supplier_product_id" },
        { status: 400 }
      );
    }

    if (!payload.analysisId) {
      return NextResponse.json(
        { error: "missing analysis_id" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(payload.analysis.recommendedEbayPrice)) {
      return NextResponse.json(
        { error: "missing price" },
        { status: 400 }
      );
    }

    const generatedListing = await generateListingForDraft(payload.product, payload.analysis);
    const draft = createListingDraft({
      product: payload.product,
      analysis: payload.analysis,
      settings: payload.settings,
      generatedListing,
      optimizedImageUrls: payload.optimizedImageUrls,
      analysisId: payload.analysisId
    });
    const { data, error } = await supabase
      .from("listing_drafts")
      .insert({
        user_id: user.id,
        supplier_product_id: draft.supplierProductId,
        analysis_id: draft.analysisId,
        ebay_title: draft.ebayTitle,
        ebay_description: draft.ebayDescription,
        ebay_category_id: draft.ebayCategoryId,
        item_specifics: draft.itemSpecifics,
        condition: draft.condition,
        quantity: draft.quantity,
        price: draft.price,
        optimized_image_urls: draft.optimizedImageUrls,
        status: draft.status,
        ai_generated: draft.aiGenerated
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(describeSupabaseError(error));
    }

    await logAutomationEvent({
      supabase,
      userId: user.id,
      level: "success",
      module: "listing_drafts",
      message: "draft_created",
      metadata: { draftId: data.id, supplierProductId: draft.supplierProductId }
    });

    return NextResponse.json({ ok: true, draft: data, generatedListing });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof z.ZodError ? `validation error: ${error.message}` : error instanceof Error ? error.message : "Listing draft creation failed." },
      { status: 400 }
    );
  }
}

async function generateListingForDraft(product: SupplierProduct, analysis: ProductAnalysis) {
  const provider = getConfiguredAiProvider();

  if (!provider) {
    return createSafeFallbackListingGeneration(product, analysis);
  }

  try {
    const generated = await generateListing({ product, analysis });

    if (generated.warnings.some((warning) => /AI provider fallback used/i.test(warning))) {
      return createSafeFallbackListingGeneration(product, analysis);
    }

    return generated;
  } catch {
    return createSafeFallbackListingGeneration(product, analysis);
  }
}

function describeSupabaseError(error: { message?: string; code?: string }) {
  const message = error.message ?? "Supabase insert failed.";

  if (error.code === "42501" || /row-level security|rls/i.test(message)) {
    return `RLS error: ${message}`;
  }

  return message;
}

function getEmbeddedRow(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, any> | undefined) ?? null;
  }

  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

function mapSupplierProduct(row: Record<string, any>): SupplierProduct {
  return {
    id: row.id,
    userId: row.user_id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku,
    title: row.title,
    description: row.description,
    brand: row.brand,
    category: row.category,
    supplierPrice: Number(row.supplier_price ?? 0),
    shippingCost: Number(row.shipping_cost ?? 0),
    stockQuantity: Number(row.stock_quantity ?? 0),
    currency: row.currency ?? "USD",
    productUrl: row.product_url,
    imageUrls: row.image_urls ?? [],
    rawData: row.raw_data ?? {},
    shippingDays: Number(row.shipping_days ?? 5),
    countryOfOrigin: row.country_of_origin
  };
}

function mapProductAnalysis(row: Record<string, any>): ProductAnalysis {
  return {
    profitScore: Number(row.profit_score ?? 0),
    riskScore: Number(row.risk_score ?? 0),
    demandScore: Number(row.demand_score ?? 0),
    competitionScore: Number(row.competition_score ?? 0),
    imageScore: Number(row.image_score ?? 0),
    shippingScore: Number(row.shipping_score ?? 0),
    finalScore: Number(row.final_score ?? 0),
    estimatedEbayFees: Number(row.estimated_ebay_fees ?? 0),
    estimatedTotalCost: Number(row.estimated_total_cost ?? 0),
    recommendedEbayPrice: Number(row.recommended_ebay_price ?? 0),
    estimatedProfit: Number(row.estimated_profit ?? 0),
    marginPercentage: Number(row.margin_percentage ?? 0),
    aiNotes: row.ai_notes ?? "",
    rejectionReasons: Array.isArray(row.rejection_reasons) ? row.rejection_reasons : [],
    approvedForListing: Boolean(row.approved_for_listing)
  };
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const payload = updateDraftSchema.parse(await request.json());

    if (payload.action === "approve") {
      const { data, error } = await supabase
        .from("listing_drafts")
        .update({
          status: "approved",
          error_message: null,
          ebay_error_code: null,
          ebay_error_json: {}
        })
        .eq("id", payload.draftId)
        .eq("user_id", user.id)
        .eq("status", "draft")
        .select("id,status")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return NextResponse.json(
          { error: "Draft was not found or is not in draft status." },
          { status: 404 }
        );
      }

      await logAutomationEvent({
        supabase,
        userId: user.id,
        level: "success",
        module: "listing_drafts",
        message: "Listing draft approved.",
        metadata: { draftId: payload.draftId }
      });

      return NextResponse.json({ ok: true, message: "Draft approved.", draft: data });
    }

    if (payload.action === "regenerate_copy") {
      const { data: draftRow, error: draftLoadError } = await supabase
        .from("listing_drafts")
        .select("id,status,supplier_products(*),product_analysis(*)")
        .eq("id", payload.draftId)
        .eq("user_id", user.id)
        .neq("status", "published")
        .maybeSingle();

      if (draftLoadError) {
        throw new Error(draftLoadError.message);
      }

      if (!draftRow) {
        return NextResponse.json(
          { error: "Draft was not found or cannot be regenerated after publishing." },
          { status: 404 }
        );
      }

      const productRow = getEmbeddedRow((draftRow as Record<string, unknown>).supplier_products);
      const analysisRow = getEmbeddedRow((draftRow as Record<string, unknown>).product_analysis);

      if (!productRow || !analysisRow) {
        return NextResponse.json(
          { error: "Regenerate listing copy requires the original supplier product and analysis rows." },
          { status: 400 }
        );
      }

      const generated = await generateListingForDraft(mapSupplierProduct(productRow), mapProductAnalysis(analysisRow));
      const { data, error } = await supabase
        .from("listing_drafts")
        .update({
          ebay_title: generated.ebayTitle,
          ebay_description: generated.ebayDescription,
          item_specifics: generated.itemSpecifics,
          ai_generated: true,
          error_message: null,
          ebay_error_code: null,
          ebay_error_json: {}
        })
        .eq("id", payload.draftId)
        .eq("user_id", user.id)
        .select("id,status,ebay_title,ebay_description,item_specifics")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      await logAutomationEvent({
        supabase,
        userId: user.id,
        level: "success",
        module: "listing_drafts",
        message: "Listing copy regenerated.",
        metadata: { draftId: payload.draftId, warnings: generated.warnings }
      });

      return NextResponse.json({ ok: true, message: "Listing copy regenerated.", draft: data, generatedListing: generated });
    }

    const { data, error } = await supabase
      .from("listing_drafts")
      .update({
        ebay_title: payload.ebayTitle,
        ebay_description: payload.ebayDescription,
        price: payload.price,
        quantity: payload.quantity,
        ebay_category_id: payload.ebayCategoryId || null,
        item_specifics: payload.itemSpecifics,
        optimized_image_urls: payload.optimizedImageUrls,
        status: "draft",
        error_message: null,
        ebay_error_code: null,
        ebay_error_json: {}
      })
      .eq("id", payload.draftId)
      .eq("user_id", user.id)
      .neq("status", "published")
      .select("id,status")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Draft was not found or cannot be revised after publishing." },
        { status: 404 }
      );
    }

    await logAutomationEvent({
      supabase,
      userId: user.id,
      level: "success",
      module: "listing_drafts",
      message: "Listing draft revised.",
      metadata: {
        draftId: payload.draftId,
        ebayCategoryId: payload.ebayCategoryId,
        price: payload.price,
        quantity: payload.quantity,
        imageCount: payload.optimizedImageUrls.length
      }
    });

    return NextResponse.json({ ok: true, message: "Draft revised.", draft: data });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Listing draft update failed." },
      { status: 400 }
    );
  }
}

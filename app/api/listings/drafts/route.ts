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
    action: z.literal("revise"),
    draftId: z.string().uuid(),
    ebayTitle: z.string().trim().min(5).max(80),
    ebayDescription: z.string().trim().min(20),
    price: z.number().min(0),
    quantity: z.number().int().min(1),
    ebayCategoryId: z.string().trim().nullable().optional(),
    itemSpecifics: z.record(itemSpecificValueSchema).default({})
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

    const { data, error } = await supabase
      .from("listing_drafts")
      .update({
        ebay_title: payload.ebayTitle,
        ebay_description: payload.ebayDescription,
        price: payload.price,
        quantity: payload.quantity,
        ebay_category_id: payload.ebayCategoryId || null,
        item_specifics: payload.itemSpecifics,
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
        quantity: payload.quantity
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

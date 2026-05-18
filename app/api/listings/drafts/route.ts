import { NextResponse } from "next/server";
import { z } from "zod";
import { generateListing } from "@/lib/ai/generate-listing";
import { createListingDraft } from "@/lib/products/create-listing-draft";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";
import type { AutomationSettings, ProductAnalysis, SupplierProduct } from "@/lib/types";

const createDraftSchema = z.object({
  product: z.custom<SupplierProduct>(),
  analysis: z.custom<ProductAnalysis>(),
  settings: z.custom<AutomationSettings>(),
  optimizedImageUrls: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    await getAuthenticatedApiContext();
    const payload = createDraftSchema.parse(await request.json());
    const generatedListing = await generateListing({
      product: payload.product,
      analysis: payload.analysis
    });
    const draft = createListingDraft({
      product: payload.product,
      analysis: payload.analysis,
      settings: payload.settings,
      generatedListing,
      optimizedImageUrls: payload.optimizedImageUrls
    });

    return NextResponse.json({ draft, generatedListing });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Listing draft creation failed." },
      { status: 400 }
    );
  }
}

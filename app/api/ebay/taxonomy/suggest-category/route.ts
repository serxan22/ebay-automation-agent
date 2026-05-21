import { NextResponse } from "next/server";
import { z } from "zod";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { resolveEbayCategory } from "@/lib/ebay/taxonomy";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";
import { normalizeCategoryRouteError } from "@/lib/listings/category-resolution";

const suggestCategorySchema = z.object({
  query: z.string().trim().optional(),
  title: z.string().trim().optional(),
  productTitle: z.string().trim().optional(),
  categoryHint: z.string().trim().optional(),
  keywords: z.array(z.string().trim()).optional()
});

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const payload = suggestCategorySchema.parse(await request.json());
    const { accessToken } = await getValidEbayAccessToken({ supabase, userId: user.id });
    const category = await resolveEbayCategory({
      accessToken,
      marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
      title: payload.query ?? payload.title,
      productTitle: payload.productTitle,
      categoryHint: payload.categoryHint,
      keywords: payload.keywords
    });

    if (!category) {
      return NextResponse.json({
        ok: false,
        category: null,
        message: "Could not auto-resolve eBay category. Enter category ID manually or retry."
      });
    }

    return NextResponse.json({
      ok: true,
      category,
      message: `Resolved category ${category.categoryId}: ${category.categoryName}.`
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizeCategoryRouteError(error);
    return NextResponse.json({ ok: false, ...normalized }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeProduct } from "@/lib/products/analyze-product";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";
import type { AutomationSettings, SupplierProduct } from "@/lib/types";

const supplierProductSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  supplierId: z.string(),
  supplierSku: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  supplierPrice: z.number(),
  shippingCost: z.number().default(0),
  stockQuantity: z.number().int().default(0),
  currency: z.string().default("USD"),
  productUrl: z.string().nullable().optional(),
  imageUrls: z.array(z.string()).default([]),
  rawData: z.record(z.unknown()).optional(),
  shippingDays: z.number().int().default(5),
  countryOfOrigin: z.string().nullable().optional()
});

const automationSettingsSchema = z.object({
  userId: z.string(),
  dailyListingLimit: z.number().int(),
  minProfitAmount: z.number(),
  minMarginPercentage: z.number(),
  maxShippingDays: z.number().int(),
  minStockQuantity: z.number().int(),
  autoListingEnabled: z.boolean(),
  approvalMode: z.enum(["manual", "trusted_auto", "full_auto", "full_auto_sandbox_only"]),
  riskTolerance: z.number().min(0).max(100),
  defaultQuantity: z.number().int(),
  pricingBufferPercentage: z.number(),
  promotedListingPercentage: z.number(),
  allowedCategories: z.array(z.string()),
  blockedCategories: z.array(z.string()),
  blockedBrands: z.array(z.string()),
  blockedKeywords: z.array(z.string()),
  supplierPriority: z.array(z.string()),
  defaultMarketplace: z.string(),
  shippingCountryPreference: z.string(),
  maxPrice: z.number().nullable().optional(),
  minPrice: z.number().nullable().optional(),
  requireImageQualityScore: z.number(),
  requireDemandScore: z.number(),
  newAccountSafeMode: z.boolean()
});

const analyzeRequestSchema = z.object({
  product: supplierProductSchema,
  settings: automationSettingsSchema
});

export async function POST(request: Request) {
  try {
    await getAuthenticatedApiContext();
    const payload = analyzeRequestSchema.parse(await request.json());
    const analysis = analyzeProduct({
      product: payload.product as SupplierProduct,
      settings: payload.settings as AutomationSettings
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Product analysis failed." },
      { status: 400 }
    );
  }
}

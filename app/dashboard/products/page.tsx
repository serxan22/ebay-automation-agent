import { ProductTable } from "@/components/products/ProductTable";
import { demoAnalyses, demoProducts, demoSettings } from "@/lib/demo-data";
import { analyzeProduct } from "@/lib/products/analyze-product";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { AutomationSettings, ProductAnalysis, Supplier, SupplierProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { products, analyses } = await loadProductDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Supplier products</h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Profit, shipping, image, stock, and compliance scoring before any listing action.
        </p>
      </div>
      <ProductTable products={products} analyses={analyses} />
    </div>
  );
}

async function loadProductDashboardData() {
  if (!hasSupabaseServerEnv()) {
    return { products: demoProducts, analyses: demoAnalyses };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { products: demoProducts, analyses: demoAnalyses };
  }

  const [productsResponse, suppliersResponse, settingsResponse] = await Promise.all([
    supabase
      .from("supplier_products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("suppliers").select("*").eq("user_id", user.id),
    supabase.from("automation_settings").select("*").eq("user_id", user.id).maybeSingle()
  ]);

  if (productsResponse.error || suppliersResponse.error || settingsResponse.error) {
    return { products: demoProducts, analyses: demoAnalyses };
  }

  const products = ((productsResponse.data ?? []) as Array<Record<string, any>>).map(mapSupplierProduct);

  if (!products.length) {
    return { products: demoProducts, analyses: demoAnalyses };
  }

  const suppliers = ((suppliersResponse.data ?? []) as Array<Record<string, any>>).map(mapSupplier);
  const settings = mapAutomationSettings(settingsResponse.data as Record<string, any> | null, user.id);
  const productIds = products.map((product) => product.id).filter(Boolean) as string[];
  const latestAnalyses = new Map<string, ProductAnalysis>();

  if (productIds.length) {
    const { data } = await supabase
      .from("product_analysis")
      .select("*")
      .eq("user_id", user.id)
      .in("supplier_product_id", productIds)
      .order("created_at", { ascending: false })
      .limit(1000);

    for (const row of (data ?? []) as Array<Record<string, any>>) {
      const productId = row.supplier_product_id as string;

      if (!latestAnalyses.has(productId)) {
        latestAnalyses.set(productId, mapProductAnalysis(row));
      }
    }
  }

  const analyses = products.map((product) => {
    if (product.id && latestAnalyses.has(product.id)) {
      return latestAnalyses.get(product.id)!;
    }

    return analyzeProduct({
      product,
      settings,
      supplier: suppliers.find((supplier) => supplier.id === product.supplierId) ?? null
    });
  });

  return { products, analyses };
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

function mapSupplier(row: Record<string, any>): Supplier {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    status: row.status,
    country: row.country,
    defaultShippingDays: Number(row.default_shipping_days ?? 5),
    allowsDropshipping: Boolean(row.allows_dropshipping),
    notes: row.notes
  };
}

function mapAutomationSettings(row: Record<string, any> | null, userId: string): AutomationSettings {
  return {
    ...demoSettings,
    userId,
    dailyListingLimit: Number(row?.daily_listing_limit ?? demoSettings.dailyListingLimit),
    minProfitAmount: Number(row?.min_profit_amount ?? demoSettings.minProfitAmount),
    minMarginPercentage: Number(row?.min_margin_percentage ?? demoSettings.minMarginPercentage),
    maxShippingDays: Number(row?.max_shipping_days ?? demoSettings.maxShippingDays),
    minStockQuantity: Number(row?.min_stock_quantity ?? demoSettings.minStockQuantity),
    autoListingEnabled: Boolean(row?.auto_listing_enabled ?? demoSettings.autoListingEnabled),
    approvalMode: row?.approval_mode ?? demoSettings.approvalMode,
    riskTolerance: Number(row?.risk_tolerance ?? demoSettings.riskTolerance),
    defaultQuantity: Number(row?.default_quantity ?? demoSettings.defaultQuantity),
    pricingBufferPercentage: Number(row?.pricing_buffer_percentage ?? demoSettings.pricingBufferPercentage),
    promotedListingPercentage: Number(row?.promoted_listing_percentage ?? demoSettings.promotedListingPercentage),
    allowedCategories: row?.allowed_categories ?? demoSettings.allowedCategories,
    blockedCategories: row?.blocked_categories ?? demoSettings.blockedCategories,
    blockedBrands: row?.blocked_brands ?? demoSettings.blockedBrands,
    blockedKeywords: row?.blocked_keywords ?? demoSettings.blockedKeywords,
    supplierPriority: row?.supplier_priority ?? demoSettings.supplierPriority,
    shippingCountryPreference: row?.shipping_country_preference ?? demoSettings.shippingCountryPreference,
    maxPrice: row?.max_price ? Number(row.max_price) : demoSettings.maxPrice,
    minPrice: row?.min_price ? Number(row.min_price) : demoSettings.minPrice,
    requireImageQualityScore: Number(row?.require_image_quality_score ?? demoSettings.requireImageQualityScore),
    requireDemandScore: Number(row?.require_demand_score ?? demoSettings.requireDemandScore),
    newAccountSafeMode: Boolean(row?.new_account_safe_mode ?? demoSettings.newAccountSafeMode)
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

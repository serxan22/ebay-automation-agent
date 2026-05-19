import type {
  AutomationSettings,
  ListingDraft,
  ListingGenerationResult,
  ProductAnalysis,
  SupplierProduct
} from "@/lib/types";

export interface CreateListingDraftInput {
  product: SupplierProduct;
  analysis: ProductAnalysis;
  generatedListing: ListingGenerationResult;
  settings: AutomationSettings;
  optimizedImageUrls?: string[];
  analysisId?: string | null;
}

export function createListingDraft({
  product,
  analysis,
  generatedListing,
  settings,
  optimizedImageUrls,
  analysisId
}: CreateListingDraftInput): ListingDraft {
  const status = analysis.approvedForListing ? "draft" : "rejected";

  return {
    supplierProductId: product.id ?? product.supplierSku,
    analysisId: analysisId ?? null,
    ebayTitle: generatedListing.ebayTitle,
    ebayDescription: generatedListing.ebayDescription,
    ebayCategoryId: null,
    itemSpecifics: generatedListing.itemSpecifics,
    condition: "NEW",
    quantity: Math.min(settings.defaultQuantity, Math.max(product.stockQuantity, 1)),
    price: analysis.recommendedEbayPrice,
    optimizedImageUrls: optimizedImageUrls?.length ? optimizedImageUrls : product.imageUrls,
    status,
    aiGenerated: true
  };
}

export function createSafeFallbackListingGeneration(
  product: SupplierProduct,
  analysis?: ProductAnalysis
): ListingGenerationResult {
  const title = (product.title || product.supplierSku || "Supplier product").replace(/\s+/g, " ").trim().slice(0, 80);
  const description = product.description?.trim() || "Supplier description was not provided. Review this draft before publishing.";

  return {
    ebayTitle: title,
    ebayDescription: `<p>${escapeHtml(description)}</p>`,
    bulletPoints: [],
    itemSpecifics: {},
    categorySuggestion: product.category ?? "General",
    seoKeywords: [],
    shippingNote: `Supplier feed shipping time: ${product.shippingDays} days.`,
    returnNote: "Returns follow the seller's active eBay return policy.",
    conditionNote: "Review supplier data before publishing.",
    warnings: [
      "Safe fallback listing content was used.",
      ...(analysis?.rejectionReasons ?? [])
    ]
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

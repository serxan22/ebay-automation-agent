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

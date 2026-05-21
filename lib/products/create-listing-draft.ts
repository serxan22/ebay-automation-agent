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
  const title = [product.brand && !product.title.toLowerCase().includes(product.brand.toLowerCase()) ? product.brand : "", product.title || product.supplierSku, product.category]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const description = product.description?.trim() || "Supplier description was not provided. Review this draft before publishing.";
  const bulletPoints = [
    product.category ? `Category: ${product.category}` : "General merchandise item",
    product.brand ? `Brand: ${product.brand}` : "Brand information not provided by supplier",
    `Supplier feed handling time: ${product.shippingDays} days`,
    "Listing uses supplier-provided facts only"
  ];

  return {
    ebayTitle: title,
    ebayDescription: `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><ul>${bulletPoints
      .map((point) => `<li>${escapeHtml(point)}</li>`)
      .join("")}</ul><h3>Key Features</h3><ul>${bulletPoints
      .slice(0, 3)
      .map((point) => `<li>${escapeHtml(point)}</li>`)
      .join("")}</ul><p><strong>Package Includes:</strong> Item shown in the supplier listing.</p><p><strong>Shipping:</strong> Estimated handling time is based on supplier data.</p><p><strong>Returns:</strong> Returns follow the seller's active return policy.</p></section>`,
    bulletPoints,
    itemSpecifics: {
      ...(product.brand ? { Brand: product.brand } : {}),
      ...(product.category ? { Type: product.category } : {})
    },
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

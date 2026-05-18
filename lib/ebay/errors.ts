export class EbayIntegrationError extends Error {
  constructor(message: string, public readonly code: string, public readonly recommendation?: string) {
    super(message);
    this.name = "EbayIntegrationError";
  }
}

export function getEbayErrorRecommendation(code: string) {
  const recommendations: Record<string, string> = {
    TOKEN_EXPIRED: "Reconnect eBay or refresh the OAuth token before publishing.",
    MISSING_POLICY_ID: "Go to eBay settings and select payment, return, and fulfillment policies.",
    MISSING_LOCATION: "Create or select an eBay inventory location key.",
    INVALID_CATEGORY: "Review the suggested eBay category and required item specifics.",
    IMAGE_ERROR: "Check optimized image URLs and make sure eBay can access them.",
    DUPLICATE_SKU: "Use a unique SKU or revise the existing inventory item.",
    RATE_LIMIT: "Pause automation and retry after the eBay API limit resets.",
    PUBLISH_FAILED: "Keep the draft, review eBay's error details, and retry from the listings page."
  };

  return recommendations[code] ?? "Review the integration logs for the exact eBay API response.";
}

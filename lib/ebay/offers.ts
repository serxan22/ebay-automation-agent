import { ebayFetch } from "@/lib/ebay/client";
import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface EbayOfferInput {
  sku: string;
  marketplaceId: string;
  format?: "FIXED_PRICE";
  availableQuantity: number;
  categoryId: string;
  listingDescription: string;
  price: number;
  currency: string;
  merchantLocationKey: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  fulfillmentPolicyId: string;
}

export async function createOffer(accessToken: string, input: EbayOfferInput) {
  if (!input.paymentPolicyId || !input.returnPolicyId || !input.fulfillmentPolicyId) {
    throw new EbayIntegrationError("Required eBay policy IDs are missing.", "MISSING_POLICY");
  }

  if (!input.merchantLocationKey) {
    throw new EbayIntegrationError("Inventory location key is missing.", "MISSING_LOCATION");
  }

  if (!input.categoryId) {
    throw new EbayIntegrationError("eBay category ID is required.", "INVALID_CATEGORY");
  }

  return ebayFetch<{ offerId: string }>({
    accessToken,
    path: "/sell/inventory/v1/offer",
    method: "POST",
    marketplaceId: input.marketplaceId,
    body: {
      sku: input.sku,
      marketplaceId: input.marketplaceId,
      format: input.format ?? "FIXED_PRICE",
      availableQuantity: input.availableQuantity,
      categoryId: input.categoryId,
      listingDescription: input.listingDescription,
      includeCatalogProductDetails: false,
      pricingSummary: {
        price: {
          value: input.price.toFixed(2),
          currency: input.currency
        }
      },
      merchantLocationKey: input.merchantLocationKey,
      listingPolicies: {
        paymentPolicyId: input.paymentPolicyId,
        returnPolicyId: input.returnPolicyId,
        fulfillmentPolicyId: input.fulfillmentPolicyId
      }
    }
  });
}

export async function publishOffer(accessToken: string, offerId: string) {
  if (!offerId) {
    throw new EbayIntegrationError("Offer ID is required before publishing.", "PUBLISH_FAILED");
  }

  return ebayFetch<{ listingId: string }>({
    accessToken,
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    method: "POST"
  });
}

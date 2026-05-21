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
  try {
    return await ebayFetch<{ offerId: string }>({
      accessToken,
      method: "POST",
      path: "/sell/inventory/v1/offer",
      body: input,
    });
  } catch (error) {
    const responseBody = (error as { ebay?: { responseBody?: unknown } })?.ebay?.responseBody as
      | { errors?: Array<{ message?: string; parameters?: Array<{ name?: string; value?: string }> }> }
      | undefined;

    const existingOfferId = responseBody?.errors
      ?.find((item) => item.message?.toLowerCase().includes("offer entity already exists"))
      ?.parameters?.find((parameter) => parameter.name === "offerId")?.value;

    if (existingOfferId) {
      return { offerId: existingOfferId };
    }

    throw error;
  }
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

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


function normalizeOfferInput(input: EbayOfferInput): EbayOfferInput {
  return {
    ...input,
    format: input.format ?? "FIXED_PRICE",
    currency: input.currency || "USD",
    price: Number(input.price || 1),
  };
}

export async function createOffer(accessToken: string, input: EbayOfferInput) {
  const normalizedInput = normalizeOfferInput(input);

  try {
    return await ebayFetch<{ offerId: string }>({
      accessToken,
      method: "POST",
      path: "/sell/inventory/v1/offer",
      body: normalizedInput,
    });
  } catch (error) {
    const anyError = error as {
      ebay?: {
        responseBody?: {
          errors?: Array<{
            message?: string;
            parameters?: Array<{ name?: string; value?: string }>;
          }>;
        };
      };
      message?: string;
    };

    const ebayErrors = anyError.ebay?.responseBody?.errors ?? [];
    const existingOfferId = ebayErrors
      .find((item) => item.message?.toLowerCase().includes("offer entity already exists"))
      ?.parameters?.find((parameter) => parameter.name === "offerId")?.value;

    if (existingOfferId) {
      await updateOffer(accessToken, existingOfferId, normalizedInput);
      return { offerId: existingOfferId };
    }

    throw error;
  }
}


export async function updateOffer(accessToken: string, offerId: string, input: EbayOfferInput) {
  if (!offerId) {
    throw new Error("Missing eBay offer id");
  }

  return ebayFetch<{ offerId: string }>({
    accessToken,
    method: "PUT",
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    body: normalizeOfferInput(input),
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

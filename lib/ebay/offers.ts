import { ebayFetch } from "@/lib/ebay/client";

export interface EbayOfferInput {
  sku: string;
  marketplaceId: string;
  format?: "FIXED_PRICE";
  availableQuantity: number;
  categoryId: string;
  listingDescription?: string | null;
  price: number;
  currency?: string | null;
  merchantLocationKey: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  fulfillmentPolicyId: string;
}

function normalizeCurrency(currency?: string | null) {
  const value = String(currency ?? "").trim().toUpperCase();
  return value || "USD";
}

function normalizePrice(price: number) {
  const value = Number(price);

  if (!Number.isFinite(value) || value <= 0) {
    return "1.00";
  }

  return value.toFixed(2);
}

function normalizeQuantity(quantity: number) {
  const value = Number(quantity);

  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.floor(value);
}

function buildOfferBody(input: EbayOfferInput) {
  return {
    sku: input.sku,
    marketplaceId: input.marketplaceId,
    format: input.format ?? "FIXED_PRICE",
    availableQuantity: normalizeQuantity(input.availableQuantity),
    categoryId: input.categoryId,
    listingDescription: input.listingDescription || undefined,
    merchantLocationKey: input.merchantLocationKey,
    listingPolicies: {
      paymentPolicyId: input.paymentPolicyId,
      returnPolicyId: input.returnPolicyId,
      fulfillmentPolicyId: input.fulfillmentPolicyId,
    },
    pricingSummary: {
      price: {
        value: normalizePrice(input.price),
        currency: normalizeCurrency(input.currency),
      },
    },
  };
}

function extractExistingOfferId(error: unknown): string | undefined {
  const directBody = (error as {
    ebay?: {
      responseBody?: {
        errors?: Array<{
          message?: string;
          parameters?: Array<{ name?: string; value?: string }>;
        }>;
      };
    };
  })?.ebay?.responseBody;

  const directErrors = directBody?.errors ?? [];

  for (const item of directErrors) {
    const message = item.message?.toLowerCase() ?? "";

    if (!message.includes("offer entity already exists")) {
      continue;
    }

    const offerId = item.parameters?.find((parameter) => parameter.name === "offerId")?.value;

    if (offerId) {
      return offerId;
    }
  }

  const asText = JSON.stringify(error);

  if (!asText.toLowerCase().includes("offer entity already exists")) {
    return undefined;
  }

  const match = asText.match(/"name"\s*:\s*"offerId"\s*,\s*"value"\s*:\s*"([^"]+)"/);

  return match?.[1];
}

export async function getOffer(accessToken: string, offerId: string) {
  if (!offerId) {
    throw new Error("Missing eBay offer id");
  }

  return ebayFetch<unknown>({
    accessToken,
    method: "GET",
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
  });
}

export async function updateOffer(accessToken: string, offerId: string, input: EbayOfferInput) {
  if (!offerId) {
    throw new Error("Missing eBay offer id");
  }

  await ebayFetch<unknown>({
    accessToken,
    method: "PUT",
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    body: buildOfferBody(input),
  });

  return { offerId };
}

export async function createOffer(accessToken: string, input: EbayOfferInput) {
  const body = buildOfferBody(input);

  try {
    return await ebayFetch<{ offerId: string }>({
      accessToken,
      method: "POST",
      path: "/sell/inventory/v1/offer",
      body,
    });
  } catch (error) {
    const existingOfferId = extractExistingOfferId(error);

    if (!existingOfferId) {
      throw error;
    }

    await getOffer(accessToken, existingOfferId);
    await updateOffer(accessToken, existingOfferId, input);

    return { offerId: existingOfferId };
  }
}

export async function publishOffer(accessToken: string, offerId: string) {
  if (!offerId) {
    throw new Error("Missing eBay offer id");
  }

  return ebayFetch<{ listingId?: string }>({
    accessToken,
    method: "POST",
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
  });
}

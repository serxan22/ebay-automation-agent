import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
  marketplaceId: string;
}

export function getEbayConfig(): EbayConfig {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = process.env.EBAY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new EbayIntegrationError(
      "eBay OAuth environment variables are not configured.",
      "MISSING_EBAY_ENV",
      "Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REDIRECT_URI."
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: process.env.EBAY_ENVIRONMENT === "production" ? "production" : "sandbox",
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
  };
}

export function getEbayApiBaseUrl(environment: "sandbox" | "production") {
  return environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
}

export async function ebayFetch<T>({
  path,
  method = "GET",
  accessToken,
  body,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  accessToken: string;
  body?: unknown;
  marketplaceId?: string;
}): Promise<T> {
  const environment = process.env.EBAY_ENVIRONMENT === "production" ? "production" : "sandbox";
  const response = await fetch(`${getEbayApiBaseUrl(environment)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 401) {
    throw new EbayIntegrationError("eBay token expired or unauthorized.", "TOKEN_EXPIRED");
  }

  if (response.status === 429) {
    throw new EbayIntegrationError("eBay API rate limit reached.", "RATE_LIMIT");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new EbayIntegrationError(`eBay API request failed: ${text}`, "PUBLISH_FAILED");
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

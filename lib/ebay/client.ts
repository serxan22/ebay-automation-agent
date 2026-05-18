import { classifyEbayError, EbayIntegrationError, getEbayErrorRecommendation, stringifyEbayPayload } from "@/lib/ebay/errors";

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
  const requestedEnvironment = process.env.EBAY_ENVIRONMENT ?? "sandbox";

  if (requestedEnvironment === "production") {
    throw new EbayIntegrationError(
      "Production eBay publishing is disabled in Phase 2.",
      "PRODUCTION_DISABLED",
      getEbayErrorRecommendation("PRODUCTION_DISABLED")
    );
  }

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
    environment: "sandbox",
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
  const environment = getEbayConfig().environment;
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

  if (!response.ok) {
    const payload = await readEbayErrorPayload(response);
    const code = classifyEbayError(response.status, payload);
    throw new EbayIntegrationError(
      `eBay API request failed (${response.status}): ${summarizeEbayError(payload)}`,
      code,
      getEbayErrorRecommendation(code),
      payload,
      response.status
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function readEbayErrorPayload(response: Response) {
  const text = await response.text();

  if (!text) {
    return { status: response.status, statusText: response.statusText };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function summarizeEbayError(payload: unknown) {
  const text = stringifyEbayPayload(payload);
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

import { classifyEbayError, EbayIntegrationError, getEbayErrorRecommendation, stringifyEbayPayload } from "@/lib/ebay/errors";
import { getOptionalEnv } from "@/lib/utils/env";

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  runame?: string;
  oauthRedirectUri: string;
  redirectUriMode: "runame" | "url";
  environment: "sandbox" | "production";
  marketplaceId: string;
}

export interface EbayOAuthRuntimeInfo {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  runame?: string;
  oauthRedirectUri?: string;
  redirectUriMode: "runame" | "url";
  environment: "sandbox" | "production";
  marketplaceId: string;
}

export function getEbayOAuthRuntimeInfo(): EbayOAuthRuntimeInfo {
  const clientId = getOptionalEnv("EBAY_CLIENT_ID");
  const clientSecret = getOptionalEnv("EBAY_CLIENT_SECRET");
  const redirectUri = getOptionalEnv("EBAY_REDIRECT_URI");
  const runame = getOptionalEnv("EBAY_RUNAME");
  const requestedEnvironment = getOptionalEnv("EBAY_ENVIRONMENT") === "production" ? "production" : "sandbox";

  return {
    clientId,
    clientSecret,
    redirectUri,
    runame,
    oauthRedirectUri: runame ?? redirectUri,
    redirectUriMode: runame ? "runame" : "url",
    environment: requestedEnvironment,
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
  };
}

export function getEbayConfig(): EbayConfig {
  const runtime = getEbayOAuthRuntimeInfo();
  const clientId = runtime.clientId;
  const clientSecret = runtime.clientSecret;
  const redirectUri = runtime.redirectUri;
  const runame = runtime.runame;
  const requestedEnvironment = runtime.environment;

  if (requestedEnvironment === "production") {
    throw new EbayIntegrationError(
      "Production eBay publishing is disabled.",
      "PRODUCTION_DISABLED",
      getEbayErrorRecommendation("PRODUCTION_DISABLED")
    );
  }

  const missingCredentials = [
    !clientId ? "EBAY_CLIENT_ID" : null,
    !clientSecret ? "EBAY_CLIENT_SECRET" : null
  ].filter((name): name is string => Boolean(name));

  if (!clientId || !clientSecret) {
    throw new EbayIntegrationError(
      `eBay sandbox OAuth credentials are missing: ${missingCredentials.join(", ")}.`,
      "MISSING_EBAY_ENV",
      "Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET from your eBay sandbox application."
    );
  }

  const oauthRedirectUri = runtime.oauthRedirectUri;

  if (!oauthRedirectUri) {
    throw new EbayIntegrationError(
      "eBay OAuth redirect configuration is missing.",
      "MISSING_EBAY_ENV",
      "Add EBAY_RUNAME from the eBay Developer portal. EBAY_REDIRECT_URI can be used only as a fallback callback URL."
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    runame,
    oauthRedirectUri,
    redirectUriMode: runtime.redirectUriMode,
    environment: "sandbox",
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
  };
}

export function getEbayRunameWarning() {
  return getOptionalEnv("EBAY_RUNAME")
    ? null
    : "EBAY_RUNAME is not configured. eBay OAuth expects the RuName as redirect_uri; the app will fall back to EBAY_REDIRECT_URI, but sandbox OAuth may fail with invalid_request until EBAY_RUNAME is set.";
}

export function getEbayApiBaseUrl(environment: "sandbox" | "production") {
  return environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
}

export async function ebayFetch<T>({
  path,
  method = "GET",
  accessToken,
  body,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
  timeoutMs
}: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  accessToken: string;
  body?: unknown;
  marketplaceId?: string;
  timeoutMs?: number;
}): Promise<T> {
  const environment = getEbayConfig().environment;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response: Response;

  try {
    response = await fetch(`${getEbayApiBaseUrl(environment)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EbayIntegrationError(
        `eBay API request timed out after ${timeoutMs}ms.`,
        "PUBLISH_FAILED",
        getEbayErrorRecommendation("PUBLISH_FAILED"),
        { path, method, timeoutMs }
      );
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

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

  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
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

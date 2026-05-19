import { getEbayApiBaseUrl, getEbayConfig } from "@/lib/ebay/client";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";

const scopes = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment"
];

export function buildEbayOAuthUrl(state: string) {
  const config = getEbayConfig();
  const authBase =
    config.environment === "production"
      ? "https://auth.ebay.com/oauth2/authorize"
      : "https://auth.sandbox.ebay.com/oauth2/authorize";
  const url = new URL(authBase);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.oauthRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);

  console.info("[ebay_oauth] authorization_url_params", {
    environment: config.environment,
    marketplace: config.marketplaceId,
    hasClientId: Boolean(config.clientId),
    hasRuname: Boolean(config.runame),
    redirectUriMode: config.redirectUriMode,
    scopesCount: scopes.length
  });

  return url.toString();
}

export function getEbayOAuthScopes() {
  return [...scopes];
}

export async function exchangeEbayCodeForTokens(code: string) {
  const config = getEbayConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${getEbayApiBaseUrl(config.environment)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.oauthRedirectUri
    })
  });

  if (!response.ok) {
    throw new EbayIntegrationError(
      `eBay token exchange failed (${response.status}): ${await response.text()}`,
      "TOKEN_EXCHANGE_FAILED",
      getEbayErrorRecommendation("TOKEN_EXCHANGE_FAILED"),
      { status: response.status, statusText: response.statusText },
      response.status
    );
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in: number;
    scope?: string;
  };
}

export async function getEbayUserIdentity(accessToken: string) {
  const config = getEbayConfig();
  const response = await fetch(`${getEbayApiBaseUrl(config.environment)}/commerce/identity/v1/user/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`eBay identity lookup failed (${response.status}).`);
  }

  return (await response.json()) as {
    userId?: string;
    username?: string;
  };
}

export async function refreshEbayAccessToken(refreshToken: string) {
  const config = getEbayConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${getEbayApiBaseUrl(config.environment)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: scopes.join(" ")
    })
  });

  if (!response.ok) {
    throw new EbayIntegrationError(
      `eBay token refresh failed (${response.status}): ${await response.text()}`,
      "TOKEN_EXPIRED",
      getEbayErrorRecommendation("TOKEN_EXPIRED"),
      { status: response.status, statusText: response.statusText },
      response.status
    );
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

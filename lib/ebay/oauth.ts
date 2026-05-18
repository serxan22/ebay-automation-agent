import { getAppUrl } from "@/lib/utils/env";
import { getEbayApiBaseUrl, getEbayConfig } from "@/lib/ebay/client";

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
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
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
      redirect_uri: config.redirectUri || `${getAppUrl()}/api/ebay/oauth/callback`
    })
  });

  if (!response.ok) {
    throw new Error(`eBay token exchange failed: ${await response.text()}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in: number;
    scope?: string;
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
    throw new Error(`eBay token refresh failed: ${await response.text()}`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

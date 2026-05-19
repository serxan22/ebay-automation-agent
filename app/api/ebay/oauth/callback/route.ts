import { NextResponse } from "next/server";
import { z } from "zod";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayConfig } from "@/lib/ebay/client";
import { exchangeEbayCodeForTokens, getEbayOAuthScopes, getEbayUserIdentity } from "@/lib/ebay/oauth";
import { validateAndConsumeEbayOAuthState } from "@/lib/ebay/oauth-state";
import { createSupabaseServiceClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/utils/crypto";

const oauthCallbackSchema = z.object({
  code: z.string().min(1).nullable(),
  state: z.string().min(1).nullable(),
  error: z.string().nullable(),
  errorDescription: z.string().nullable()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = oauthCallbackSchema.parse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
    errorDescription: url.searchParams.get("error_description")
  });
  let supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
  let userId: string | null = null;

  console.info("[ebay_oauth] callback_received", {
    hasCode: Boolean(parsed.code),
    hasState: Boolean(parsed.state),
    hasError: Boolean(parsed.error)
  });

  if (parsed.error) {
    return redirectToSettings(
      request,
      parsed.errorDescription ? `eBay authorization declined: ${parsed.errorDescription}` : "eBay authorization declined."
    );
  }

  if (!parsed.code || !parsed.state) {
    return redirectToSettings(request, "Missing eBay OAuth code or state. Start Connect sandbox again.");
  }

  try {
    if (!hasSupabaseServerEnv()) {
      return redirectToSettings(request, "supabase_not_configured");
    }

    supabase = createSupabaseServiceClient();
    const config = getEbayConfig();
    const stateRecord = await validateAndConsumeEbayOAuthState({
      supabase,
      state: parsed.state
    });
    userId = stateRecord.user_id;

    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_oauth",
      message: "ebay_oauth_callback_received",
      metadata: {
        hasCode: Boolean(parsed.code),
        hasState: Boolean(parsed.state),
        stateFound: true,
        resolvedUserId: userId,
        environment: config.environment,
        marketplace: config.marketplaceId,
        hasClientId: Boolean(config.clientId),
        hasRuname: Boolean(config.runame),
        redirectUriMode: config.redirectUriMode,
        scopeCount: getEbayOAuthScopes().length
      }
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_oauth",
      message: "ebay_oauth_state_validated",
      metadata: {
        stateId: stateRecord.id,
        resolvedUserId: userId
      }
    });

    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_oauth",
      message: "ebay_oauth_token_exchange_started",
      metadata: {
        environment: config.environment,
        marketplace: config.marketplaceId,
        hasCode: true,
        redirectUriMode: config.redirectUriMode
      }
    });

    let tokens: Awaited<ReturnType<typeof exchangeEbayCodeForTokens>>;

    try {
      tokens = await exchangeEbayCodeForTokens(parsed.code);
      await logAutomationEvent({
        supabase,
        userId,
        level: "success",
        module: "ebay_oauth",
        message: "ebay_oauth_token_exchange_success",
        metadata: {
          tokenExchangeSuccess: true,
          scopeCount: tokens.scope?.split(" ").filter(Boolean).length ?? getEbayOAuthScopes().length
        }
      });
    } catch (error) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_oauth",
        message: "ebay_oauth_token_exchange_failed",
        metadata: safeErrorMetadata(error, {
          tokenExchangeSuccess: false,
          redirectUriMode: config.redirectUriMode
        })
      });
      throw error;
    }

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("eBay OAuth response did not include access and refresh tokens.");
    }

    const ebayUserId = await resolveEbayUserId(tokens.access_token);
    const now = Date.now();
    const tokenExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
    const refreshTokenExpiresAt = tokens.refresh_token_expires_in
      ? new Date(now + tokens.refresh_token_expires_in * 1000).toISOString()
      : null;

    try {
      const { error } = await supabase.from("ebay_accounts").upsert(
        {
          user_id: userId,
          ebay_user_id: ebayUserId,
          marketplace: config.marketplaceId,
          access_token_encrypted: encryptSecret(tokens.access_token),
          refresh_token_encrypted: encryptSecret(tokens.refresh_token),
          token_expires_at: tokenExpiresAt,
          refresh_token_expires_at: refreshTokenExpiresAt,
          oauth_scopes: tokens.scope?.split(" ").filter(Boolean) ?? getEbayOAuthScopes(),
          status: "connected",
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,marketplace" }
      );

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_oauth",
        message: "ebay_oauth_account_save_failed",
        metadata: safeErrorMetadata(error, {
          accountSaveSuccess: false,
          marketplace: config.marketplaceId
        })
      });
      throw error;
    }

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_oauth",
      message: "ebay_oauth_account_saved",
      metadata: {
        marketplace: config.marketplaceId,
        ebayUserId,
        tokenExpiresAt,
        refreshTokenExpiresAt,
        accountSaveSuccess: true
      }
    });

    const redirectUrl = new URL("/dashboard/settings", request.url);
    redirectUrl.searchParams.set("ebay", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("[ebay_oauth] callback_failed", {
      ...safeErrorMetadata(error),
      resolvedUserId: userId
    });

    return redirectToSettings(request, toSafeOAuthMessage(error));
  }
}

function redirectToSettings(request: Request, message: string) {
  const redirectUrl = new URL("/dashboard/settings", request.url);
  redirectUrl.searchParams.set("ebay", "error");
  redirectUrl.searchParams.set("message", message);
  return NextResponse.redirect(redirectUrl);
}

async function resolveEbayUserId(accessToken: string) {
  try {
    const identity = await getEbayUserIdentity(accessToken);
    return identity.userId ?? identity.username ?? null;
  } catch (error) {
    console.warn("[ebay_oauth] identity_lookup_skipped", safeErrorMetadata(error));
    return null;
  }
}

function toSafeOAuthMessage(error: unknown) {
  if (error instanceof Error) {
    if (/token exchange/i.test(error.message)) {
      return "eBay token exchange failed. Check EBAY_RUNAME, sandbox keys, and the Auth accepted URL, then connect again.";
    }

    if (/OAuth state/i.test(error.message)) {
      return error.message;
    }

    if (/save|upsert|ebay_accounts|row-level security|rls/i.test(error.message)) {
      return "eBay connected, but saving the sandbox account failed. Check Supabase migration and service role env values.";
    }

    return error.message.slice(0, 180);
  }

  return "eBay OAuth callback failed.";
}

function safeErrorMetadata(error: unknown, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown eBay OAuth error."
  };
}

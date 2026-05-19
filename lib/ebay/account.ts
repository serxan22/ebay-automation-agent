import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";
import { refreshEbayAccessToken } from "@/lib/ebay/oauth";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";

export interface EbayAccountRecord {
  id: string;
  user_id: string;
  ebay_user_id?: string | null;
  marketplace: string;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  oauth_scopes?: string[] | null;
  last_token_refresh_at?: string | null;
  payment_policy_id?: string | null;
  payment_policy_name?: string | null;
  return_policy_id?: string | null;
  return_policy_name?: string | null;
  fulfillment_policy_id?: string | null;
  fulfillment_policy_name?: string | null;
  inventory_location_key?: string | null;
  inventory_location_name?: string | null;
  inventory_location_status?: string | null;
  last_policy_sync_at?: string | null;
  last_location_sync_at?: string | null;
  status: string;
}

export async function getEbayAccount({
  supabase,
  userId,
  marketplace = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplace?: string;
}) {
  const { data, error } = await supabase
    .from("ebay_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("marketplace", marketplace)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as EbayAccountRecord | null;
}

export async function requireEbayAccount(input: {
  supabase: SupabaseClient;
  userId: string;
  marketplace?: string;
}) {
  const account = await getEbayAccount(input);

  if (!account || account.status !== "connected") {
    throw new EbayIntegrationError(
      "eBay sandbox account is not connected.",
      "TOKEN_EXPIRED",
      "Connect eBay sandbox from Settings before publishing."
    );
  }

  return account;
}

export async function getValidEbayAccessToken({
  supabase,
  userId,
  marketplace
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplace?: string;
}) {
  const account = await requireEbayAccount({ supabase, userId, marketplace });

  if (!account.access_token_encrypted || !account.refresh_token_encrypted) {
    throw new EbayIntegrationError(
      "Encrypted eBay tokens are missing.",
      "TOKEN_EXPIRED",
      getEbayErrorRecommendation("TOKEN_EXPIRED")
    );
  }

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const refreshBufferMs = 5 * 60 * 1000;

  if (expiresAt > Date.now() + refreshBufferMs) {
    return {
      account,
      accessToken: decryptSecret(account.access_token_encrypted)
    };
  }

  const refreshToken = decryptSecret(account.refresh_token_encrypted);
  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_oauth",
    message: "ebay_token_refresh_started",
    metadata: {
      marketplace: account.marketplace,
      tokenExpiresAt: account.token_expires_at
    }
  });

  let refreshed: Awaited<ReturnType<typeof refreshEbayAccessToken>>;

  try {
    refreshed = await refreshEbayAccessToken(refreshToken);
  } catch (error) {
    await supabase
      .from("ebay_accounts")
      .update({
        status: "expired",
        last_token_refresh_at: new Date().toISOString()
      })
      .eq("id", account.id);

    await logAutomationEvent({
      supabase,
      userId,
      level: "error",
      module: "ebay_oauth",
      message: "ebay_token_refresh_failed",
      metadata: {
        marketplace: account.marketplace,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Token refresh failed."
      }
    });

    throw new EbayIntegrationError(
      "eBay sandbox token refresh failed. Reconnect eBay sandbox from Settings.",
      "TOKEN_EXPIRED",
      getEbayErrorRecommendation("TOKEN_EXPIRED")
    );
  }

  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const { data, error } = await supabase
    .from("ebay_accounts")
    .update({
      access_token_encrypted: encryptSecret(refreshed.access_token),
      token_expires_at: tokenExpiresAt,
      last_token_refresh_at: new Date().toISOString(),
      status: "connected"
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_oauth",
    message: "ebay_token_refresh_success",
    metadata: { marketplace: account.marketplace, tokenExpiresAt }
  });

  return {
    account: data as EbayAccountRecord,
    accessToken: refreshed.access_token
  };
}

export function hasRequiredSellerSetup(account: EbayAccountRecord) {
  return Boolean(
    account.payment_policy_id &&
      account.return_policy_id &&
      account.fulfillment_policy_id &&
      account.inventory_location_key
  );
}

export async function disconnectEbayAccount({
  supabase,
  userId,
  marketplace = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplace?: string;
}) {
  const { data, error } = await supabase
    .from("ebay_accounts")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      refresh_token_expires_at: null,
      last_token_refresh_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("marketplace", marketplace)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_oauth",
    message: "ebay_sandbox_disconnected",
    metadata: { marketplace }
  });

  return data as EbayAccountRecord | null;
}

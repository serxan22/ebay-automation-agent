import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayConfig } from "@/lib/ebay/client";
import { exchangeEbayCodeForTokens, getEbayOAuthScopes } from "@/lib/ebay/oauth";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/utils/crypto";

const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().uuid()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = oauthCallbackSchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state")
  });

  if (!parsed.success) {
    return redirectToSettings(request, "missing_oauth_code");
  }

  try {
    if (!hasSupabaseServerEnv()) {
      return redirectToSettings(request, "supabase_not_configured");
    }

    const expectedState = cookies().get("ebay_oauth_state")?.value;

    if (!expectedState || parsed.data.state !== expectedState) {
      return redirectToSettings(request, "invalid_oauth_state");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const config = getEbayConfig();
    const tokens = await exchangeEbayCodeForTokens(parsed.data.code);
    const now = Date.now();
    const tokenExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(now + tokens.refresh_token_expires_in * 1000).toISOString();

    const { error } = await supabase.from("ebay_accounts").upsert(
      {
        user_id: user.id,
        marketplace: config.marketplaceId,
        access_token_encrypted: encryptSecret(tokens.access_token),
        refresh_token_encrypted: encryptSecret(tokens.refresh_token),
        token_expires_at: tokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        oauth_scopes: tokens.scope?.split(" ") ?? getEbayOAuthScopes(),
        status: "connected"
      },
      { onConflict: "user_id,marketplace" }
    );

    if (error) {
      throw new Error(error.message);
    }

    await logAutomationEvent({
      supabase,
      userId: user.id,
      level: "success",
      module: "ebay_oauth",
      message: "eBay sandbox OAuth connected.",
      metadata: {
        marketplace: config.marketplaceId,
        tokenExpiresAt,
        refreshTokenExpiresAt
      }
    });

    cookies().delete("ebay_oauth_state");
    const redirectUrl = new URL("/dashboard/settings", request.url);
    redirectUrl.searchParams.set("ebay", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return redirectToSettings(request, error instanceof Error ? error.message : "oauth_callback_failed");
  }
}

function redirectToSettings(request: Request, message: string) {
  const redirectUrl = new URL("/dashboard/settings", request.url);
  redirectUrl.searchParams.set("ebay", "error");
  redirectUrl.searchParams.set("message", message);
  return NextResponse.redirect(redirectUrl);
}

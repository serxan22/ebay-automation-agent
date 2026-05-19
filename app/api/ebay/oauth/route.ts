import { NextResponse } from "next/server";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayConfig } from "@/lib/ebay/client";
import { buildEbayOAuthUrl } from "@/lib/ebay/oauth";
import { createEbayOAuthState } from "@/lib/ebay/oauth-state";
import { createSupabaseServerClient, createSupabaseServiceClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerEnv()) {
      return redirectToSettings(request, "supabase_not_configured");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const serviceSupabase = createSupabaseServiceClient();
    const config = getEbayConfig();

    await logAutomationEvent({
      supabase: serviceSupabase,
      userId: user.id,
      level: "info",
      module: "ebay_oauth",
      message: "ebay_oauth_started",
      metadata: {
        environment: config.environment,
        marketplace: config.marketplaceId,
        hasClientId: Boolean(config.clientId),
        hasRuname: Boolean(config.runame),
        redirectUriMode: config.redirectUriMode
      }
    });

    const oauthState = await createEbayOAuthState({
      supabase: serviceSupabase,
      userId: user.id
    });

    await logAutomationEvent({
      supabase: serviceSupabase,
      userId: user.id,
      level: "success",
      module: "ebay_oauth",
      message: "ebay_oauth_state_saved",
      metadata: {
        stateId: oauthState.id,
        createdAt: oauthState.created_at
      }
    });

    return NextResponse.redirect(buildEbayOAuthUrl(oauthState.state));
  } catch (error) {
    console.error("[ebay_oauth] start_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "OAuth start failed."
    });
    return redirectToSettings(request, error instanceof Error ? error.message : "oauth_start_failed");
  }
}

function redirectToSettings(request: Request, message: string) {
  const url = new URL("/dashboard/settings", request.url);
  url.searchParams.set("ebay", "error");
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

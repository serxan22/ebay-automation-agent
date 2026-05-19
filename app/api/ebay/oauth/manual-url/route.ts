import { NextResponse } from "next/server";
import { getEbayConfig } from "@/lib/ebay/client";
import { buildEbayOAuthUrl, getExpectedEbayCallbackUrl } from "@/lib/ebay/oauth";
import { createEbayOAuthState } from "@/lib/ebay/oauth-state";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await getAuthenticatedApiContext();
    const config = getEbayConfig();

    if (!config.runame) {
      return NextResponse.json(
        {
          ok: false,
          error: "EBAY_RUNAME is missing. eBay OAuth must use the RuName as redirect_uri."
        },
        { status: 400 }
      );
    }

    const serviceSupabase = createSupabaseServiceClient();
    const oauthState = await createEbayOAuthState({
      supabase: serviceSupabase,
      userId: user.id
    });

    return NextResponse.json({
      authorizeUrl: buildEbayOAuthUrl(oauthState.state),
      state: oauthState.state,
      stateId: oauthState.id,
      runame: config.runame,
      expectedCallbackUrl: getExpectedEbayCallbackUrl()
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create manual eBay OAuth URL."
      },
      { status: 400 }
    );
  }
}

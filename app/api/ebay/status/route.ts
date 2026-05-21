import { NextResponse } from "next/server";
import { getEbayAccount } from "@/lib/ebay/account";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();

    const account = await getEbayAccount({ supabase, userId: user.id });

    return NextResponse.json({
      ok: true,
      connected: account?.status === "connected",
      account: account
        ? {
            ebayUserId: account.ebay_user_id,
            marketplace: account.marketplace,
            status: account.status,
            tokenExpiresAt: account.token_expires_at,
            hasRefreshToken: Boolean(account.refresh_token_encrypted),
            policies: {
              payment: Boolean(account.payment_policy_id),
              return: Boolean(account.return_policy_id),
              fulfillment: Boolean(account.fulfillment_policy_id),
              paymentPolicyId: account.payment_policy_id,
              returnPolicyId: account.return_policy_id,
              fulfillmentPolicyId: account.fulfillment_policy_id
            },
            inventoryLocation: {
              present: Boolean(account.inventory_location_key),
              key: account.inventory_location_key,
              status: account.inventory_location_status
            }
          }
        : null
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: error instanceof Error ? error.message : "Unable to load eBay status.",
        message: error instanceof Error ? error.message : "Unable to load eBay status.",
        code: "EBAY_STATUS_FAILED",
        recommendation: "Reconnect sandbox OAuth or inspect Settings diagnostics.",
        details: null
      },
      { status: 400 }
    );
  }
}

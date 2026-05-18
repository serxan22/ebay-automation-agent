import { NextResponse } from "next/server";
import { getEbayAccount } from "@/lib/ebay/account";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();

    const account = await getEbayAccount({ supabase, userId: user.id });

    return NextResponse.json({
      connected: account?.status === "connected",
      account: account
        ? {
            marketplace: account.marketplace,
            status: account.status,
            tokenExpiresAt: account.token_expires_at,
            paymentPolicyId: account.payment_policy_id,
            returnPolicyId: account.return_policy_id,
            fulfillmentPolicyId: account.fulfillment_policy_id,
            inventoryLocationKey: account.inventory_location_key
          }
        : null
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { connected: false, error: error instanceof Error ? error.message : "Unable to load eBay status." },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { getEbayAccount } from "@/lib/ebay/account";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export async function GET() {
  try {
    if (!hasSupabaseServerEnv()) {
      return NextResponse.json({ connected: false, reason: "Supabase is not configured." });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ connected: false, reason: "Authentication is required." }, { status: 401 });
    }

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
    return NextResponse.json(
      { connected: false, error: error instanceof Error ? error.message : "Unable to load eBay status." },
      { status: 400 }
    );
  }
}

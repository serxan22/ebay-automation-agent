import { NextResponse } from "next/server";
import { disconnectEbayAccount } from "@/lib/ebay/account";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const account = await disconnectEbayAccount({
      supabase,
      userId: user.id
    });

    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to disconnect eBay sandbox." },
      { status: 400 }
    );
  }
}

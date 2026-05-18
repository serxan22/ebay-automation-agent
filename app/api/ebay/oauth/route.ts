import { NextResponse } from "next/server";
import { buildEbayOAuthUrl } from "@/lib/ebay/oauth";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    return NextResponse.redirect(buildEbayOAuthUrl(state));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start eBay OAuth." },
      { status: 400 }
    );
  }
}

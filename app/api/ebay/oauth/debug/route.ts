import { NextResponse } from "next/server";
import { getEbayOAuthDebugInfo } from "@/lib/ebay/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getEbayOAuthDebugInfo());
}

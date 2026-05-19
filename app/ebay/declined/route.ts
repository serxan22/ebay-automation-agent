import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const redirectUrl = new URL("/dashboard/settings", request.url);
  redirectUrl.searchParams.set("ebay", "declined");
  return NextResponse.redirect(redirectUrl);
}

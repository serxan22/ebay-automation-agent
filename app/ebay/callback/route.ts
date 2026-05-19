import { handleEbayOAuthCallback } from "@/lib/ebay/oauth-callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleEbayOAuthCallback(request);
}

import { NextResponse } from "next/server";
import { exchangeEbayCodeForTokens } from "@/lib/ebay/oauth";
import { encryptSecret } from "@/lib/utils/crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing eBay OAuth code." }, { status: 400 });
  }

  try {
    const tokens = await exchangeEbayCodeForTokens(code);

    return NextResponse.json({
      status: "connected",
      accessTokenEncryptedPreview: encryptSecret(tokens.access_token).slice(0, 16),
      refreshTokenEncryptedPreview: encryptSecret(tokens.refresh_token).slice(0, 16),
      expiresIn: tokens.expires_in,
      note: "Persist encrypted tokens into ebay_accounts after Supabase auth is connected."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "eBay OAuth callback failed." },
      { status: 400 }
    );
  }
}

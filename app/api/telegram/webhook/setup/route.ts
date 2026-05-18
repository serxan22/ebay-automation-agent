import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/utils/env";
import { getTelegramWebhookInfo, setTelegramWebhook } from "@/lib/telegram/bot";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const info = await getTelegramWebhookInfo();
    return NextResponse.json({ ok: true, info: info?.result ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Telegram webhook info." },
      { status: 400 }
    );
  }
}

export async function POST() {
  try {
    await getAuthenticatedApiContext();

    const appUrl = getAppUrl().replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    const result = await setTelegramWebhook(webhookUrl);

    return NextResponse.json({ ok: true, webhookUrl, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to set Telegram webhook." },
      { status: 400 }
    );
  }
}

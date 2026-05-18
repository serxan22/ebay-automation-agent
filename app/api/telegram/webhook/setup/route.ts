import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/utils/env";
import { getTelegramWebhookInfo, setTelegramWebhook } from "@/lib/telegram/bot";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

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
    if (!hasSupabaseServerEnv()) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const appUrl = getAppUrl().replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    const result = await setTelegramWebhook(webhookUrl);

    return NextResponse.json({ ok: true, webhookUrl, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to set Telegram webhook." },
      { status: 400 }
    );
  }
}

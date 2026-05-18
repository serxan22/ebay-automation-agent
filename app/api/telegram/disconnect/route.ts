import { NextResponse } from "next/server";
import { logAutomationEvent } from "@/lib/automation/logging";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

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

    const { error } = await supabase
      .from("telegram_connections")
      .update({ status: "disconnected" })
      .eq("user_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    await logAutomationEvent({
      supabase,
      userId: user.id,
      level: "info",
      module: "telegram",
      message: "Telegram chat disconnected."
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to disconnect Telegram." },
      { status: 400 }
    );
  }
}

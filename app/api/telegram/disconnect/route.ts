import { NextResponse } from "next/server";
import { logAutomationEvent } from "@/lib/automation/logging";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();

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
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to disconnect Telegram." },
      { status: 400 }
    );
  }
}

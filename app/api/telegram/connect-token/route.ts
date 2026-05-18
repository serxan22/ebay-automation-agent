import { NextResponse } from "next/server";
import { createTelegramConnectionToken } from "@/lib/telegram/connection";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();

    const token = await createTelegramConnectionToken({
      supabase,
      userId: user.id
    });

    return NextResponse.json({ ok: true, ...token });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Telegram connection code." },
      { status: 400 }
    );
  }
}

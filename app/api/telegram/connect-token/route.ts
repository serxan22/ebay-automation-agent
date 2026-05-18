import { NextResponse } from "next/server";
import { createTelegramConnectionToken } from "@/lib/telegram/connection";
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

    const token = await createTelegramConnectionToken({
      supabase,
      userId: user.id
    });

    return NextResponse.json({ ok: true, ...token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Telegram connection code." },
      { status: 400 }
    );
  }
}

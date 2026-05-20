import { NextResponse } from "next/server";
import { getSystemHealth } from "@/lib/system/health-check";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const health = await getSystemHealth({ supabase, user });

    return NextResponse.json({ ok: true, health });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "System health check failed."
      },
      { status: 400 }
    );
  }
}

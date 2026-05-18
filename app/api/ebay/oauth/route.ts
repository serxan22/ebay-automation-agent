import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildEbayOAuthUrl } from "@/lib/ebay/oauth";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerEnv()) {
      return redirectToSettings(request, "supabase_not_configured");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const state = crypto.randomUUID();
    cookies().set("ebay_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60
    });

    return NextResponse.redirect(buildEbayOAuthUrl(state));
  } catch (error) {
    return redirectToSettings(request, error instanceof Error ? error.message : "oauth_start_failed");
  }
}

function redirectToSettings(request: Request, message: string) {
  const url = new URL("/dashboard/settings", request.url);
  url.searchParams.set("ebay", "error");
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export class ApiAuthError extends Error {
  constructor(message: string, public readonly status = 401) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export interface AuthenticatedApiContext {
  supabase: SupabaseClient;
  user: User;
}

export async function getAuthenticatedApiContext(): Promise<AuthenticatedApiContext> {
  if (!hasSupabaseServerEnv()) {
    throw new ApiAuthError("Supabase authentication is not configured.", 500);
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiAuthError("Authentication is required. Please sign in and try again.", 401);
  }

  return { supabase, user };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return null;
}

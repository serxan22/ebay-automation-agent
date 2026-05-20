import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { requestSellingPolicyManagementOptIn } from "@/lib/ebay/programs";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    userId = context.user.id;

    const result = await requestSellingPolicyManagementOptIn({
      supabase,
      userId
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizePublishError(error);

    if (supabase && userId) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_programs",
        message: "ebay_selling_policy_opt_in_failed",
        metadata: {
          error: normalized.message,
          code: normalized.code,
          recommendation: normalized.recommendation,
          details: normalized.details
        }
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: normalized.message,
        code: normalized.code,
        recommendation: normalized.recommendation
      },
      { status: 400 }
    );
  }
}

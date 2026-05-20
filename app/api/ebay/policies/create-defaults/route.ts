import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { createDefaultSellerPolicies } from "@/lib/ebay/policies";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    userId = context.user.id;

    const result = await createDefaultSellerPolicies({
      supabase,
      userId,
      marketplaceId: "EBAY_US"
    });

    return NextResponse.json({
      ok: true,
      message: "Default sandbox seller policies created and synced.",
      created: result.created,
      policies: result.policies,
      account: result.account
    });
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
        module: "ebay_policies",
        message: "ebay_default_policies_create_failed",
        metadata: {
          marketplaceId: "EBAY_US",
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

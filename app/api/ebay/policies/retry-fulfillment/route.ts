import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { retryFulfillmentPolicy } from "@/lib/ebay/policies";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    userId = context.user.id;

    const result = await retryFulfillmentPolicy({
      supabase,
      userId,
      marketplaceId: "EBAY_US"
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
        module: "ebay_policies",
        message: "ebay_fulfillment_retry_failed",
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
        partial: true,
        fulfillmentPolicyStored: false,
        paymentPolicyStored: false,
        returnPolicyStored: false,
        message: normalized.message,
        error: normalized.message,
        code: normalized.code,
        recommendation: normalized.recommendation,
        attempts: [],
        ebayErrors: [],
        details: normalized.details
      },
      { status: 400 }
    );
  }
}

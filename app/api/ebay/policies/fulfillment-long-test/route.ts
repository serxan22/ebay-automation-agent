import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { runFulfillmentPolicyLongTest } from "@/lib/ebay/policies";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export const maxDuration = 60;

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    userId = context.user.id;

    const result = await runFulfillmentPolicyLongTest({
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
        message: "ebay_fulfillment_long_test_failed",
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
        created: false,
        timedOut: false,
        timeoutMs: 45_000,
        serviceCode: "USPSFirstClass",
        schemaVariant: "buyer_paid_minimal",
        ebayResponse: normalized.details ?? null,
        ebayErrors: [],
        recommendation: normalized.recommendation,
        fulfillmentPolicyStored: false,
        message: normalized.message,
        error: normalized.message,
        code: normalized.code
      },
      { status: 400 }
    );
  }
}

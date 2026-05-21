import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { runFulfillmentPolicyDocsTest } from "@/lib/ebay/policies";
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

    const result = await runFulfillmentPolicyDocsTest({
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
        message: "ebay_fulfillment_docs_test_failed",
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
        schemaVariant: "official_docs_sample",
        code: normalized.code,
        message: normalized.message,
        status: null,
        timedOut: false,
        timeoutMs: 45_000,
        endpoint: "/sell/account/v1/fulfillment_policy/",
        requestBodyUsed: null,
        responseBody: normalized.details ?? null,
        locationHeader: null,
        fulfillmentPolicyId: null,
        details: normalized.details,
        recommendation: normalized.recommendation ?? "Review the server logs for the docs fulfillment test failure.",
        errorSummary: normalized.message,
        error: normalized.message,
        ebayErrors: []
      },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { retryFulfillmentPolicyStep } from "@/lib/ebay/policies";
import { normalizePublishError } from "@/lib/ebay/publish";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

const requestSchema = z.object({
  attemptIndex: z.number().int().min(0).optional()
});

export async function POST(request: Request) {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    userId = context.user.id;
    const body = await request.json().catch(() => ({}));
    const payload = requestSchema.parse(body);
    const result = await retryFulfillmentPolicyStep({
      supabase,
      userId,
      marketplaceId: "EBAY_US",
      attemptIndex: payload.attemptIndex
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
        message: "ebay_fulfillment_step_failed",
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
        completed: false,
        nextAttemptIndex: null,
        attempt: null,
        fulfillmentPolicyStored: false,
        message: normalized.message,
        error: normalized.message,
        code: normalized.code,
        recommendation: normalized.recommendation,
        attempts: [],
        details: normalized.details
      },
      { status: 400 }
    );
  }
}

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { normalizePublishError } from "@/lib/ebay/publish";
import { syncSellerPolicies } from "@/lib/ebay/policies";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function POST() {
  let supabase: SupabaseClient | null = null;
  let userId: string | null = null;

  try {
    const context = await getAuthenticatedApiContext();
    supabase = context.supabase;
    const user = context.user;
    userId = user.id;
    const result = await syncSellerPolicies({
      supabase,
      userId: user.id
    });

    return NextResponse.json({
      ok: true,
      policies: result.policies,
      account: result.account
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    const normalized = normalizePublishError(error);
    const isSellingPolicyOptInError =
      normalized.code === "BUSINESS_POLICY_NOT_ELIGIBLE" || normalized.code === "SELLING_POLICY_NOT_OPTED_IN";
    const sellingPolicyOptInMessage =
      "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again.";

    if (supabase && userId) {
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_policies",
        message: "ebay_policy_sync_failed",
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
        error: isSellingPolicyOptInError ? sellingPolicyOptInMessage : normalized.message,
        message: isSellingPolicyOptInError ? sellingPolicyOptInMessage : normalized.message,
        code: normalized.code,
        recommendation:
          (isSellingPolicyOptInError ? sellingPolicyOptInMessage : normalized.recommendation) ??
          "Make sure the sandbox seller is opted into Business Policies and has payment, return, and fulfillment policies.",
        details: normalized.details
      },
      { status: 400 }
    );
  }
}

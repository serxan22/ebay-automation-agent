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
      partial: result.partial,
      message: result.partial
        ? buildPartialPolicyMessage(result.missing, result.policyStatus)
        : "Default sandbox seller policies created and synced.",
      created: result.created,
      policyStatus: result.policyStatus,
      errors: result.errors,
      missing: result.missing,
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

function buildPartialPolicyMessage(
  missing: string[],
  policyStatus: Record<string, { status: string; error?: string; policyName?: string | null }>
) {
  const createdOrStored = [
    policyStatus.paymentPolicy?.policyName ? `Payment policy: ${policyStatus.paymentPolicy.policyName}` : "",
    policyStatus.returnPolicy?.policyName ? `Return policy: ${policyStatus.returnPolicy.policyName}` : "",
    policyStatus.fulfillmentPolicy?.policyName ? `Fulfillment policy: ${policyStatus.fulfillmentPolicy.policyName}` : ""
  ].filter(Boolean);
  const fulfillmentError = policyStatus.fulfillmentPolicy?.error;
  const hasPaymentAndReturn = Boolean(policyStatus.paymentPolicy?.policyName && policyStatus.returnPolicy?.policyName);

  if (missing.includes("fulfillment policy") && hasPaymentAndReturn) {
    return [
      "Payment and return policies are ready, but fulfillment policy creation is still failing.",
      fulfillmentError ? `Last fulfillment error: ${fulfillmentError}` : "",
      "Click Discover shipping services, then Retry fulfillment policy.",
      createdOrStored.length ? `Current policies: ${createdOrStored.join("; ")}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Default seller policy setup is partially complete. Missing: ${missing.join(", ")}.`,
    "Click Create default seller policies again to retry missing policies.",
    createdOrStored.length ? `Current policies: ${createdOrStored.join("; ")}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

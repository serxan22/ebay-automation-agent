import { NextResponse } from "next/server";
import { getEbayAccount, getValidEbayAccessToken } from "@/lib/ebay/account";
import { getSellerPolicyCollections, type SellerPolicy } from "@/lib/ebay/policies";
import { getOptedInPrograms, SELLING_POLICY_MANAGEMENT } from "@/lib/ebay/programs";
import { authErrorResponse, getAuthenticatedApiContext } from "@/lib/supabase/api-auth";

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedApiContext();
    const account = await getEbayAccount({ supabase, userId: user.id });

    if (!account || account.status !== "connected") {
      return NextResponse.json(
        {
          connected: false,
          error: "eBay sandbox account is not connected."
        },
        { status: 400 }
      );
    }

    const { accessToken } = await getValidEbayAccessToken({
      supabase,
      userId: user.id,
      marketplace: account.marketplace
    });
    const [programs, policies] = await Promise.all([
      getOptedInPrograms(accessToken),
      getSellerPolicyCollections(accessToken, account.marketplace)
    ]);
    const optedInProgramTypes = (programs.programs ?? []).map((program) => program.programType);
    const { data: recentLogs } = await supabase
      .from("automation_logs")
      .select("message,level,metadata_json,created_at")
      .eq("user_id", user.id)
      .eq("module", "ebay_policies")
      .in("message", [
        "ebay_fulfillment_retry_attempt",
        "ebay_fulfillment_retry_attempt_failed",
        "ebay_fulfillment_retry_success",
        "ebay_fulfillment_retry_failed",
        "ebay_default_fulfillment_policy_attempt",
        "ebay_default_fulfillment_policy_attempt_failed",
        "ebay_default_fulfillment_policy_failed",
        "ebay_default_policies_create_partial"
      ])
      .order("created_at", { ascending: false })
      .limit(12);
    const storedPolicyIds = {
      paymentPolicyId: account.payment_policy_id,
      returnPolicyId: account.return_policy_id,
      fulfillmentPolicyId: account.fulfillment_policy_id,
      paymentPolicyName: account.payment_policy_name,
      returnPolicyName: account.return_policy_name,
      fulfillmentPolicyName: account.fulfillment_policy_name
    };

    return NextResponse.json({
      connected: true,
      businessPoliciesActive: optedInProgramTypes.includes(SELLING_POLICY_MANAGEMENT),
      paymentPoliciesCount: policies.payment.paymentPolicies.length,
      returnPoliciesCount: policies.returnPolicies.returnPolicies.length,
      fulfillmentPoliciesCount: policies.fulfillment.fulfillmentPolicies.length,
      paymentPolicies: policies.payment.paymentPolicies.map((policy) => summarizePolicy(policy, "payment")),
      returnPolicies: policies.returnPolicies.returnPolicies.map((policy) => summarizePolicy(policy, "return")),
      fulfillmentPolicies: policies.fulfillment.fulfillmentPolicies.map((policy) => summarizePolicy(policy, "fulfillment")),
      accountStoredPolicyIds: storedPolicyIds,
      fulfillmentMissingReason: getFulfillmentMissingReason(
        storedPolicyIds.fulfillmentPolicyId,
        policies.fulfillment.fulfillmentPolicies.length
      ),
      lastPolicyCreationAttempts: (recentLogs ?? []).map((log) => ({
        message: log.message,
        level: log.level,
        createdAt: log.created_at,
        metadata: summarizePolicyAttemptLog(log.metadata_json)
      }))
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Could not load eBay policy diagnostics."
      },
      { status: 400 }
    );
  }
}

function getFulfillmentMissingReason(storedFulfillmentPolicyId: string | null | undefined, fulfillmentPoliciesCount: number) {
  if (storedFulfillmentPolicyId) {
    return null;
  }

  if (fulfillmentPoliciesCount === 0) {
    return "No fulfillment policies were returned by the eBay sandbox Account API.";
  }

  return "Fulfillment policies exist in eBay, but none is currently stored on the connected account row.";
}

function summarizePolicyAttemptLog(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const record = metadata as Record<string, unknown>;

  return {
    marketplaceId: record.marketplaceId,
    attemptNumber: record.attemptNumber,
    shippingServiceCode: record.shippingServiceCode,
    shippingCarrierCode: record.shippingCarrierCode,
    shippingCostIncluded: record.shippingCostIncluded,
    schema: record.schema,
    schemaVariant: record.schemaVariant,
    status: record.status,
    timeoutMs: record.timeoutMs,
    message: record.message,
    ebayErrors: record.ebayErrors,
    error: record.error,
    code: record.code,
    fulfillmentPolicyStored: record.fulfillmentPolicyStored
  };
}

function summarizePolicy(policy: SellerPolicy, type: "payment" | "return" | "fulfillment") {
  return {
    name: policy.name,
    id:
      type === "payment"
        ? policy.paymentPolicyId
        : type === "return"
          ? policy.returnPolicyId
          : policy.fulfillmentPolicyId,
    marketplaceId: policy.marketplaceId
  };
}

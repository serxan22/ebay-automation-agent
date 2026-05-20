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

    return NextResponse.json({
      connected: true,
      businessPoliciesActive: optedInProgramTypes.includes(SELLING_POLICY_MANAGEMENT),
      paymentPoliciesCount: policies.payment.paymentPolicies.length,
      returnPoliciesCount: policies.returnPolicies.returnPolicies.length,
      fulfillmentPoliciesCount: policies.fulfillment.fulfillmentPolicies.length,
      paymentPolicies: policies.payment.paymentPolicies.map((policy) => summarizePolicy(policy, "payment")),
      returnPolicies: policies.returnPolicies.returnPolicies.map((policy) => summarizePolicy(policy, "return")),
      fulfillmentPolicies: policies.fulfillment.fulfillmentPolicies.map((policy) => summarizePolicy(policy, "fulfillment")),
      accountStoredPolicyIds: {
        paymentPolicyId: account.payment_policy_id,
        returnPolicyId: account.return_policy_id,
        fulfillmentPolicyId: account.fulfillment_policy_id,
        paymentPolicyName: account.payment_policy_name,
        returnPolicyName: account.return_policy_name,
        fulfillmentPolicyName: account.fulfillment_policy_name
      }
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

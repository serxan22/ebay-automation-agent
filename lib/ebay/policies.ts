import { ebayFetch } from "@/lib/ebay/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";

interface SellerPolicy {
  name: string;
  marketplaceId: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  fulfillmentPolicyId?: string;
  categoryTypes?: Array<{ name: string; default?: boolean }>;
}

export async function getFulfillmentPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ fulfillmentPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`
  });
}

export async function getPaymentPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ paymentPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`
  });
}

export async function getReturnPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ returnPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`
  });
}

export async function syncSellerPolicies({
  supabase,
  userId,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
}) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_policies",
    message: "ebay_policy_sync_started",
    metadata: { marketplaceId }
  });

  const { account, accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const [payment, returnPolicies, fulfillment] = await Promise.all([
    getPaymentPolicies(accessToken, marketplaceId),
    getReturnPolicies(accessToken, marketplaceId),
    getFulfillmentPolicies(accessToken, marketplaceId)
  ]);

  const paymentPolicy = chooseDefaultPolicy(payment.paymentPolicies);
  const returnPolicy = chooseDefaultPolicy(returnPolicies.returnPolicies);
  const fulfillmentPolicy = chooseDefaultPolicy(fulfillment.fulfillmentPolicies);
  const hasAllPolicies = Boolean(paymentPolicy && returnPolicy && fulfillmentPolicy);

  const { data, error } = await supabase
    .from("ebay_accounts")
    .update({
      payment_policy_id: paymentPolicy?.paymentPolicyId ?? null,
      payment_policy_name: paymentPolicy?.name ?? null,
      return_policy_id: returnPolicy?.returnPolicyId ?? null,
      return_policy_name: returnPolicy?.name ?? null,
      fulfillment_policy_id: fulfillmentPolicy?.fulfillmentPolicyId ?? null,
      fulfillment_policy_name: fulfillmentPolicy?.name ?? null,
      last_policy_sync_at: new Date().toISOString(),
      status: "connected"
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!hasAllPolicies) {
    const message =
      "No seller policies found in sandbox account. Create payment, return, and fulfillment policies in eBay sandbox seller settings, then sync again.";

    await logAutomationEvent({
      supabase,
      userId,
      level: "warning",
      module: "ebay_policies",
      message: "ebay_policy_sync_failed",
      metadata: {
        marketplaceId,
        paymentPolicies: payment.paymentPolicies.length,
        returnPolicies: returnPolicies.returnPolicies.length,
        fulfillmentPolicies: fulfillment.fulfillmentPolicies.length,
        reason: "missing_required_seller_policies"
      }
    });

    throw new EbayIntegrationError(message, "MISSING_POLICY_ID", getEbayErrorRecommendation("MISSING_POLICY_ID"));
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_policies",
    message: "ebay_policy_sync_success",
    metadata: {
      marketplaceId,
      paymentPolicies: payment.paymentPolicies.length,
      returnPolicies: returnPolicies.returnPolicies.length,
      fulfillmentPolicies: fulfillment.fulfillmentPolicies.length
    }
  });

  return {
    account: data,
    policies: {
      paymentPolicy,
      returnPolicy,
      fulfillmentPolicy
    }
  };
}

function chooseDefaultPolicy<T extends SellerPolicy>(policies: T[] = []) {
  return (
    policies.find((policy) =>
      policy.categoryTypes?.some((category) => category.default && category.name === "ALL_EXCLUDING_MOTORS_VEHICLES")
    ) ??
    policies.find((policy) => policy.categoryTypes?.some((category) => category.name === "ALL_EXCLUDING_MOTORS_VEHICLES")) ??
    policies[0] ??
    null
  );
}

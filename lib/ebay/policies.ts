import { ebayFetch, getEbayConfig } from "@/lib/ebay/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";

export interface SellerPolicy {
  name: string;
  marketplaceId: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  fulfillmentPolicyId?: string;
  categoryTypes?: Array<{ name: string; default?: boolean }>;
}

interface DefaultPoliciesCreated {
  paymentPolicy: SellerPolicy | null;
  returnPolicy: SellerPolicy | null;
  fulfillmentPolicy: SellerPolicy | null;
}

const defaultCategoryTypes = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];
const defaultPolicyNames = {
  payment: "Default Sandbox Payment Policy",
  return: "Default Sandbox Return Policy",
  fulfillment: "Default Sandbox Fulfillment Policy"
};

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

export async function getSellerPolicyCollections(accessToken: string, marketplaceId = "EBAY_US") {
  const [payment, returnPolicies, fulfillment] = await Promise.all([
    getPaymentPolicies(accessToken, marketplaceId),
    getReturnPolicies(accessToken, marketplaceId),
    getFulfillmentPolicies(accessToken, marketplaceId)
  ]);

  return { payment, returnPolicies, fulfillment };
}

export async function createDefaultPaymentPolicy(accessToken: string, marketplaceId = "EBAY_US") {
  const baseBody = {
    marketplaceId,
    name: defaultPolicyNames.payment,
    categoryTypes: defaultCategoryTypes,
    immediatePay: false
  };

  try {
    return await ebayFetch<SellerPolicy>({
      accessToken,
      marketplaceId,
      method: "POST",
      path: "/sell/account/v1/payment_policy",
      body: {
        ...baseBody,
        paymentMethods: [{ paymentMethodType: "PAYPAL" }]
      }
    });
  } catch (error) {
    if (!isRetryablePolicyCreateError(error)) {
      throw error;
    }

    return ebayFetch<SellerPolicy>({
      accessToken,
      marketplaceId,
      method: "POST",
      path: "/sell/account/v1/payment_policy",
      body: {
        ...baseBody,
        paymentMethods: [{ paymentMethodType: "PERSONAL_CHECK" }]
      }
    });
  }
}

export async function createDefaultReturnPolicy(accessToken: string, marketplaceId = "EBAY_US") {
  const baseBody = {
    marketplaceId,
    name: defaultPolicyNames.return,
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: "DAY" },
    refundMethod: "MONEY_BACK",
    returnShippingCostPayer: "BUYER"
  };
  const attempts = [
    {
      ...baseBody,
      categoryTypes: defaultCategoryTypes,
      returnMethod: "REPLACEMENT"
    },
    {
      ...baseBody,
      categoryTypes: defaultCategoryTypes
    },
    baseBody
  ];

  return createWithFallbackAttempts(accessToken, marketplaceId, "/sell/account/v1/return_policy", attempts);
}

export async function createDefaultFulfillmentPolicy(accessToken: string, marketplaceId = "EBAY_US") {
  const serviceCodes = ["USPSGroundAdvantage", "USPSPriority", "USPSPriorityFlatRateBox"];
  const attempts = serviceCodes.map((shippingServiceCode) => ({
    marketplaceId,
    name: defaultPolicyNames.fulfillment,
    categoryTypes: defaultCategoryTypes,
    handlingTime: { value: 3, unit: "DAY" },
    shippingOptions: [
      {
        costType: "FLAT_RATE",
        optionType: "DOMESTIC",
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: "USPS",
            shippingServiceCode,
            shippingCost: { value: "0.00", currency: "USD" },
            additionalShippingCost: { value: "0.00", currency: "USD" },
            freeShipping: true,
            buyerResponsibleForShipping: false,
            buyerResponsibleForPickup: false
          }
        ]
      }
    ]
  }));

  return createWithFallbackAttempts(accessToken, marketplaceId, "/sell/account/v1/fulfillment_policy", attempts);
}

export async function createDefaultSellerPolicies({
  supabase,
  userId,
  marketplaceId = "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
}) {
  const config = getEbayConfig();

  if (config.environment !== "sandbox") {
    throw new EbayIntegrationError(
      "Default seller policy creation is available for sandbox only.",
      "PRODUCTION_DISABLED",
      getEbayErrorRecommendation("PRODUCTION_DISABLED")
    );
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_policies",
    message: "ebay_default_policies_create_started",
    metadata: { marketplaceId }
  });

  const { accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const existing = await getSellerPolicyCollections(accessToken, marketplaceId);
  const created: DefaultPoliciesCreated = {
    paymentPolicy: null,
    returnPolicy: null,
    fulfillmentPolicy: null
  };

  if (!chooseDefaultPolicy(existing.payment.paymentPolicies)) {
    created.paymentPolicy = await createDefaultPaymentPolicy(accessToken, marketplaceId);
    await logDefaultPolicyCreated(supabase, userId, "ebay_default_payment_policy_created", marketplaceId, {
      policyId: created.paymentPolicy.paymentPolicyId,
      policyName: created.paymentPolicy.name
    });
  }

  if (!chooseDefaultPolicy(existing.returnPolicies.returnPolicies)) {
    created.returnPolicy = await createDefaultReturnPolicy(accessToken, marketplaceId);
    await logDefaultPolicyCreated(supabase, userId, "ebay_default_return_policy_created", marketplaceId, {
      policyId: created.returnPolicy.returnPolicyId,
      policyName: created.returnPolicy.name
    });
  }

  if (!chooseDefaultPolicy(existing.fulfillment.fulfillmentPolicies)) {
    created.fulfillmentPolicy = await createDefaultFulfillmentPolicy(accessToken, marketplaceId);
    await logDefaultPolicyCreated(supabase, userId, "ebay_default_fulfillment_policy_created", marketplaceId, {
      policyId: created.fulfillmentPolicy.fulfillmentPolicyId,
      policyName: created.fulfillmentPolicy.name
    });
  }

  const synced = await syncSellerPolicies({ supabase, userId, marketplaceId });

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_policies",
    message: "ebay_default_policies_create_success",
    metadata: {
      marketplaceId,
      createdPaymentPolicy: Boolean(created.paymentPolicy),
      createdReturnPolicy: Boolean(created.returnPolicy),
      createdFulfillmentPolicy: Boolean(created.fulfillmentPolicy)
    }
  });

  return {
    created,
    account: synced.account,
    policies: synced.policies
  };
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
  const { payment, returnPolicies, fulfillment } = await getSellerPolicyCollections(accessToken, marketplaceId);

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
      "Business Policies are active, but no payment/return/fulfillment policies exist yet. Click Create default seller policies or create them manually in seller settings.";

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

export function chooseDefaultPolicy<T extends SellerPolicy>(policies: T[] = []) {
  return (
    policies.find((policy) =>
      policy.categoryTypes?.some((category) => category.default && category.name === "ALL_EXCLUDING_MOTORS_VEHICLES")
    ) ??
    policies.find((policy) => policy.categoryTypes?.some((category) => category.name === "ALL_EXCLUDING_MOTORS_VEHICLES")) ??
    policies[0] ??
    null
  );
}

async function createWithFallbackAttempts<T extends SellerPolicy>(
  accessToken: string,
  marketplaceId: string,
  path: string,
  attempts: unknown[]
) {
  let lastError: unknown;

  for (const body of attempts) {
    try {
      return await ebayFetch<T>({
        accessToken,
        marketplaceId,
        method: "POST",
        path,
        body
      });
    } catch (error) {
      lastError = error;

      if (!isRetryablePolicyCreateError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function isRetryablePolicyCreateError(error: unknown) {
  return error instanceof EbayIntegrationError && error.status === 400;
}

async function logDefaultPolicyCreated(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  marketplaceId: string,
  metadata: Record<string, unknown>
) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "ebay_policies",
    message,
    metadata: { marketplaceId, ...metadata }
  });
}

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

interface DefaultPolicyErrors {
  paymentPolicy?: PolicyCreateErrorSummary;
  returnPolicy?: PolicyCreateErrorSummary;
  fulfillmentPolicy?: PolicyCreateErrorSummary;
}

interface PolicyCreateErrorSummary {
  code: string;
  message: string;
  recommendation?: string;
  details?: unknown;
}

interface SellerPolicyStatus {
  exists: boolean;
  created: boolean;
  status: "created" | "stored" | "missing" | "error";
  policyId?: string | null;
  policyName?: string | null;
  error?: string;
  attemptedShippingServices?: string[];
}

const defaultCategoryTypes = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];
const defaultPolicyNames = {
  payment: "Default Sandbox Payment Policy",
  return: "Default Sandbox Return Policy",
  fulfillment: "Default Sandbox Fulfillment Policy"
};
const fulfillmentShippingAttempts = [
  { shippingServiceCode: "USPSPriorityFlatRateBox", shippingCarrierCode: "USPS" },
  { shippingServiceCode: "USPSPriority", shippingCarrierCode: "USPS" },
  { shippingServiceCode: "USPSParcel", shippingCarrierCode: "USPS" },
  { shippingServiceCode: "USPSGround", shippingCarrierCode: "USPS" },
  { shippingServiceCode: "UPSGround", shippingCarrierCode: "UPS" }
];

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
  const attempts = [
    baseBody,
    {
      ...baseBody,
      paymentMethods: [{ paymentMethodType: "PERSONAL_CHECK" }]
    },
    {
      ...baseBody,
      paymentMethods: [{ paymentMethodType: "PAYPAL" }]
    }
  ];

  return createWithFallbackAttempts(accessToken, marketplaceId, "/sell/account/v1/payment_policy", attempts);
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

export async function createDefaultFulfillmentPolicy({
  accessToken,
  marketplaceId = "EBAY_US",
  supabase,
  userId
}: {
  accessToken: string;
  marketplaceId?: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  let lastError: unknown;

  for (const attempt of fulfillmentShippingAttempts) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_policies",
      message: "ebay_default_fulfillment_policy_attempt",
      metadata: {
        marketplaceId,
        shippingServiceCode: attempt.shippingServiceCode,
        shippingCarrierCode: attempt.shippingCarrierCode
      }
    });

    try {
      return await ebayFetch<SellerPolicy>({
        accessToken,
        marketplaceId,
        method: "POST",
        path: "/sell/account/v1/fulfillment_policy",
        body: buildDefaultFulfillmentPolicyBody(marketplaceId, attempt)
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
  const errors: DefaultPolicyErrors = {};

  if (!chooseDefaultPolicy(existing.payment.paymentPolicies)) {
    try {
      created.paymentPolicy = await createDefaultPaymentPolicy(accessToken, marketplaceId);
      await logDefaultPolicyCreated(supabase, userId, "ebay_default_payment_policy_created", marketplaceId, {
        policyId: created.paymentPolicy.paymentPolicyId,
        policyName: created.paymentPolicy.name
      });
    } catch (error) {
      errors.paymentPolicy = summarizePolicyCreateError(error);
    }
  }

  if (!chooseDefaultPolicy(existing.returnPolicies.returnPolicies)) {
    try {
      created.returnPolicy = await createDefaultReturnPolicy(accessToken, marketplaceId);
      await logDefaultPolicyCreated(supabase, userId, "ebay_default_return_policy_created", marketplaceId, {
        policyId: created.returnPolicy.returnPolicyId,
        policyName: created.returnPolicy.name
      });
    } catch (error) {
      errors.returnPolicy = summarizePolicyCreateError(error);
    }
  }

  if (!chooseDefaultPolicy(existing.fulfillment.fulfillmentPolicies)) {
    try {
      created.fulfillmentPolicy = await createDefaultFulfillmentPolicy({
        accessToken,
        marketplaceId,
        supabase,
        userId
      });
      await logDefaultPolicyCreated(supabase, userId, "ebay_default_fulfillment_policy_created", marketplaceId, {
        policyId: created.fulfillmentPolicy.fulfillmentPolicyId,
        policyName: created.fulfillmentPolicy.name,
        attemptedShippingServices: fulfillmentShippingAttempts.map((attempt) => attempt.shippingServiceCode)
      });
    } catch (error) {
      errors.fulfillmentPolicy = summarizePolicyCreateError(error);
      await logAutomationEvent({
        supabase,
        userId,
        level: "error",
        module: "ebay_policies",
        message: "ebay_default_fulfillment_policy_failed",
        metadata: {
          marketplaceId,
          attemptedShippingServices: fulfillmentShippingAttempts.map((attempt) => attempt.shippingServiceCode),
          error: errors.fulfillmentPolicy.message,
          code: errors.fulfillmentPolicy.code,
          details: errors.fulfillmentPolicy.details
        }
      });
    }
  }

  const synced = await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false });
  const policyStatus = buildDefaultPolicyStatus(synced.policies, created, errors);
  const missing = getMissingPolicyNames(policyStatus);
  const partial = missing.length > 0;

  if (partial) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "warning",
      module: "ebay_policies",
      message: "ebay_default_policies_create_partial",
      metadata: {
        marketplaceId,
        createdPaymentPolicy: Boolean(created.paymentPolicy),
        createdReturnPolicy: Boolean(created.returnPolicy),
        createdFulfillmentPolicy: Boolean(created.fulfillmentPolicy),
        missing,
        errors
      }
    });
  } else {
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
  }

  return {
    created,
    errors,
    partial,
    missing,
    policyStatus,
    account: synced.account,
    policies: synced.policies
  };
}

export async function syncSellerPolicies({
  supabase,
  userId,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
  requireAll = true
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
  requireAll?: boolean;
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

  if (!hasAllPolicies && requireAll) {
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
    level: hasAllPolicies ? "success" : "warning",
    module: "ebay_policies",
    message: hasAllPolicies ? "ebay_policy_sync_success" : "ebay_policy_sync_partial",
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

function buildDefaultFulfillmentPolicyBody(
  marketplaceId: string,
  attempt: { shippingServiceCode: string; shippingCarrierCode: string }
) {
  return {
    categoryTypes: defaultCategoryTypes,
    marketplaceId,
    name: defaultPolicyNames.fulfillment,
    handlingTime: {
      value: 1,
      unit: "DAY"
    },
    shippingOptions: [
      {
        costType: "FLAT_RATE",
        optionType: "DOMESTIC",
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: attempt.shippingCarrierCode,
            shippingServiceCode: attempt.shippingServiceCode,
            shippingCost: {
              currency: "USD",
              value: "0.00"
            },
            additionalShippingCost: {
              currency: "USD",
              value: "0.00"
            },
            freeShipping: true,
            buyerResponsibleForShipping: false
          }
        ]
      }
    ],
    globalShipping: false
  };
}

function buildDefaultPolicyStatus(
  policies: {
    paymentPolicy: SellerPolicy | null;
    returnPolicy: SellerPolicy | null;
    fulfillmentPolicy: SellerPolicy | null;
  },
  created: DefaultPoliciesCreated,
  errors: DefaultPolicyErrors
): Record<"paymentPolicy" | "returnPolicy" | "fulfillmentPolicy", SellerPolicyStatus> {
  return {
    paymentPolicy: buildPolicyStatus(policies.paymentPolicy, Boolean(created.paymentPolicy), errors.paymentPolicy),
    returnPolicy: buildPolicyStatus(policies.returnPolicy, Boolean(created.returnPolicy), errors.returnPolicy),
    fulfillmentPolicy: {
      ...buildPolicyStatus(policies.fulfillmentPolicy, Boolean(created.fulfillmentPolicy), errors.fulfillmentPolicy),
      attemptedShippingServices: fulfillmentShippingAttempts.map((attempt) => attempt.shippingServiceCode)
    }
  };
}

function buildPolicyStatus(policy: SellerPolicy | null, created: boolean, error?: PolicyCreateErrorSummary): SellerPolicyStatus {
  if (policy) {
    return {
      exists: true,
      created,
      status: created ? "created" : "stored",
      policyId: policy.paymentPolicyId ?? policy.returnPolicyId ?? policy.fulfillmentPolicyId ?? null,
      policyName: policy.name
    };
  }

  if (error) {
    return {
      exists: false,
      created: false,
      status: "error",
      error: error.message
    };
  }

  return {
    exists: false,
    created: false,
    status: "missing"
  };
}

function getMissingPolicyNames(status: Record<"paymentPolicy" | "returnPolicy" | "fulfillmentPolicy", SellerPolicyStatus>) {
  const missing: string[] = [];

  if (!status.paymentPolicy.exists) {
    missing.push("payment policy");
  }

  if (!status.returnPolicy.exists) {
    missing.push("return policy");
  }

  if (!status.fulfillmentPolicy.exists) {
    missing.push("fulfillment policy");
  }

  return missing;
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
  return error instanceof EbayIntegrationError && (error.status === 400 || error.code === "INVALID_SHIPPING_SERVICE");
}

function summarizePolicyCreateError(error: unknown): PolicyCreateErrorSummary {
  if (error instanceof EbayIntegrationError) {
    const message =
      error.code === "INVALID_SHIPPING_SERVICE"
        ? "Invalid shipping service code for fulfillment policy. The app will retry with another sandbox-safe service."
        : error.message;

    return {
      code: error.code,
      message,
      recommendation: error.recommendation ?? getEbayErrorRecommendation(error.code),
      details: error.details ? { ebay: error.details, status: error.status } : { status: error.status }
    };
  }

  return {
    code: "PUBLISH_FAILED",
    message: error instanceof Error ? error.message : "Seller policy creation failed.",
    recommendation: getEbayErrorRecommendation("PUBLISH_FAILED")
  };
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

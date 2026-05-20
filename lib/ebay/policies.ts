import { ebayFetch, getEbayConfig } from "@/lib/ebay/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getValidEbayAccessToken, type EbayAccountRecord } from "@/lib/ebay/account";
import { EbayIntegrationError, getEbayErrorRecommendation } from "@/lib/ebay/errors";
import {
  discoverShippingServicesWithFallback,
  getPreferredDomesticShippingServices,
  inferShippingCarrierCode,
  type EbayShippingService
} from "@/lib/ebay/shipping-services";

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
interface FulfillmentPolicyAttempt {
  attemptNumber: number;
  schema: "official_string_free" | "boolean_zero_cost" | "buyer_paid_flat_rate";
  shippingServiceCode: string;
  shippingCarrierCode: string;
  includeShippingCost: boolean;
  freeShipping: boolean | "true" | "false";
  buyerResponsibleForShipping: boolean | "true" | "false";
  shippingCostValue?: string;
  additionalShippingCostValue?: string;
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
  const discovery = await discoverShippingServicesWithFallback(accessToken);
  const candidates = getPreferredDomesticShippingServices(discovery.services);
  const attempts = buildFulfillmentPolicyAttempts(candidates);
  const failedAttempts: Array<{
    attemptNumber: number;
    shippingServiceCode: string;
    schema: string;
    shippingCostIncluded: boolean;
    ebayErrors: ReturnType<typeof extractEbayErrorSummaries>;
  }> = [];

  for (const attempt of attempts) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_policies",
      message: "ebay_default_fulfillment_policy_attempt",
      metadata: {
        marketplaceId,
        attemptNumber: attempt.attemptNumber,
        shippingServiceCode: attempt.shippingServiceCode,
        shippingCarrierCode: attempt.shippingCarrierCode,
        shippingCostIncluded: attempt.includeShippingCost,
        schema: attempt.schema,
        freeShipping: attempt.freeShipping,
        buyerResponsibleForShipping: attempt.buyerResponsibleForShipping,
        discoveryUsed: discovery.discovered,
        discoveryError: discovery.discoveryError
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
      const ebayErrors = extractEbayErrorSummaries(error);
      failedAttempts.push({
        attemptNumber: attempt.attemptNumber,
        shippingServiceCode: attempt.shippingServiceCode,
        schema: attempt.schema,
        shippingCostIncluded: attempt.includeShippingCost,
        ebayErrors
      });
      await logAutomationEvent({
        supabase,
        userId,
        level: "warning",
        module: "ebay_policies",
        message: "ebay_default_fulfillment_policy_attempt_failed",
        metadata: {
          marketplaceId,
          attemptNumber: attempt.attemptNumber,
          shippingServiceCode: attempt.shippingServiceCode,
          shippingCarrierCode: attempt.shippingCarrierCode,
          shippingCostIncluded: attempt.includeShippingCost,
          schema: attempt.schema,
          discoveryUsed: discovery.discovered,
          ebayErrors
        }
      });

      if (!isRetryablePolicyCreateError(error)) {
        throw error;
      }
    }
  }

  const summary = summarizePolicyCreateError(lastError);
  throw new EbayIntegrationError(
    "Fulfillment policy creation failed after trying discovered and fallback shipping services.",
    summary.code,
    summary.recommendation,
    {
      attempts: failedAttempts,
      attemptedShippingServices: Array.from(new Set(failedAttempts.map((attempt) => attempt.shippingServiceCode))),
      discoveryUsed: discovery.discovered,
      discoveryFailed: !discovery.discovered,
      discoveryError: discovery.discoveryError,
      lastError: summary.details
    }
  );
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

  const { account, accessToken } = await getValidEbayAccessToken({
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

  if (!chooseDefaultPolicy(existing.payment.paymentPolicies, marketplaceId) && !account.payment_policy_id) {
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

  if (!chooseDefaultPolicy(existing.returnPolicies.returnPolicies, marketplaceId) && !account.return_policy_id) {
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

  if (!chooseDefaultPolicy(existing.fulfillment.fulfillmentPolicies, marketplaceId) && !account.fulfillment_policy_id) {
    try {
      created.fulfillmentPolicy = await createDefaultFulfillmentPolicy({
        accessToken,
        marketplaceId,
        supabase,
        userId
      });
      await logDefaultPolicyCreated(supabase, userId, "ebay_default_fulfillment_policy_created", marketplaceId, {
        policyId: created.fulfillmentPolicy.fulfillmentPolicyId,
        policyName: created.fulfillmentPolicy.name
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

  const paymentPolicy = chooseDefaultPolicy(payment.paymentPolicies, marketplaceId);
  const returnPolicy = chooseDefaultPolicy(returnPolicies.returnPolicies, marketplaceId);
  const fulfillmentPolicy = chooseDefaultPolicy(fulfillment.fulfillmentPolicies, marketplaceId);
  const effectivePaymentPolicy = paymentPolicy ?? buildStoredPolicyFallback("payment", account);
  const effectiveReturnPolicy = returnPolicy ?? buildStoredPolicyFallback("return", account);
  const effectiveFulfillmentPolicy = fulfillmentPolicy ?? buildStoredPolicyFallback("fulfillment", account);
  const hasAllPolicies = Boolean(effectivePaymentPolicy && effectiveReturnPolicy && effectiveFulfillmentPolicy);
  const missingPolicies = getMissingPolicyLabels({
    paymentPolicy: effectivePaymentPolicy,
    returnPolicy: effectiveReturnPolicy,
    fulfillmentPolicy: effectiveFulfillmentPolicy
  });

  const { data, error } = await supabase
    .from("ebay_accounts")
    .update({
      payment_policy_id: effectivePaymentPolicy?.paymentPolicyId ?? null,
      payment_policy_name: effectivePaymentPolicy?.name ?? null,
      return_policy_id: effectiveReturnPolicy?.returnPolicyId ?? null,
      return_policy_name: effectiveReturnPolicy?.name ?? null,
      fulfillment_policy_id: effectiveFulfillmentPolicy?.fulfillmentPolicyId ?? null,
      fulfillment_policy_name: effectiveFulfillmentPolicy?.name ?? null,
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
    const message = `Business Policies are active, but ${missingPolicies.join(", ")} ${
      missingPolicies.length === 1 ? "is" : "are"
    } missing. Click Create default seller policies or create missing policies manually in seller settings.`;

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
        missingPolicies,
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
      paymentPolicy: effectivePaymentPolicy,
      returnPolicy: effectiveReturnPolicy,
      fulfillmentPolicy: effectiveFulfillmentPolicy
    }
  };
}

export function chooseDefaultPolicy<T extends SellerPolicy>(policies: T[] = [], marketplaceId = "EBAY_US") {
  const hasCategory = (policy: T) =>
    policy.categoryTypes?.some((category) => category.name === "ALL_EXCLUDING_MOTORS_VEHICLES") ?? false;
  const hasDefaultCategory = (policy: T) =>
    policy.categoryTypes?.some((category) => category.default && category.name === "ALL_EXCLUDING_MOTORS_VEHICLES") ?? false;
  const isMarketplace = (policy: T) => policy.marketplaceId === marketplaceId;

  return (
    policies.find((policy) => isMarketplace(policy) && hasDefaultCategory(policy)) ??
    policies.find((policy) => isMarketplace(policy) && hasCategory(policy)) ??
    policies.find((policy) => hasDefaultCategory(policy)) ??
    policies.find((policy) => hasCategory(policy)) ??
    policies.find((policy) => isMarketplace(policy)) ??
    policies[0] ??
    null
  );
}

function buildDefaultFulfillmentPolicyBody(
  marketplaceId: string,
  attempt: FulfillmentPolicyAttempt
) {
  const shippingService: Record<string, unknown> = {
    buyerResponsibleForShipping: attempt.buyerResponsibleForShipping,
    freeShipping: attempt.freeShipping,
    shippingCarrierCode: attempt.shippingCarrierCode,
    shippingServiceCode: attempt.shippingServiceCode
  };

  if (attempt.includeShippingCost) {
    shippingService.shippingCost = {
      currency: "USD",
      value: attempt.shippingCostValue ?? "0.0"
    };
    shippingService.additionalShippingCost = {
      currency: "USD",
      value: attempt.additionalShippingCostValue ?? "0.0"
    };
  }

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
        shippingServices: [shippingService]
      }
    ],
    globalShipping: false
  };
}

function buildFulfillmentPolicyAttempts(candidates: EbayShippingService[]): FulfillmentPolicyAttempt[] {
  const usableCandidates = candidates.length
    ? candidates
    : [
        { shippingService: "USPSPriorityFlatRateBox" },
        { shippingService: "USPSPriority" },
        { shippingService: "USPSGroundAdvantage" },
        { shippingService: "USPSParcel" },
        { shippingService: "UPSGround" },
        { shippingService: "FedExGround" }
      ];
  const attempts: FulfillmentPolicyAttempt[] = [];

  for (const candidate of usableCandidates) {
    attempts.push({
      attemptNumber: attempts.length + 1,
      schema: "official_string_free",
      shippingServiceCode: candidate.shippingService,
      shippingCarrierCode: inferShippingCarrierCode(candidate.shippingService),
      includeShippingCost: false,
      freeShipping: "true",
      buyerResponsibleForShipping: "false"
    });
    attempts.push({
      attemptNumber: attempts.length + 1,
      schema: "boolean_zero_cost",
      shippingServiceCode: candidate.shippingService,
      shippingCarrierCode: inferShippingCarrierCode(candidate.shippingService),
      includeShippingCost: true,
      freeShipping: true,
      buyerResponsibleForShipping: false,
      shippingCostValue: "0.00",
      additionalShippingCostValue: "0.00"
    });
  }

  attempts.push({
    attemptNumber: attempts.length + 1,
    schema: "buyer_paid_flat_rate",
    shippingServiceCode: "USPSPriority",
    shippingCarrierCode: "USPS",
    includeShippingCost: true,
    freeShipping: false,
    buyerResponsibleForShipping: true,
    shippingCostValue: "5.00",
    additionalShippingCostValue: "0.00"
  });

  return attempts;
}

function buildStoredPolicyFallback(
  type: "payment" | "return" | "fulfillment",
  account: EbayAccountRecord
): SellerPolicy | null {
  if (type === "payment" && account.payment_policy_id) {
    return {
      name: account.payment_policy_name ?? "Stored payment policy",
      marketplaceId: account.marketplace,
      paymentPolicyId: account.payment_policy_id
    };
  }

  if (type === "return" && account.return_policy_id) {
    return {
      name: account.return_policy_name ?? "Stored return policy",
      marketplaceId: account.marketplace,
      returnPolicyId: account.return_policy_id
    };
  }

  if (type === "fulfillment" && account.fulfillment_policy_id) {
    return {
      name: account.fulfillment_policy_name ?? "Stored fulfillment policy",
      marketplaceId: account.marketplace,
      fulfillmentPolicyId: account.fulfillment_policy_id
    };
  }

  return null;
}

function getMissingPolicyLabels(policies: {
  paymentPolicy: SellerPolicy | null;
  returnPolicy: SellerPolicy | null;
  fulfillmentPolicy: SellerPolicy | null;
}) {
  const missing: string[] = [];

  if (!policies.paymentPolicy) {
    missing.push("payment policy");
  }

  if (!policies.returnPolicy) {
    missing.push("return policy");
  }

  if (!policies.fulfillmentPolicy) {
    missing.push("fulfillment policy");
  }

  return missing;
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
      attemptedShippingServices: extractAttemptedShippingServices(errors.fulfillmentPolicy)
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
  return (
    error instanceof EbayIntegrationError &&
    (error.status === 400 || error.code === "INVALID_SHIPPING_SERVICE" || Boolean(error.status && error.status >= 500))
  );
}

function summarizePolicyCreateError(error: unknown): PolicyCreateErrorSummary {
  if (error instanceof EbayIntegrationError) {
    const message =
      error.code === "INVALID_SHIPPING_SERVICE"
        ? "Invalid shipping service code for fulfillment policy. The app will retry with another sandbox-safe service."
        : error.message;
    const attemptedShippingServices = extractAttemptedShippingServicesFromDetails(error.details);

    return {
      code: error.code,
      message,
      recommendation: error.recommendation ?? getEbayErrorRecommendation(error.code),
      details: error.details
        ? {
            ebay: error.details,
            status: error.status,
            attemptedShippingServices,
            discoveryFailed: hasDiscoveryFailure(error.details)
          }
        : { status: error.status, attemptedShippingServices }
    };
  }

  return {
    code: "PUBLISH_FAILED",
    message: error instanceof Error ? error.message : "Seller policy creation failed.",
    recommendation: getEbayErrorRecommendation("PUBLISH_FAILED")
  };
}

function extractAttemptedShippingServicesFromDetails(details: unknown) {
  if (!details || typeof details !== "object" || !("attempts" in details)) {
    return [];
  }

  const attempts = (details as { attempts?: unknown }).attempts;

  if (!Array.isArray(attempts)) {
    return [];
  }

  return Array.from(
    new Set(
      attempts
        .map((attempt) =>
          attempt && typeof attempt === "object"
            ? (attempt as { shippingServiceCode?: unknown }).shippingServiceCode
            : null
        )
        .filter((value): value is string => typeof value === "string")
    )
  );
}

function hasDiscoveryFailure(details: unknown) {
  return Boolean(details && typeof details === "object" && "discoveryFailed" in details && (details as { discoveryFailed?: unknown }).discoveryFailed);
}

function extractEbayErrorSummaries(error: unknown) {
  if (!(error instanceof EbayIntegrationError)) {
    return [];
  }

  const payload = error.details;

  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return [];
  }

  const errors = (payload as { errors?: unknown }).errors;

  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map((item) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      errorId: record.errorId,
      longMessage: record.longMessage,
      parameters: Array.isArray(record.parameters)
        ? record.parameters.map((param) => {
            const paramRecord = param && typeof param === "object" ? (param as Record<string, unknown>) : {};
            return {
              name: paramRecord.name,
              value: paramRecord.value
            };
          })
        : undefined
    };
  });
}

function extractAttemptedShippingServices(error?: PolicyCreateErrorSummary) {
  if (!error?.details || typeof error.details !== "object") {
    return [];
  }

  const ebayDetails = "ebay" in error.details ? (error.details as { ebay?: unknown }).ebay : error.details;

  if (!ebayDetails || typeof ebayDetails !== "object" || !("attemptedShippingServices" in ebayDetails)) {
    return [];
  }

  const attempted = (ebayDetails as { attemptedShippingServices?: unknown }).attemptedShippingServices;

  return Array.isArray(attempted) ? attempted.filter((value): value is string => typeof value === "string") : [];
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

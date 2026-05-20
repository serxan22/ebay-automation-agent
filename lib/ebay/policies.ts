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

export interface FulfillmentRetryResult {
  ok: boolean;
  partial: boolean;
  fulfillmentPolicyStored: boolean;
  paymentPolicyStored: boolean;
  returnPolicyStored: boolean;
  message: string;
  attempts: unknown[];
  errors: DefaultPolicyErrors;
  policyStatus: Record<"paymentPolicy" | "returnPolicy" | "fulfillmentPolicy", SellerPolicyStatus>;
  missing: string[];
  account: unknown;
  policies: {
    paymentPolicy: SellerPolicy | null;
    returnPolicy: SellerPolicy | null;
    fulfillmentPolicy: SellerPolicy | null;
  };
}

export interface FulfillmentPolicyStepResult {
  ok: boolean;
  completed: boolean;
  nextAttemptIndex: number | null;
  attempt: FulfillmentPolicyAttemptResult | null;
  fulfillmentPolicyStored: boolean;
  message: string;
  attempts: FulfillmentPolicyAttemptResult[];
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
const FULFILLMENT_POLICY_POST_TIMEOUT_MS = 20_000;
const FULFILLMENT_POLICY_ROUTE_BUDGET_MS = 24_000;
const FULFILLMENT_POLICY_STEP_TIMEOUT_MS = 8_000;
interface FulfillmentPolicyAttempt {
  attemptNumber: number;
  schema:
    | "free_shipping_minimal"
    | "buyer_paid_minimal"
    | "official_string_free"
    | "boolean_zero_cost"
    | "buyer_paid_flat_rate";
  shippingServiceCode: string;
  shippingCarrierCode: string;
  includeShippingCost: boolean;
  freeShipping: boolean | "true" | "false";
  buyerResponsibleForShipping: boolean | "true" | "false";
  shippingCostValue?: string;
  additionalShippingCostValue?: string;
}
export interface FulfillmentPolicyAttemptResult {
  attemptNumber: number;
  attemptIndex?: number;
  serviceCode: string;
  shippingServiceCode: string;
  schemaVariant: FulfillmentPolicyAttempt["schema"];
  schema: FulfillmentPolicyAttempt["schema"];
  status: "started" | "success" | "failed" | "timeout" | "skipped";
  timeoutMs: number;
  message?: string;
  shippingCostIncluded: boolean;
  ebayErrors: ReturnType<typeof extractEbayErrorSummaries>;
}

export async function getFulfillmentPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ fulfillmentPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`,
    timeoutMs: 7_000
  });
}

export async function getPaymentPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ paymentPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`,
    timeoutMs: 7_000
  });
}

export async function getReturnPolicies(accessToken: string, marketplaceId = "EBAY_US") {
  return ebayFetch<{ returnPolicies: SellerPolicy[] }>({
    accessToken,
    marketplaceId,
    path: `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`,
    timeoutMs: 7_000
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
  userId,
  logPrefix = "ebay_default_fulfillment_policy",
  maxAttempts = 8
}: {
  accessToken: string;
  marketplaceId?: string;
  supabase: SupabaseClient;
  userId: string;
  logPrefix?: string;
  maxAttempts?: number;
}) {
  let lastError: unknown;
  const startedAt = Date.now();
  const discovery = await discoverShippingServicesWithFallback(accessToken);
  const candidates = getPreferredDomesticShippingServices(discovery.services);
  const attempts = buildFulfillmentPolicyAttempts(candidates).slice(0, maxAttempts);
  const attemptResults: FulfillmentPolicyAttemptResult[] = [];

  for (const attempt of attempts) {
    if (Date.now() - startedAt >= FULFILLMENT_POLICY_ROUTE_BUDGET_MS) {
      attemptResults.push({
        attemptNumber: attempt.attemptNumber,
        serviceCode: attempt.shippingServiceCode,
        shippingServiceCode: attempt.shippingServiceCode,
        schemaVariant: attempt.schema,
        schema: attempt.schema,
        status: "skipped",
        timeoutMs: FULFILLMENT_POLICY_POST_TIMEOUT_MS,
        message: "Fulfillment policy retry stopped before the route timeout budget was exhausted.",
        shippingCostIncluded: attempt.includeShippingCost,
        ebayErrors: []
      });
      break;
    }

    const attemptResult: FulfillmentPolicyAttemptResult = {
      attemptNumber: attempt.attemptNumber,
      serviceCode: attempt.shippingServiceCode,
      shippingServiceCode: attempt.shippingServiceCode,
      schemaVariant: attempt.schema,
      schema: attempt.schema,
      status: "started",
      timeoutMs: FULFILLMENT_POLICY_POST_TIMEOUT_MS,
      shippingCostIncluded: attempt.includeShippingCost,
      ebayErrors: []
    };

    attemptResults.push(attemptResult);

    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "ebay_policies",
      message: `${logPrefix}_attempt`,
      metadata: {
        marketplaceId,
        attemptNumber: attempt.attemptNumber,
        shippingServiceCode: attempt.shippingServiceCode,
        shippingCarrierCode: attempt.shippingCarrierCode,
        shippingCostIncluded: attempt.includeShippingCost,
        schema: attempt.schema,
        schemaVariant: attempt.schema,
        timeoutMs: FULFILLMENT_POLICY_POST_TIMEOUT_MS,
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
        body: buildDefaultFulfillmentPolicyBody(marketplaceId, attempt),
        timeoutMs: FULFILLMENT_POLICY_POST_TIMEOUT_MS,
        timeoutCode: "FULFILLMENT_POLICY_CREATE_FAILED"
      });
    } catch (error) {
      lastError = error;
      const ebayErrors = extractEbayErrorSummaries(error);
      const timedOut = isFulfillmentPolicyTimeoutError(error);

      attemptResult.status = timedOut ? "timeout" : "failed";
      attemptResult.message = timedOut
        ? "eBay fulfillment policy request timed out"
        : error instanceof Error
          ? error.message
          : "eBay fulfillment policy request failed";
      attemptResult.ebayErrors = ebayErrors;
      await logAutomationEvent({
        supabase,
        userId,
        level: "warning",
        module: "ebay_policies",
        message: `${logPrefix}_attempt_failed`,
        metadata: {
          marketplaceId,
          attemptNumber: attempt.attemptNumber,
          shippingServiceCode: attempt.shippingServiceCode,
          shippingCarrierCode: attempt.shippingCarrierCode,
          shippingCostIncluded: attempt.includeShippingCost,
          schema: attempt.schema,
          schemaVariant: attempt.schema,
          status: attemptResult.status,
          timeoutMs: FULFILLMENT_POLICY_POST_TIMEOUT_MS,
          message: attemptResult.message,
          discoveryUsed: discovery.discovered,
          ebayErrors
        }
      });

      if (!isRetryablePolicyCreateError(error) || timedOut || Date.now() - startedAt >= FULFILLMENT_POLICY_ROUTE_BUDGET_MS) {
        break;
      }
    }
  }

  const summary = summarizePolicyCreateError(lastError);
  const timedOut = attemptResults.some((attempt) => attempt.status === "timeout");
  const attemptedShippingServices = Array.from(new Set(attemptResults.map((attempt) => attempt.serviceCode)));
  throw new EbayIntegrationError(
    timedOut
      ? "eBay sandbox timed out while creating the fulfillment policy. Try again; if it repeats, inspect Policy creation details."
      : "Fulfillment policy creation failed after trying discovered and fallback shipping services.",
    summary.code === "TOKEN_EXPIRED" ? summary.code : "FULFILLMENT_POLICY_CREATE_FAILED",
    getEbayErrorRecommendation(summary.code === "TOKEN_EXPIRED" ? summary.code : "FULFILLMENT_POLICY_CREATE_FAILED"),
    {
      attempts: attemptResults,
      attemptedShippingServices,
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

  const fulfillmentTimedOut = hasFulfillmentPolicyTimeout(errors.fulfillmentPolicy?.details);
  const canSkipPostTimeoutSync =
    fulfillmentTimedOut && !created.paymentPolicy && !created.returnPolicy && !created.fulfillmentPolicy;
  const synced = canSkipPostTimeoutSync
    ? {
        account,
        policies: {
          paymentPolicy: chooseDefaultPolicy(existing.payment.paymentPolicies, marketplaceId) ?? buildStoredPolicyFallback("payment", account),
          returnPolicy:
            chooseDefaultPolicy(existing.returnPolicies.returnPolicies, marketplaceId) ?? buildStoredPolicyFallback("return", account),
          fulfillmentPolicy: buildStoredPolicyFallback("fulfillment", account)
        }
      }
    : await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false });
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

export async function retryFulfillmentPolicy({
  supabase,
  userId,
  marketplaceId = "EBAY_US"
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
}): Promise<FulfillmentRetryResult> {
  const config = getEbayConfig();

  if (config.environment !== "sandbox") {
    throw new EbayIntegrationError(
      "Fulfillment policy retry is available for sandbox only.",
      "PRODUCTION_DISABLED",
      getEbayErrorRecommendation("PRODUCTION_DISABLED")
    );
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_policies",
    message: "ebay_fulfillment_retry_started",
    metadata: { marketplaceId }
  });

  const { account, accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const existing = await getSellerPolicyCollections(accessToken, marketplaceId);
  const existingFulfillment = chooseDefaultPolicy(existing.fulfillment.fulfillmentPolicies, marketplaceId);

  if (existingFulfillment || account.fulfillment_policy_id) {
    const synced = await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false });
    const policyStatus = buildDefaultPolicyStatus(
      synced.policies,
      { paymentPolicy: null, returnPolicy: null, fulfillmentPolicy: null },
      {}
    );

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_policies",
      message: "ebay_fulfillment_retry_success",
      metadata: {
        marketplaceId,
        policyId: synced.policies.fulfillmentPolicy?.fulfillmentPolicyId ?? account.fulfillment_policy_id
      }
    });

    return {
      ok: true,
      partial: false,
      fulfillmentPolicyStored: true,
      paymentPolicyStored: Boolean(synced.policies.paymentPolicy),
      returnPolicyStored: Boolean(synced.policies.returnPolicy),
      message: "Fulfillment policy found and synced.",
      attempts: [],
      errors: {},
      policyStatus,
      missing: getMissingPolicyNames(policyStatus),
      account: synced.account,
      policies: synced.policies
    };
  }

  const errors: DefaultPolicyErrors = {};
  let createdFulfillmentPolicy: SellerPolicy | null = null;

  try {
    createdFulfillmentPolicy = await createDefaultFulfillmentPolicy({
      accessToken,
      marketplaceId,
      supabase,
      userId,
      logPrefix: "ebay_fulfillment_retry",
      maxAttempts: 8
    });
  } catch (error) {
    errors.fulfillmentPolicy = summarizePolicyCreateError(error);
  }

  const fulfillmentTimedOut = hasFulfillmentPolicyTimeout(errors.fulfillmentPolicy?.details);
  const synced = createdFulfillmentPolicy || !fulfillmentTimedOut
    ? await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false })
    : {
        account,
        policies: {
          paymentPolicy: chooseDefaultPolicy(existing.payment.paymentPolicies, marketplaceId) ?? buildStoredPolicyFallback("payment", account),
          returnPolicy:
            chooseDefaultPolicy(existing.returnPolicies.returnPolicies, marketplaceId) ?? buildStoredPolicyFallback("return", account),
          fulfillmentPolicy: buildStoredPolicyFallback("fulfillment", account)
        }
      };
  const policyStatus = buildDefaultPolicyStatus(
    synced.policies,
    { paymentPolicy: null, returnPolicy: null, fulfillmentPolicy: createdFulfillmentPolicy },
    errors
  );
  const missing = getMissingPolicyNames(policyStatus);
  const fulfillmentPolicyStored = Boolean(synced.policies.fulfillmentPolicy);
  const result: FulfillmentRetryResult = {
    ok: fulfillmentPolicyStored,
    partial: !fulfillmentPolicyStored,
    fulfillmentPolicyStored,
    paymentPolicyStored: Boolean(synced.policies.paymentPolicy),
    returnPolicyStored: Boolean(synced.policies.returnPolicy),
    message: fulfillmentPolicyStored
      ? "Fulfillment policy created and synced."
      : fulfillmentTimedOut
        ? "eBay sandbox timed out while creating the fulfillment policy. Try again; if it repeats, inspect Policy creation details."
        : "Payment and return policies are ready, but fulfillment policy creation failed after bounded retry attempts.",
    attempts: extractAttemptsFromPolicyError(errors.fulfillmentPolicy),
    errors,
    policyStatus,
    missing,
    account: synced.account,
    policies: synced.policies
  };

  await logAutomationEvent({
    supabase,
    userId,
    level: fulfillmentPolicyStored ? "success" : "error",
    module: "ebay_policies",
    message: fulfillmentPolicyStored ? "ebay_fulfillment_retry_success" : "ebay_fulfillment_retry_failed",
    metadata: {
      marketplaceId,
      fulfillmentPolicyStored,
      attempts: result.attempts,
      errors
    }
  });

  return result;
}

export async function retryFulfillmentPolicyStep({
  supabase,
  userId,
  marketplaceId = "EBAY_US",
  attemptIndex
}: {
  supabase: SupabaseClient;
  userId: string;
  marketplaceId?: string;
  attemptIndex?: number;
}): Promise<FulfillmentPolicyStepResult> {
  const config = getEbayConfig();

  if (config.environment !== "sandbox") {
    throw new EbayIntegrationError(
      "Fulfillment policy retry is available for sandbox only.",
      "PRODUCTION_DISABLED",
      getEbayErrorRecommendation("PRODUCTION_DISABLED")
    );
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_policies",
    message: "ebay_fulfillment_step_started",
    metadata: { marketplaceId, attemptIndex: attemptIndex ?? null }
  });

  const { account, accessToken } = await getValidEbayAccessToken({
    supabase,
    userId,
    marketplace: marketplaceId
  });
  const existing = await getSellerPolicyCollections(accessToken, marketplaceId);
  const existingFulfillment = chooseDefaultPolicy(existing.fulfillment.fulfillmentPolicies, marketplaceId);

  if (existingFulfillment || account.fulfillment_policy_id) {
    const synced = await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false });

    return {
      ok: true,
      completed: true,
      nextAttemptIndex: null,
      attempt: null,
      fulfillmentPolicyStored: Boolean(synced.policies.fulfillmentPolicy ?? account.fulfillment_policy_id),
      message: "Fulfillment policy already exists and was synced.",
      attempts: []
    };
  }

  const discovery = await discoverShippingServicesWithFallback(accessToken);
  const attempts = buildStepFulfillmentPolicyAttempts(getPreferredDomesticShippingServices(discovery.services));
  const resolvedAttemptIndex =
    attemptIndex == null ? await resolveNextFulfillmentAttemptIndex({ supabase, userId, attempts }) : attemptIndex;
  const attempt = attempts[resolvedAttemptIndex];

  if (!attempt) {
    return {
      ok: false,
      completed: true,
      nextAttemptIndex: null,
      attempt: null,
      fulfillmentPolicyStored: false,
      message: "All fulfillment policy attempts have been tried. eBay sandbox did not create a fulfillment policy.",
      attempts: []
    };
  }

  const attemptResult: FulfillmentPolicyAttemptResult = {
    attemptNumber: attempt.attemptNumber,
    attemptIndex: resolvedAttemptIndex,
    serviceCode: attempt.shippingServiceCode,
    shippingServiceCode: attempt.shippingServiceCode,
    schemaVariant: attempt.schema,
    schema: attempt.schema,
    status: "started",
    timeoutMs: FULFILLMENT_POLICY_STEP_TIMEOUT_MS,
    shippingCostIncluded: attempt.includeShippingCost,
    ebayErrors: []
  };

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "ebay_policies",
    message: "ebay_fulfillment_step_attempt",
    metadata: {
      marketplaceId,
      attemptIndex: resolvedAttemptIndex,
      attemptNumber: attempt.attemptNumber,
      serviceCode: attempt.shippingServiceCode,
      shippingServiceCode: attempt.shippingServiceCode,
      shippingCarrierCode: attempt.shippingCarrierCode,
      schemaVariant: attempt.schema,
      schema: attempt.schema,
      timeoutMs: FULFILLMENT_POLICY_STEP_TIMEOUT_MS,
      shippingCostIncluded: attempt.includeShippingCost
    }
  });

  try {
    const created = await ebayFetch<SellerPolicy>({
      accessToken,
      marketplaceId,
      method: "POST",
      path: "/sell/account/v1/fulfillment_policy",
      body: buildDefaultFulfillmentPolicyBody(marketplaceId, attempt),
      timeoutMs: FULFILLMENT_POLICY_STEP_TIMEOUT_MS,
      timeoutCode: "FULFILLMENT_POLICY_CREATE_FAILED"
    });
    attemptResult.status = "success";
    attemptResult.message = `Fulfillment policy created with ${attempt.shippingServiceCode}.`;

    await logDefaultPolicyCreated(supabase, userId, "ebay_default_fulfillment_policy_created", marketplaceId, {
      policyId: created.fulfillmentPolicyId,
      policyName: created.name,
      attemptIndex: resolvedAttemptIndex,
      serviceCode: attempt.shippingServiceCode,
      schemaVariant: attempt.schema
    });
    const synced = await syncSellerPolicies({ supabase, userId, marketplaceId, requireAll: false });

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "ebay_policies",
      message: "ebay_fulfillment_step_success",
      metadata: { ...attemptResult }
    });

    return {
      ok: true,
      completed: true,
      nextAttemptIndex: null,
      attempt: attemptResult,
      fulfillmentPolicyStored: Boolean(synced.policies.fulfillmentPolicy),
      message: "Fulfillment policy created and synced.",
      attempts: [attemptResult]
    };
  } catch (error) {
    const timedOut = isFulfillmentPolicyTimeoutError(error);
    attemptResult.status = timedOut ? "timeout" : "failed";
    attemptResult.message = timedOut
      ? "eBay fulfillment policy request timed out"
      : error instanceof Error
        ? error.message
        : "eBay fulfillment policy request failed";
    attemptResult.ebayErrors = extractEbayErrorSummaries(error);

    await logAutomationEvent({
      supabase,
      userId,
      level: "warning",
      module: "ebay_policies",
      message: "ebay_fulfillment_step_failed",
      metadata: {
        marketplaceId,
        ...attemptResult
      }
    });

    return {
      ok: false,
      completed: resolvedAttemptIndex + 1 >= attempts.length,
      nextAttemptIndex: resolvedAttemptIndex + 1 < attempts.length ? resolvedAttemptIndex + 1 : null,
      attempt: attemptResult,
      fulfillmentPolicyStored: false,
      message: timedOut
        ? "eBay sandbox timed out while creating the fulfillment policy. Try the next attempt; if it repeats, inspect Policy creation details."
        : "Fulfillment policy attempt failed. Try the next attempt.",
      attempts: [attemptResult]
    };
  }
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
    sortOrder: 1,
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
        { shippingService: "USPSFirstClass" },
        { shippingService: "USPSPriority" },
        { shippingService: "UPSGround" },
        { shippingService: "FedExHomeDelivery" },
        { shippingService: "USPSPriorityFlatRateBox" },
        { shippingService: "USPSGroundAdvantage" },
        { shippingService: "USPSParcel" },
        { shippingService: "FedExGround" }
      ];
  const attempts: FulfillmentPolicyAttempt[] = [];
  const uspsFirstClass = usableCandidates.find((candidate) => candidate.shippingService === "USPSFirstClass");

  if (uspsFirstClass) {
    attempts.push({
      attemptNumber: attempts.length + 1,
      schema: "free_shipping_minimal",
      shippingServiceCode: "USPSFirstClass",
      shippingCarrierCode: "USPS",
      includeShippingCost: false,
      freeShipping: true,
      buyerResponsibleForShipping: false
    });
    attempts.push({
      attemptNumber: attempts.length + 1,
      schema: "buyer_paid_minimal",
      shippingServiceCode: "USPSFirstClass",
      shippingCarrierCode: "USPS",
      includeShippingCost: true,
      freeShipping: false,
      buyerResponsibleForShipping: true,
      shippingCostValue: "5.00",
      additionalShippingCostValue: "0.00"
    });
  }

  for (const candidate of usableCandidates) {
    if (candidate.shippingService === "USPSFirstClass") {
      continue;
    }

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

function buildStepFulfillmentPolicyAttempts(candidates: EbayShippingService[]): FulfillmentPolicyAttempt[] {
  const discoveredByCode = new Map(candidates.map((candidate) => [candidate.shippingService, candidate]));
  const preferredCodes = [
    "USPSFirstClass",
    "USPSPriority",
    "UPSGround",
    "FedExHomeDelivery",
    "USPSPriorityFlatRateBox"
  ];
  const attempts: FulfillmentPolicyAttempt[] = [];
  const pushAttempt = (
    shippingServiceCode: string,
    schema: "free_shipping_minimal" | "buyer_paid_minimal"
  ) => {
    attempts.push({
      attemptNumber: attempts.length + 1,
      schema,
      shippingServiceCode,
      shippingCarrierCode: inferShippingCarrierCode(shippingServiceCode),
      includeShippingCost: schema === "buyer_paid_minimal",
      freeShipping: schema === "free_shipping_minimal",
      buyerResponsibleForShipping: schema === "buyer_paid_minimal",
      shippingCostValue: schema === "buyer_paid_minimal" ? "5.00" : undefined,
      additionalShippingCostValue: schema === "buyer_paid_minimal" ? "0.00" : undefined
    });
  };

  pushAttempt("USPSFirstClass", "free_shipping_minimal");
  pushAttempt("USPSFirstClass", "buyer_paid_minimal");
  pushAttempt("USPSPriority", "free_shipping_minimal");
  pushAttempt("USPSPriority", "buyer_paid_minimal");
  pushAttempt("UPSGround", "buyer_paid_minimal");
  pushAttempt("FedExHomeDelivery", "buyer_paid_minimal");
  pushAttempt("USPSPriorityFlatRateBox", "free_shipping_minimal");

  for (const candidate of candidates) {
    if (!candidate.shippingService || preferredCodes.includes(candidate.shippingService)) {
      continue;
    }

    if (discoveredByCode.has(candidate.shippingService)) {
      pushAttempt(candidate.shippingService, "buyer_paid_minimal");
    }
  }

  return attempts;
}

async function resolveNextFulfillmentAttemptIndex({
  supabase,
  userId,
  attempts
}: {
  supabase: SupabaseClient;
  userId: string;
  attempts: FulfillmentPolicyAttempt[];
}) {
  const { data } = await supabase
    .from("automation_logs")
    .select("metadata_json")
    .eq("user_id", userId)
    .eq("module", "ebay_policies")
    .in("message", ["ebay_fulfillment_step_attempt", "ebay_fulfillment_step_failed", "ebay_fulfillment_step_success"])
    .order("created_at", { ascending: false })
    .limit(30);
  const tried = new Set<number>();

  for (const row of data ?? []) {
    const metadata = (row as { metadata_json?: unknown }).metadata_json;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    const index = Number((metadata as { attemptIndex?: unknown }).attemptIndex);
    if (Number.isInteger(index) && index >= 0) {
      tried.add(index);
    }
  }

  for (let index = 0; index < attempts.length; index += 1) {
    if (!tried.has(index)) {
      return index;
    }
  }

  return attempts.length;
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
        body,
        timeoutMs: 7_000
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
    (error.status === 400 ||
      error.code === "INVALID_SHIPPING_SERVICE" ||
      error.code === "FULFILLMENT_POLICY_CREATE_FAILED" ||
      Boolean(error.status && error.status >= 500))
  );
}

function summarizePolicyCreateError(error: unknown): PolicyCreateErrorSummary {
  if (error instanceof EbayIntegrationError) {
    const isFulfillmentFailure =
      error.code === "FULFILLMENT_POLICY_CREATE_FAILED" || hasFulfillmentPolicyAttemptDetails(error.details);
    const code = error.code === "PUBLISH_FAILED" && isFulfillmentFailure ? "FULFILLMENT_POLICY_CREATE_FAILED" : error.code;
    const message =
      isFulfillmentFailure && hasFulfillmentPolicyTimeout(error.details)
        ? "eBay sandbox timed out while creating the fulfillment policy. Try again; if it repeats, inspect Policy creation details."
      : code === "INVALID_SHIPPING_SERVICE"
        ? "Invalid shipping service code for fulfillment policy. The app will retry with another sandbox-safe service."
        : error.message;
    const attemptedShippingServices = extractAttemptedShippingServicesFromDetails(error.details);

    return {
      code,
      message,
      recommendation: error.recommendation ?? getEbayErrorRecommendation(code),
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
            ? ((attempt as { serviceCode?: unknown }).serviceCode ??
                (attempt as { shippingServiceCode?: unknown }).shippingServiceCode)
            : null
        )
        .filter((value): value is string => typeof value === "string")
    )
  );
}

function hasDiscoveryFailure(details: unknown) {
  return Boolean(details && typeof details === "object" && "discoveryFailed" in details && (details as { discoveryFailed?: unknown }).discoveryFailed);
}

function hasFulfillmentPolicyAttemptDetails(details: unknown): boolean {
  if (!details || typeof details !== "object") {
    return false;
  }

  return "attempts" in details || ("ebay" in details && hasFulfillmentPolicyAttemptDetails((details as { ebay?: unknown }).ebay));
}

function hasFulfillmentPolicyTimeout(details: unknown): boolean {
  const attempts = getAttemptDetailsArray(details);

  return attempts.some((attempt) => {
    if (!attempt || typeof attempt !== "object") {
      return false;
    }

    return (attempt as { status?: unknown }).status === "timeout";
  });
}

function getAttemptDetailsArray(details: unknown): unknown[] {
  if (!details || typeof details !== "object") {
    return [];
  }

  if ("attempts" in details) {
    const attempts = (details as { attempts?: unknown }).attempts;
    return Array.isArray(attempts) ? attempts : [];
  }

  if ("ebay" in details) {
    return getAttemptDetailsArray((details as { ebay?: unknown }).ebay);
  }

  return [];
}

function isFulfillmentPolicyTimeoutError(error: unknown): boolean {
  if (!(error instanceof EbayIntegrationError)) {
    return false;
  }

  const details = error.details;

  return (
    error.code === "FULFILLMENT_POLICY_CREATE_FAILED" &&
    Boolean(details && typeof details === "object" && "timeoutMs" in details)
  );
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

function extractAttemptsFromPolicyError(error?: PolicyCreateErrorSummary) {
  if (!error?.details || typeof error.details !== "object") {
    return [];
  }

  const ebayDetails = "ebay" in error.details ? (error.details as { ebay?: unknown }).ebay : error.details;

  if (!ebayDetails || typeof ebayDetails !== "object" || !("attempts" in ebayDetails)) {
    return [];
  }

  const attempts = (ebayDetails as { attempts?: unknown }).attempts;

  return Array.isArray(attempts) ? attempts : [];
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

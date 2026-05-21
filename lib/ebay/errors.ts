export class EbayIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recommendation?: string,
    public readonly details?: unknown,
    public readonly status?: number
  ) {
    super(message);
    this.name = "EbayIntegrationError";
  }
}

export function getEbayErrorRecommendation(code: string) {
  const recommendations: Record<string, string> = {
    PRODUCTION_DISABLED: "Use eBay sandbox credentials and EBAY_ENVIRONMENT=sandbox.",
    MISSING_EBAY_ENV: "Add eBay sandbox client ID, client secret, RuName, and callback URL to your environment.",
    OAUTH_STATE_INVALID: "Start eBay sandbox connection again from Settings.",
    OAUTH_STATE_EXPIRED: "Start eBay sandbox connection again; OAuth state links expire after 15 minutes.",
    TOKEN_EXCHANGE_FAILED: "Confirm EBAY_RUNAME matches the eBay Developer portal RuName and retry Connect sandbox.",
    TOKEN_EXPIRED: "Reconnect eBay or refresh the OAuth token before publishing.",
    EBAY_TIMEOUT: "Retry the bounded sandbox request. If repeated fulfillment requests time out, run the official docs fulfillment test.",
    EBAY_INTERNAL_ERROR:
      "eBay returned an internal sandbox API error. Run the official docs fulfillment test and keep publishing blocked until eBay creates a real fulfillment policy.",
    PUBLISH_READINESS_FAILED: "Fix the listed readiness issues before publishing to eBay sandbox.",
    BUSINESS_POLICY_NOT_ELIGIBLE:
      "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again.",
    SELLING_POLICY_NOT_OPTED_IN:
      "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again.",
    MISSING_POLICY:
      "Business Policies are active, but no payment/return/fulfillment policies exist yet. Click Create default seller policies or create them manually in seller settings.",
    MISSING_POLICY_ID:
      "Business Policies are active, but no payment/return/fulfillment policies exist yet. Click Create default seller policies or create them manually in seller settings.",
    MISSING_LOCATION: "Create or select an eBay inventory location key.",
    INVALID_SHIPPING_SERVICE:
      "Invalid shipping service code for fulfillment policy. The app will retry with another sandbox-safe service.",
    FULFILLMENT_POLICY_CREATE_FAILED:
      "Retry fulfillment policy from Settings. If eBay sandbox times out again, inspect Policy creation details and Vercel logs.",
    INVALID_CATEGORY: "Review the suggested eBay category and required item specifics.",
    INVALID_ASPECTS: "Review item specifics for the category and remove unsupported or empty values.",
    IMAGE_ERROR: "Check optimized image URLs and make sure eBay can access them.",
    INVALID_CONDITION: "Use a supported eBay condition such as NEW before publishing.",
    DUPLICATE_SKU: "Use a unique SKU or revise the existing inventory item.",
    RATE_LIMIT: "Pause automation and retry after the eBay API limit resets.",
    NOT_FOUND: "Confirm the requested eBay resource exists in the sandbox seller account.",
    PUBLISH_FAILED: "Keep the draft, review eBay's error details, and retry from the listings page."
  };

  return recommendations[code] ?? "Review the integration logs for the exact eBay API response.";
}

export function classifyEbayError(status: number, payload: unknown) {
  const text = stringifyEbayPayload(payload).toLowerCase();

  if (status === 401) {
    return "TOKEN_EXPIRED";
  }

  if (status === 404) {
    return "NOT_FOUND";
  }

  if (status === 429) {
    return "RATE_LIMIT";
  }

  if (isEbayInternalApplicationError(status, payload)) {
    return "EBAY_INTERNAL_ERROR";
  }

  if (/shipping service|domesticshippingservice|shippingservicecode|shippingservice/.test(text)) {
    return "INVALID_SHIPPING_SERVICE";
  }

  if (isSellingPolicyManagementEligibilityError(payload)) {
    return "BUSINESS_POLICY_NOT_ELIGIBLE";
  }

  if (/policy|paymentpolicyid|returnpolicyid|fulfillmentpolicyid|business polic/.test(text)) {
    return "MISSING_POLICY";
  }

  if (/merchantlocationkey|inventory location|location key|merchant location|warehouse|postal|address|location/.test(text)) {
    return "MISSING_LOCATION";
  }

  if (/invalid category|category.*invalid|categoryid.*invalid|category id.*invalid/.test(text)) {
    return "INVALID_CATEGORY";
  }

  if (/aspect|specific/.test(text)) {
    return "INVALID_ASPECTS";
  }

  if (/image|picture|photo|url/.test(text)) {
    return "IMAGE_ERROR";
  }

  if (/condition/.test(text)) {
    return "INVALID_CONDITION";
  }

  if (/duplicate|sku already|inventory item already|conflict/.test(text) || status === 409) {
    return "DUPLICATE_SKU";
  }

  return "PUBLISH_FAILED";
}

export function isSellingPolicyManagementEligibilityError(payload: unknown) {
  const text = stringifyEbayPayload(payload).toLowerCase();

  return (
    text.includes("user is not eligible for business policy") ||
    (/20403/.test(text) && /business polic/.test(text) && /eligib|opted|opt in|opt-in/.test(text))
  );
}

export function isEbayInternalApplicationError(status: number, payload: unknown) {
  const text = stringifyEbayPayload(payload).toLowerCase();

  return (
    (status >= 500 && status <= 599 && /20500/.test(text)) ||
    (status >= 500 && /internal application error|internal server error/.test(text))
  );
}

export function stringifyEbayPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload) {
    return "";
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

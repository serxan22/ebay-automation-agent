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
    PUBLISH_READINESS_FAILED: "Fix the listed readiness issues before publishing to eBay sandbox.",
    SELLING_POLICY_NOT_OPTED_IN:
      "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again.",
    MISSING_POLICY_ID: "Go to eBay settings and select payment, return, and fulfillment policies.",
    MISSING_LOCATION: "Create or select an eBay inventory location key.",
    INVALID_CATEGORY: "Review the suggested eBay category and required item specifics.",
    INVALID_ASPECTS: "Review item specifics for the category and remove unsupported or empty values.",
    IMAGE_ERROR: "Check optimized image URLs and make sure eBay can access them.",
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

  if (isSellingPolicyManagementEligibilityError(payload)) {
    return "SELLING_POLICY_NOT_OPTED_IN";
  }

  if (/policy|paymentpolicyid|returnpolicyid|fulfillmentpolicyid|business polic/.test(text)) {
    return "MISSING_POLICY_ID";
  }

  if (/merchantlocationkey|inventory location|location key|location/.test(text)) {
    return "MISSING_LOCATION";
  }

  if (/category|categoryid/.test(text)) {
    return "INVALID_CATEGORY";
  }

  if (/aspect|specific/.test(text)) {
    return "INVALID_ASPECTS";
  }

  if (/image|picture|photo|url/.test(text)) {
    return "IMAGE_ERROR";
  }

  if (/duplicate|sku already|inventory item already|conflict/.test(text) || status === 409) {
    return "DUPLICATE_SKU";
  }

  return "PUBLISH_FAILED";
}

export function isSellingPolicyManagementEligibilityError(payload: unknown) {
  const text = stringifyEbayPayload(payload).toLowerCase();

  return text.includes("20403") || text.includes("user is not eligible for business policy");
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

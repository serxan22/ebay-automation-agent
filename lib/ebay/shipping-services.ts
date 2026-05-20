import { getEbayApiBaseUrl, getEbayConfig } from "@/lib/ebay/client";
import { EbayIntegrationError } from "@/lib/ebay/errors";

export interface EbayShippingService {
  shippingService: string;
  description?: string;
  internationalService?: boolean;
  validForSellingFlow?: boolean;
}

const TRADING_API_DISCOVERY_TIMEOUT_MS = 8_000;

export const fallbackShippingServices: EbayShippingService[] = [
  {
    shippingService: "USPSFirstClass",
    description: "USPS First Class",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "USPSPriority",
    description: "USPS Priority Mail",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "UPSGround",
    description: "UPS Ground",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "FedExHomeDelivery",
    description: "FedEx Home Delivery",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "USPSPriorityFlatRateBox",
    description: "USPS Priority Mail Flat Rate Box",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "USPSGroundAdvantage",
    description: "USPS Ground Advantage",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "USPSParcel",
    description: "USPS Parcel",
    internationalService: false,
    validForSellingFlow: true
  },
  {
    shippingService: "FedExGround",
    description: "FedEx Ground",
    internationalService: false,
    validForSellingFlow: true
  }
];

export async function discoverEbayShippingServices(accessToken: string) {
  const config = getEbayConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRADING_API_DISCOVERY_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${getEbayApiBaseUrl(config.environment)}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-CALL-NAME": "GeteBayDetails",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1231",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-IAF-TOKEN": accessToken
      },
      body: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">',
        "<DetailName>ShippingServiceDetails</DetailName>",
        "</GeteBayDetailsRequest>"
      ].join(""),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EbayIntegrationError(
        "eBay shipping service discovery timed out.",
        "PUBLISH_FAILED",
        "Use fallback shipping services or retry eBay sandbox discovery.",
        { timeoutMs: TRADING_API_DISCOVERY_TIMEOUT_MS }
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new EbayIntegrationError(
      `eBay shipping service discovery failed (${response.status}).`,
      "PUBLISH_FAILED",
      "Use fallback shipping services or retry eBay sandbox discovery.",
      { status: response.status, statusText: response.statusText, response: text.slice(0, 1000) },
      response.status
    );
  }

  const ack = getFirstXmlTagValue(text, "Ack");
  if (ack && !["Success", "Warning"].includes(ack)) {
    throw new EbayIntegrationError(
      "eBay shipping service discovery returned an error.",
      "PUBLISH_FAILED",
      "Use fallback shipping services or retry eBay sandbox discovery.",
      { ack, errors: extractTradingApiErrors(text) }
    );
  }

  const services = parseShippingServiceDetails(text);

  if (!services.length) {
    throw new EbayIntegrationError(
      "eBay shipping service discovery returned no services.",
      "PUBLISH_FAILED",
      "Use fallback shipping services or retry eBay sandbox discovery.",
      { ack }
    );
  }

  return services;
}

export async function discoverShippingServicesWithFallback(accessToken: string) {
  try {
    const services = await discoverEbayShippingServices(accessToken);
    return {
      services,
      discovered: true,
      discoveryError: null,
      fallbackServices: fallbackShippingServices
    };
  } catch (error) {
    return {
      services: fallbackShippingServices,
      discovered: false,
      discoveryError: error instanceof Error ? error.message : "Shipping service discovery failed.",
      fallbackServices: fallbackShippingServices
    };
  }
}

export function getPreferredDomesticShippingServices(services: EbayShippingService[]) {
  const preferred = [
    "USPSFirstClass",
    "USPSPriority",
    "UPSGround",
    "FedExHomeDelivery",
    "USPSPriorityFlatRateBox",
    "USPSGroundAdvantage",
    "USPSParcel",
    "FedExGround"
  ];
  const domesticValid = services.filter(
    (service) =>
      Boolean(service.shippingService) &&
      service.internationalService !== true &&
      service.validForSellingFlow !== false
  );
  const ordered = [
    ...preferred
      .map((code) => domesticValid.find((service) => service.shippingService === code))
      .filter((service): service is EbayShippingService => Boolean(service)),
    ...domesticValid.filter((service) => !preferred.includes(service.shippingService))
  ];

  return dedupeShippingServices(ordered);
}

export function inferShippingCarrierCode(shippingServiceCode: string) {
  if (shippingServiceCode.startsWith("UPS")) {
    return "UPS";
  }

  if (shippingServiceCode.startsWith("FedEx")) {
    return "FedEx";
  }

  if (shippingServiceCode.startsWith("USPS")) {
    return "USPS";
  }

  return "USPS";
}

function parseShippingServiceDetails(xml: string): EbayShippingService[] {
  const blocks = getXmlBlocks(xml, "ShippingServiceDetails");

  return blocks
    .map((block) => ({
      shippingService: getFirstXmlTagValue(block, "ShippingService") ?? "",
      description: getFirstXmlTagValue(block, "Description") ?? undefined,
      internationalService: parseXmlBoolean(getFirstXmlTagValue(block, "InternationalService")),
      validForSellingFlow: parseXmlBoolean(getFirstXmlTagValue(block, "ValidForSellingFlow"))
    }))
    .filter((service) => Boolean(service.shippingService));
}

function dedupeShippingServices(services: EbayShippingService[]) {
  const seen = new Set<string>();
  const unique: EbayShippingService[] = [];

  for (const service of services) {
    if (seen.has(service.shippingService)) {
      continue;
    }

    seen.add(service.shippingService);
    unique.push(service);
  }

  return unique;
}

function getXmlBlocks(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml))) {
    blocks.push(match[1]);
  }

  return blocks;
}

function getFirstXmlTagValue(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i");
  const match = pattern.exec(xml);

  return match?.[1]?.trim();
}

function parseXmlBoolean(value?: string | null) {
  if (value == null) {
    return undefined;
  }

  return value.toLowerCase() === "true";
}

function extractTradingApiErrors(xml: string) {
  return getXmlBlocks(xml, "Errors").map((block) => ({
    errorId: getFirstXmlTagValue(block, "ErrorCode"),
    longMessage: getFirstXmlTagValue(block, "LongMessage") ?? getFirstXmlTagValue(block, "ShortMessage"),
    severity: getFirstXmlTagValue(block, "SeverityCode")
  }));
}

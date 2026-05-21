import { z } from "zod";
import { getConfiguredAiProvider } from "@/lib/ai";
import { listingGeneratorSystemPrompt } from "@/lib/ai/prompts/listing-generator";
import type { ListingGenerationResult, ProductAnalysis, SupplierProduct } from "@/lib/types";

const ListingGenerationSchema = z.object({
  ebayTitle: z.string().min(10).max(80),
  ebayDescription: z.string().min(40),
  bulletPoints: z.array(z.string()).min(2).max(8),
  itemSpecifics: z.record(z.string()),
  categorySuggestion: z.string().min(2),
  seoKeywords: z.array(z.string()).max(12),
  shippingNote: z.string(),
  returnNote: z.string(),
  conditionNote: z.string(),
  warnings: z.array(z.string()).default([])
});

export interface GenerateListingInput {
  product: SupplierProduct;
  analysis?: ProductAnalysis;
}

export async function generateListing({
  product,
  analysis
}: GenerateListingInput): Promise<ListingGenerationResult> {
  const provider = getConfiguredAiProvider();

  if (!provider) {
    return createFallbackListing(product, analysis);
  }

  try {
    const result = await provider.generateJson<ListingGenerationResult>({
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: listingGeneratorSystemPrompt
        },
        {
          role: "user",
          content: JSON.stringify({
            product,
            analysis,
            requiredShape: {
              ebayTitle: "string <= 80 chars",
              ebayDescription: "professional safe HTML",
              bulletPoints: ["facts only"],
              itemSpecifics: { Brand: "Only if supplied", Type: "Safe generic type" },
              categorySuggestion: "string",
              seoKeywords: ["string"],
              shippingNote: "Do not exaggerate delivery speed",
              returnNote: "Generic return note",
              conditionNote: "New only if supplier data supports it",
              warnings: ["missing data or compliance warnings"]
            }
          })
        }
      ]
    });

    return ListingGenerationSchema.parse(result);
  } catch (error) {
    return {
      ...createFallbackListing(product, analysis),
      warnings: [`AI provider fallback used: ${error instanceof Error ? error.message : "Unknown error"}`]
    };
  }
}

function createFallbackListing(
  product: SupplierProduct,
  analysis?: ProductAnalysis
): ListingGenerationResult {
  const title = buildSafeTitle(product);
  const escapedTitle = escapeHtml(product.title);
  const escapedDescription = escapeHtml(product.description ?? "Quality item supplied by an approved resale source.");
  const category = product.category ?? "General Merchandise";
  const bulletPoints = [
    `Suitable for ${category.toLowerCase()} needs`,
    product.brand ? `Brand: ${product.brand}` : "Brand information not provided by supplier",
    `Ships based on supplier-confirmed handling time of ${product.shippingDays} days`,
    "Listing content uses supplier-provided facts only"
  ];
  const itemSpecifics: Record<string, string> = {
    Type: category,
    Condition: "New",
    "Country/Region of Manufacture": product.countryOfOrigin ?? "Not specified"
  };

  if (product.brand?.trim()) {
    itemSpecifics.Brand = product.brand.trim();
  }

  return {
    ebayTitle: title,
    ebayDescription: `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapedDescription}</p>
        <ul>${bulletPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
        <h3>Key Features</h3>
        <ul>${bulletPoints.slice(0, 3).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
        <p><strong>Package Includes:</strong> Item shown in the supplier listing.</p>
        <p><strong>Shipping:</strong> ${escapeHtml(`Estimated handling time is based on the supplier feed: ${product.shippingDays} days.`)}</p>
        <p><strong>Returns:</strong> Returns follow the seller's active eBay return policy.</p>
        <p><strong>Seller note:</strong> Product details are reviewed against supplier data before approval.</p>
      </section>
    `.trim(),
    bulletPoints,
    itemSpecifics,
    categorySuggestion: category,
    seoKeywords: deriveKeywords(product),
    shippingNote: `Estimated handling and shipping time is based on the supplier feed: ${product.shippingDays} days.`,
    returnNote: "Returns follow the seller's active eBay return policy.",
    conditionNote: "New item; confirm final condition against supplier data before publishing.",
    warnings: analysis?.rejectionReasons ?? []
  };
}

function buildSafeTitle(product: SupplierProduct) {
  const titleIncludesBrand =
    product.brand && new RegExp(`\\b${escapeRegExp(product.brand)}\\b`, "i").test(product.title);
  const pieces = [
    product.brand && !/unbranded/i.test(product.brand) && !titleIncludesBrand ? product.brand : "",
    product.title,
    product.category
  ].filter(Boolean);
  return pieces.join(" ").replace(/\s+/g, " ").slice(0, 80).trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveKeywords(product: SupplierProduct) {
  const words = `${product.title} ${product.category ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);

  return Array.from(new Set(words)).slice(0, 10);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

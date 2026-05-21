import { classifyEbayError, EbayIntegrationError, getEbayErrorRecommendation, stringifyEbayPayload } from "@/lib/ebay/errors";

export interface EbayCategorySuggestionResult {
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  categoryTreeId: string;
  categoryTreeVersion?: string | null;
  confidence: number | null;
  queryUsed: string;
  source: "ebay_taxonomy_suggestion";
}

export interface ResolveEbayCategoryInput {
  accessToken: string;
  marketplaceId?: string;
  title?: string | null;
  productTitle?: string | null;
  categoryHint?: string | null;
  keywords?: string[] | null;
  timeoutMs?: number;
}

interface DefaultCategoryTreeResponse {
  categoryTreeId?: string;
  categoryTreeVersion?: string;
}

interface CategoryReference {
  categoryId?: string;
  categoryName?: string;
}

interface CategorySuggestion {
  category?: CategoryReference;
  categoryTreeNodeAncestors?: CategoryReference[];
}

interface CategorySuggestionsResponse {
  categorySuggestions?: CategorySuggestion[];
  categoryTreeId?: string;
  categoryTreeVersion?: string;
}

const DEFAULT_TAXONOMY_TIMEOUT_MS = 15_000;

export async function resolveEbayCategory({
  accessToken,
  marketplaceId = "EBAY_US",
  title,
  productTitle,
  categoryHint,
  keywords,
  timeoutMs = DEFAULT_TAXONOMY_TIMEOUT_MS
}: ResolveEbayCategoryInput): Promise<EbayCategorySuggestionResult | null> {
  const tree = await getDefaultCategoryTreeId({ accessToken, marketplaceId, timeoutMs });
  const queries = buildCategoryQueries({ title, productTitle, categoryHint, keywords });

  for (const query of queries) {
    const suggestions = await getCategorySuggestions({
      accessToken,
      categoryTreeId: tree.categoryTreeId,
      query,
      timeoutMs
    });
    const firstSuggestion = suggestions.categorySuggestions?.find((suggestion) => suggestion.category?.categoryId);

    if (!firstSuggestion?.category?.categoryId) {
      continue;
    }

    const categoryName = firstSuggestion.category.categoryName?.trim() || firstSuggestion.category.categoryId;
    const path = buildCategoryPath(firstSuggestion);

    return {
      categoryId: firstSuggestion.category.categoryId,
      categoryName,
      categoryPath: path || categoryName,
      categoryTreeId: tree.categoryTreeId,
      categoryTreeVersion: tree.categoryTreeVersion ?? suggestions.categoryTreeVersion ?? null,
      confidence: estimateCategoryConfidence(query, firstSuggestion),
      queryUsed: query,
      source: "ebay_taxonomy_suggestion"
    };
  }

  return null;
}

export async function getDefaultCategoryTreeId({
  accessToken,
  marketplaceId = "EBAY_US",
  timeoutMs = DEFAULT_TAXONOMY_TIMEOUT_MS
}: {
  accessToken: string;
  marketplaceId?: string;
  timeoutMs?: number;
}) {
  const response = await ebayTaxonomyFetch<DefaultCategoryTreeResponse>({
    accessToken,
    path: `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    timeoutMs
  });

  if (!response.categoryTreeId) {
    throw new EbayIntegrationError(
      "eBay Taxonomy did not return a category tree ID.",
      "INVALID_CATEGORY",
      "Retry category resolution. If it still fails, enter the eBay category ID manually.",
      { marketplaceId, response }
    );
  }

  return {
    categoryTreeId: response.categoryTreeId,
    categoryTreeVersion: response.categoryTreeVersion ?? null
  };
}

export async function getCategorySuggestions({
  accessToken,
  categoryTreeId,
  query,
  timeoutMs = DEFAULT_TAXONOMY_TIMEOUT_MS
}: {
  accessToken: string;
  categoryTreeId: string;
  query: string;
  timeoutMs?: number;
}) {
  return ebayTaxonomyFetch<CategorySuggestionsResponse>({
    accessToken,
    path: `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTreeId)}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    timeoutMs
  });
}

export async function ebayTaxonomyFetch<T>({
  accessToken,
  path,
  timeoutMs = DEFAULT_TAXONOMY_TIMEOUT_MS
}: {
  accessToken: string;
  path: string;
  timeoutMs?: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(`${getTaxonomyApiBaseUrl()}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EbayIntegrationError(
        `eBay Taxonomy request timed out after ${timeoutMs}ms.`,
        "EBAY_TIMEOUT",
        getEbayErrorRecommendation("EBAY_TIMEOUT"),
        { path, timeoutMs }
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readTaxonomyPayload(response);

  if (!response.ok) {
    const code = classifyEbayError(response.status, payload);
    throw new EbayIntegrationError(
      `eBay Taxonomy request failed (${response.status}): ${summarizePayload(payload)}`,
      code,
      getEbayErrorRecommendation(code),
      { path, status: response.status, responseBody: payload, taxonomyHost: getTaxonomyApiBaseUrl() },
      response.status
    );
  }

  return payload as T;
}

export function getTaxonomyApiBaseUrl() {
  const configured = process.env.EBAY_TAXONOMY_API_HOST?.trim().toLowerCase();

  if (configured === "sandbox") {
    return "https://api.sandbox.ebay.com";
  }

  return "https://api.ebay.com";
}

function buildCategoryQueries({
  title,
  productTitle,
  categoryHint,
  keywords
}: {
  title?: string | null;
  productTitle?: string | null;
  categoryHint?: string | null;
  keywords?: string[] | null;
}) {
  const rawQueries = [
    `${title ?? ""} ${categoryHint ?? ""}`,
    `${productTitle ?? ""} ${categoryHint ?? ""}`,
    title,
    productTitle,
    keywords?.join(" "),
    categoryHint
  ];

  return Array.from(
    new Set(
      rawQueries
        .map((query) => normalizeQuery(query ?? ""))
        .filter((query) => query.length >= 3)
    )
  ).slice(0, 5);
}

function normalizeQuery(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 350);
}

function buildCategoryPath(suggestion: CategorySuggestion) {
  const ancestors = [...(suggestion.categoryTreeNodeAncestors ?? [])].reverse();
  const names = [...ancestors, suggestion.category]
    .map((category) => category?.categoryName?.trim())
    .filter((name): name is string => Boolean(name));

  return names.join(" > ");
}

function estimateCategoryConfidence(query: string, suggestion: CategorySuggestion) {
  const categoryText = `${suggestion.category?.categoryName ?? ""} ${buildCategoryPath(suggestion)}`.toLowerCase();
  const queryWords = Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    )
  );

  if (queryWords.length === 0) {
    return null;
  }

  const matches = queryWords.filter((word) => categoryText.includes(word)).length;
  const score = 0.62 + Math.min(0.28, matches / queryWords.length / 3);

  return Number(score.toFixed(2));
}

async function readTaxonomyPayload(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function summarizePayload(payload: unknown) {
  const text = stringifyEbayPayload(payload);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

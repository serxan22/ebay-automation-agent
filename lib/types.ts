export type ApprovalMode = "manual" | "trusted_auto" | "full_auto";
export type RiskTolerance = "conservative" | "balanced" | "aggressive";
export type SupplierType =
  | "csv"
  | "api"
  | "manual"
  | "doba"
  | "wholesale2b"
  | "inventorysource"
  | "syncee"
  | "custom";

export type SupplierStatus = "active" | "inactive" | "needs_attention";
export type ListingDraftStatus = "draft" | "approved" | "rejected" | "published" | "failed";
export type AutomationLogLevel = "info" | "warning" | "error" | "success";

export interface AutomationSettings {
  userId: string;
  dailyListingLimit: number;
  minProfitAmount: number;
  minMarginPercentage: number;
  maxShippingDays: number;
  minStockQuantity: number;
  autoListingEnabled: boolean;
  approvalMode: ApprovalMode;
  riskTolerance: number;
  defaultQuantity: number;
  pricingBufferPercentage: number;
  promotedListingPercentage: number;
  allowedCategories: string[];
  blockedCategories: string[];
  blockedBrands: string[];
  blockedKeywords: string[];
  supplierPriority: string[];
  defaultMarketplace: string;
  shippingCountryPreference: string;
  maxPrice?: number | null;
  minPrice?: number | null;
  requireImageQualityScore: number;
  requireDemandScore: number;
  newAccountSafeMode: boolean;
}

export interface Supplier {
  id: string;
  userId: string;
  name: string;
  type: SupplierType;
  baseUrl?: string | null;
  status: SupplierStatus;
  country?: string | null;
  defaultShippingDays: number;
  allowsDropshipping: boolean;
  notes?: string | null;
}

export interface SupplierProduct {
  id?: string;
  userId?: string;
  supplierId: string;
  supplierSku: string;
  title: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  supplierPrice: number;
  shippingCost: number;
  stockQuantity: number;
  currency: string;
  productUrl?: string | null;
  imageUrls: string[];
  rawData?: Record<string, unknown>;
  shippingDays: number;
  countryOfOrigin?: string | null;
}

export interface PriceCalculation {
  supplierCost: number;
  shippingCost: number;
  totalCost: number;
  estimatedEbayFees: number;
  promotedCost: number;
  buffer: number;
  recommendedEbayPrice: number;
  estimatedProfit: number;
  marginPercentage: number;
  estimatedFeeRate: number;
}

export interface ProductAnalysis {
  profitScore: number;
  riskScore: number;
  demandScore: number;
  competitionScore: number;
  imageScore: number;
  shippingScore: number;
  finalScore: number;
  estimatedEbayFees: number;
  estimatedTotalCost: number;
  recommendedEbayPrice: number;
  estimatedProfit: number;
  marginPercentage: number;
  aiNotes: string;
  rejectionReasons: string[];
  approvedForListing: boolean;
}

export interface ListingGenerationResult {
  ebayTitle: string;
  ebayDescription: string;
  bulletPoints: string[];
  itemSpecifics: Record<string, string>;
  categorySuggestion: string;
  seoKeywords: string[];
  shippingNote: string;
  returnNote: string;
  conditionNote: string;
  warnings: string[];
}

export interface ListingDraft {
  id?: string;
  supplierProductId: string;
  analysisId?: string | null;
  ebayTitle: string;
  ebayDescription: string;
  ebayCategoryId?: string | null;
  itemSpecifics: Record<string, string>;
  condition: string;
  quantity: number;
  price: number;
  optimizedImageUrls: string[];
  status: ListingDraftStatus;
  aiGenerated: boolean;
}

export interface AgentTaskResult {
  ok: boolean;
  message: string;
  metrics?: Record<string, number | string | boolean>;
  warnings?: string[];
}

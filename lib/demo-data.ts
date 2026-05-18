import { analyzeProduct } from "@/lib/products/analyze-product";
import type { AutomationSettings, Supplier, SupplierProduct } from "@/lib/types";

export const demoSettings: AutomationSettings = {
  userId: "demo-user",
  dailyListingLimit: 5,
  minProfitAmount: 5,
  minMarginPercentage: 25,
  maxShippingDays: 5,
  minStockQuantity: 5,
  autoListingEnabled: false,
  approvalMode: "manual",
  riskTolerance: 80,
  defaultQuantity: 1,
  pricingBufferPercentage: 5,
  promotedListingPercentage: 0,
  allowedCategories: ["home", "kitchen", "office", "garden"],
  blockedCategories: [
    "electronics",
    "supplements",
    "luxury goods",
    "cosmetics",
    "medical",
    "children safety",
    "weapons",
    "adult",
    "copyrighted",
    "fandom"
  ],
  blockedBrands: ["Apple", "Nike", "Disney"],
  blockedKeywords: ["replica", "official", "licensed"],
  supplierPriority: ["supplier-1", "supplier-2"],
  defaultMarketplace: "EBAY_US",
  shippingCountryPreference: "US",
  maxPrice: 150,
  minPrice: 8,
  requireImageQualityScore: 65,
  requireDemandScore: 35,
  newAccountSafeMode: true
};

export const demoSuppliers: Supplier[] = [
  {
    id: "supplier-1",
    userId: "demo-user",
    name: "NorthStar Wholesale CSV",
    type: "csv",
    baseUrl: null,
    status: "active",
    country: "US",
    defaultShippingDays: 4,
    allowsDropshipping: true,
    notes: "Approved wholesale feed with resale permission and stable US handling."
  },
  {
    id: "supplier-2",
    userId: "demo-user",
    name: "HomeGoods API Placeholder",
    type: "custom",
    baseUrl: "https://supplier.example.com",
    status: "needs_attention",
    country: "US",
    defaultShippingDays: 6,
    allowsDropshipping: true,
    notes: "Future custom API connector. Needs stock sync credentials."
  },
  {
    id: "supplier-3",
    userId: "demo-user",
    name: "Unverified Marketplace Source",
    type: "manual",
    baseUrl: null,
    status: "inactive",
    country: "CN",
    defaultShippingDays: 14,
    allowsDropshipping: false,
    notes: "Blocked by compliance until resale approval is documented."
  }
];

export const demoProducts: SupplierProduct[] = [
  {
    id: "product-1",
    userId: "demo-user",
    supplierId: "supplier-1",
    supplierSku: "NS-KIT-1024",
    title: "Expandable Bamboo Kitchen Drawer Organizer",
    description:
      "Adjustable bamboo drawer organizer with multiple compartments for utensils, flatware, and kitchen tools.",
    brand: "NorthStar Home",
    category: "home kitchen",
    supplierPrice: 14.2,
    shippingCost: 4.5,
    stockQuantity: 86,
    currency: "USD",
    productUrl: "https://example.com/products/ns-kit-1024",
    imageUrls: ["https://images.unsplash.com/photo-1556911220-bff31c812dba"],
    rawData: {},
    shippingDays: 4,
    countryOfOrigin: "US"
  },
  {
    id: "product-2",
    userId: "demo-user",
    supplierId: "supplier-1",
    supplierSku: "NS-OFC-220",
    title: "Metal Mesh Desk File Organizer with Sliding Drawer",
    description:
      "Desk organizer for office supplies, papers, notebooks, and small accessories with a compact metal mesh frame.",
    brand: "NorthStar Office",
    category: "office organization",
    supplierPrice: 9.85,
    shippingCost: 3.95,
    stockQuantity: 44,
    currency: "USD",
    productUrl: "https://example.com/products/ns-ofc-220",
    imageUrls: ["https://images.unsplash.com/photo-1497366754035-f200968a6e72"],
    rawData: {},
    shippingDays: 3,
    countryOfOrigin: "US"
  },
  {
    id: "product-3",
    userId: "demo-user",
    supplierId: "supplier-3",
    supplierSku: "MK-EL-999",
    title: "Wireless Earbuds Compatible with Apple Devices",
    description: "Bluetooth style earbuds with case.",
    brand: "Apple",
    category: "electronics",
    supplierPrice: 18,
    shippingCost: 6,
    stockQuantity: 3,
    currency: "USD",
    productUrl: "https://example.com/products/mk-el-999",
    imageUrls: [],
    rawData: {},
    shippingDays: 12,
    countryOfOrigin: "CN"
  }
];

export const demoAnalyses = demoProducts.map((product) =>
  analyzeProduct({
    product,
    settings: demoSettings,
    supplier: demoSuppliers.find((supplier) => supplier.id === product.supplierId)
  })
);

export const demoLogs = [
  {
    level: "success" as const,
    module: "supplier",
    message: "CSV import preview completed for NorthStar Wholesale.",
    time: "09:12"
  },
  {
    level: "warning" as const,
    module: "compliance",
    message: "Electronics product rejected by new seller safe mode.",
    time: "09:15"
  },
  {
    level: "info" as const,
    module: "agent",
    message: "Manual approval mode is active. Drafts are held before publishing.",
    time: "09:18"
  }
];

export const demoReports = [
  {
    title: "Daily Safety Report",
    type: "daily",
    content: "3 products scanned, 2 passed initial checks, 1 rejected for supplier and category risk.",
    metric: "$41.70 estimated profit"
  },
  {
    title: "Supplier Health",
    type: "risk",
    content: "1 supplier needs API credentials. 1 source blocked because resale permission is missing.",
    metric: "82 health score"
  }
];

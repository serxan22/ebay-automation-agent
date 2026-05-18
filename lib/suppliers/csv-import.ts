import Papa from "papaparse";
import { z } from "zod";
import type { SupplierProduct } from "@/lib/types";

export const csvImportMappingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  supplierSku: z.string().min(1),
  brand: z.string().optional(),
  category: z.string().optional(),
  supplierPrice: z.string().min(1),
  shippingCost: z.string().optional(),
  stockQuantity: z.string().optional(),
  productUrl: z.string().optional(),
  imageUrl1: z.string().optional(),
  imageUrl2: z.string().optional(),
  imageUrl3: z.string().optional(),
  shippingDays: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional()
});

export type CsvImportMapping = z.infer<typeof csvImportMappingSchema>;

export interface ParsedSupplierCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface CsvImportResult {
  products: SupplierProduct[];
  errors: Array<{ row: number; message: string }>;
}

export const defaultCsvMapping: CsvImportMapping = {
  title: "title",
  description: "description",
  supplierSku: "supplier_sku",
  brand: "brand",
  category: "category",
  supplierPrice: "supplier_price",
  shippingCost: "shipping_cost",
  stockQuantity: "stock_quantity",
  productUrl: "product_url",
  imageUrl1: "image_url_1",
  imageUrl2: "image_url_2",
  imageUrl3: "image_url_3",
  shippingDays: "shipping_days",
  country: "country",
  currency: "currency"
};

export function parseSupplierCsv(csvText: string): ParsedSupplierCsv {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return {
    headers: parsed.meta.fields ?? [],
    rows: parsed.data
  };
}

export function mapCsvProducts({
  parsed,
  mapping,
  supplierId,
  userId
}: {
  parsed: ParsedSupplierCsv;
  mapping: CsvImportMapping;
  supplierId: string;
  userId?: string;
}): CsvImportResult {
  const result = csvImportMappingSchema.safeParse(mapping);

  if (!result.success) {
    return {
      products: [],
      errors: [{ row: 0, message: result.error.errors.map((error) => error.message).join(", ") }]
    };
  }

  const products: SupplierProduct[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const supplierPrice = toNumber(row[mapping.supplierPrice]);
    const title = value(row, mapping.title);
    const supplierSku = value(row, mapping.supplierSku);

    if (!title || !supplierSku || supplierPrice <= 0) {
      errors.push({ row: rowNumber, message: "Missing title, SKU, or supplier price." });
      return;
    }

    products.push({
      userId,
      supplierId,
      supplierSku,
      title,
      description: value(row, mapping.description),
      brand: value(row, mapping.brand),
      category: value(row, mapping.category),
      supplierPrice,
      shippingCost: toNumber(value(row, mapping.shippingCost)),
      stockQuantity: Math.max(0, Math.round(toNumber(value(row, mapping.stockQuantity)))),
      currency: value(row, mapping.currency) || "USD",
      productUrl: value(row, mapping.productUrl),
      imageUrls: [value(row, mapping.imageUrl1), value(row, mapping.imageUrl2), value(row, mapping.imageUrl3)].filter(
        Boolean
      ) as string[],
      rawData: row,
      shippingDays: Math.max(0, Math.round(toNumber(value(row, mapping.shippingDays)) || 5)),
      countryOfOrigin: value(row, mapping.country)
    });
  });

  return { products, errors };
}

function value(row: Record<string, string>, key?: string) {
  if (!key) {
    return undefined;
  }

  const matchedKey = Object.keys(row).find((rowKey) => rowKey.toLowerCase() === key.toLowerCase()) ?? key;
  const cell = row[matchedKey];
  return typeof cell === "string" && cell.trim().length > 0 ? cell.trim() : undefined;
}

function toNumber(value?: string) {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

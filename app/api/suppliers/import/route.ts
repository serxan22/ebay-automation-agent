import { NextResponse } from "next/server";
import { z } from "zod";
import { mapCsvProducts, parseSupplierCsv, csvImportMappingSchema } from "@/lib/suppliers/csv-import";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

const importFormSchema = z.object({
  supplierId: z.string().min(1).default("new"),
  supplierName: z.string().min(2).default("CSV Supplier"),
  mapping: z.string().transform((value, ctx) => {
    try {
      return csvImportMappingSchema.parse(JSON.parse(value));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid CSV mapping JSON." });
      return z.NEVER;
    }
  })
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
    }

    const form = importFormSchema.parse({
      supplierId: String(formData.get("supplierId") ?? "new"),
      supplierName: String(formData.get("supplierName") ?? "CSV Supplier"),
      mapping: String(formData.get("mapping") ?? "{}")
    });
    const csvText = await file.text();
    const parsed = parseSupplierCsv(csvText);

    if (!hasSupabaseServerEnv()) {
      const preview = mapCsvProducts({
        parsed,
        mapping: form.mapping,
        supplierId: "preview-supplier"
      });

      return NextResponse.json({
        message: `CSV parsed in preview mode: ${preview.products.length} products valid, ${preview.errors.length} rows need review.`,
        headers: parsed.headers,
        errors: preview.errors.slice(0, 20)
      });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    let supplierId = form.supplierId;

    if (supplierId === "new") {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .insert({
          user_id: user.id,
          name: form.supplierName,
          type: "csv",
          status: "active",
          allows_dropshipping: true
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      supplierId = supplier.id as string;
    }

    const mapped = mapCsvProducts({
      parsed,
      mapping: form.mapping,
      supplierId,
      userId: user.id
    });

    if (mapped.products.length > 0) {
      const { error } = await supabase.from("supplier_products").upsert(
        mapped.products.map((product) => ({
          user_id: user.id,
          supplier_id: supplierId,
          supplier_sku: product.supplierSku,
          title: product.title,
          description: product.description,
          brand: product.brand,
          category: product.category,
          supplier_price: product.supplierPrice,
          shipping_cost: product.shippingCost,
          stock_quantity: product.stockQuantity,
          currency: product.currency,
          product_url: product.productUrl,
          image_urls: product.imageUrls,
          raw_data: product.rawData,
          shipping_days: product.shippingDays,
          country_of_origin: product.countryOfOrigin,
          last_synced_at: new Date().toISOString()
        })),
        { onConflict: "user_id,supplier_id,supplier_sku" }
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    return NextResponse.json({
      message: `Imported ${mapped.products.length} products. ${mapped.errors.length} rows need review.`,
      errors: mapped.errors.slice(0, 20)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV import failed." },
      { status: 400 }
    );
  }
}

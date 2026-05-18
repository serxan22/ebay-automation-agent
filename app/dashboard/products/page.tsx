import { ProductTable } from "@/components/products/ProductTable";
import { demoAnalyses, demoProducts } from "@/lib/demo-data";

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Supplier products</h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Profit, shipping, image, stock, and compliance scoring before any listing action.
        </p>
      </div>
      <ProductTable products={demoProducts} analyses={demoAnalyses} />
    </div>
  );
}

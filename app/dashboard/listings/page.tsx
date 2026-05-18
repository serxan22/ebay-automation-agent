import { ListingDraftCard } from "@/components/listings/ListingDraftCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { demoAnalyses, demoProducts } from "@/lib/demo-data";
import type { ListingDraft } from "@/lib/types";

const demoDrafts: ListingDraft[] = demoProducts.slice(0, 2).map((product, index) => ({
  supplierProductId: product.id ?? product.supplierSku,
  analysisId: null,
  ebayTitle: product.title.slice(0, 80),
  ebayDescription: `<p>${product.description}</p>`,
  ebayCategoryId: null,
  itemSpecifics: {
    Brand: product.brand ?? "Unbranded",
    Type: product.category ?? "General"
  },
  condition: "NEW",
  quantity: 1,
  price: demoAnalyses[index].recommendedEbayPrice,
  optimizedImageUrls: product.imageUrls,
  status: "draft",
  aiGenerated: true
}));

export default function ListingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Listings</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Draft, approved, published, and failed listing queues.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="Drafts 2" tone="warning" />
          <StatusBadge status="Approved 0" tone="neutral" />
          <StatusBadge status="Published 0" tone="neutral" />
          <StatusBadge status="Failed 0" tone="success" />
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        {demoDrafts.map((draft) => (
          <ListingDraftCard key={draft.supplierProductId} draft={draft} />
        ))}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-semibold text-ink-950 dark:text-white">eBay sandbox publish readiness</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {["Payment policy", "Return policy", "Fulfillment policy", "Inventory location"].map((item) => (
            <div key={item} className="rounded-md bg-ink-50 p-3 text-sm text-ink-600 dark:bg-white/[0.04] dark:text-ink-300">
              {item}: missing
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

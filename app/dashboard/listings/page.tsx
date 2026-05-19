import { ListingDraftCard } from "@/components/listings/ListingDraftCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EbayErrorGuide } from "@/components/ebay/EbayErrorGuide";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { ListingDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ListingsPage() {
  const listingsPromise = loadListingsDashboardData();

  return <ListingsContent listingsPromise={listingsPromise} />;
}

async function ListingsContent({
  listingsPromise
}: {
  listingsPromise: Promise<{ drafts: ListingDraft[]; ebayConnected: boolean }>;
}) {
  const { drafts, ebayConnected } = await listingsPromise;
  const draftCount = drafts.filter((draft) => draft.status === "draft").length;
  const approvedCount = drafts.filter((draft) => draft.status === "approved").length;
  const publishedCount = drafts.filter((draft) => draft.status === "published").length;
  const failedCount = drafts.filter((draft) => draft.status === "failed").length;

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
          <StatusBadge status={`Drafts ${draftCount}`} tone="warning" />
          <StatusBadge status={`Approved ${approvedCount}`} tone="neutral" />
          <StatusBadge status={`Published ${publishedCount}`} tone="success" />
          <StatusBadge status={`Failed ${failedCount}`} tone={failedCount ? "danger" : "success"} />
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        {drafts.length ? (
          drafts.map((draft) => (
            <ListingDraftCard key={draft.id ?? draft.supplierProductId} draft={draft} ebayConnected={ebayConnected} />
          ))
        ) : (
          <div className="xl:col-span-2 rounded-lg border border-dashed border-ink-300 bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.04]">
            <h3 className="font-semibold text-ink-950 dark:text-white">No listing drafts yet</h3>
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              No listing drafts yet. Analyze products and create drafts first.
            </p>
          </div>
        )}
      </section>

      <EbayErrorGuide />

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-semibold text-ink-950 dark:text-white">eBay sandbox publish readiness</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {["Payment policy", "Return policy", "Fulfillment policy", "Inventory location"].map((item) => (
            <div key={item} className="rounded-md bg-ink-50 p-3 text-sm text-ink-600 dark:bg-white/[0.04] dark:text-ink-300">
              {item}: {ebayConnected ? "check Settings" : "missing"}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function loadListingsDashboardData(): Promise<{ drafts: ListingDraft[]; ebayConnected: boolean }> {
  if (!hasSupabaseServerEnv()) {
    return { drafts: [], ebayConnected: false };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { drafts: [], ebayConnected: false };
  }

  const [draftsResponse, ebayResponse] = await Promise.all([
    supabase
      .from("listing_drafts")
      .select(
        "id,user_id,supplier_product_id,analysis_id,ebay_title,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,status,ai_generated,error_message,ebay_error_code,ebay_offer_id,ebay_item_id,ebay_sku,publish_attempts,last_publish_attempt_at"
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("ebay_accounts")
      .select("status,marketplace")
      .eq("user_id", user.id)
      .eq("marketplace", process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US")
      .maybeSingle()
  ]);

  if (draftsResponse.error) {
    throw new Error(draftsResponse.error.message);
  }

  const drafts = (draftsResponse.data ?? []).map((draft) => ({
    id: draft.id as string,
    userId: draft.user_id as string,
    supplierProductId: draft.supplier_product_id as string,
    analysisId: draft.analysis_id as string | null,
    ebayTitle: draft.ebay_title as string,
    ebayDescription: draft.ebay_description as string,
    ebayCategoryId: draft.ebay_category_id as string | null,
    itemSpecifics: (draft.item_specifics ?? {}) as Record<string, string>,
    condition: draft.condition as string,
    quantity: Number(draft.quantity),
    price: Number(draft.price),
    optimizedImageUrls: (draft.optimized_image_urls ?? []) as string[],
    status: draft.status as ListingDraft["status"],
    aiGenerated: Boolean(draft.ai_generated),
    errorMessage: draft.error_message as string | null,
    ebayErrorCode: draft.ebay_error_code as string | null,
    ebayOfferId: draft.ebay_offer_id as string | null,
    ebayItemId: draft.ebay_item_id as string | null,
    ebaySku: draft.ebay_sku as string | null,
    publishAttempts: Number(draft.publish_attempts ?? 0),
    lastPublishAttemptAt: draft.last_publish_attempt_at as string | null
  }));

  return {
    drafts,
    ebayConnected: ebayResponse.data?.status === "connected"
  };
}

import { ListingDraftCard } from "@/components/listings/ListingDraftCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { EbayErrorGuide } from "@/components/ebay/EbayErrorGuide";
import { getEbayAccount } from "@/lib/ebay/account";
import { validateListingReadiness } from "@/lib/listings/validate-listing-readiness";
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
  listingsPromise: Promise<{ drafts: ListingDraft[]; ebayConnected: boolean; ebaySetup: EbaySetupStatus }>;
}) {
  const { drafts, ebayConnected, ebaySetup } = await listingsPromise;
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
          <SetupItem label="Payment policy" ok={ebaySetup.paymentPolicy} />
          <SetupItem label="Return policy" ok={ebaySetup.returnPolicy} />
          <SetupItem label="Fulfillment policy" ok={ebaySetup.fulfillmentPolicy} />
          <SetupItem label="Inventory location" ok={ebaySetup.inventoryLocation} />
        </div>
      </section>
    </div>
  );
}

interface EbaySetupStatus {
  paymentPolicy: boolean;
  returnPolicy: boolean;
  fulfillmentPolicy: boolean;
  inventoryLocation: boolean;
}

async function loadListingsDashboardData(): Promise<{ drafts: ListingDraft[]; ebayConnected: boolean; ebaySetup: EbaySetupStatus }> {
  if (!hasSupabaseServerEnv()) {
    return { drafts: [], ebayConnected: false, ebaySetup: emptyEbaySetup() };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { drafts: [], ebayConnected: false, ebaySetup: emptyEbaySetup() };
  }

  const [draftsResponse, account] = await Promise.all([
    supabase
      .from("listing_drafts")
      .select(
        "id,user_id,supplier_product_id,analysis_id,ebay_title,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,status,ai_generated,error_message,ebay_error_code,ebay_offer_id,ebay_item_id,ebay_sku,publish_attempts,last_publish_attempt_at,published_at,supplier_products(title,supplier_sku),product_analysis(estimated_profit,margin_percentage,risk_score,final_score,ai_notes,rejection_reasons)"
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50),
    getEbayAccount({ supabase, userId: user.id })
  ]);

  if (draftsResponse.error) {
    throw new Error(draftsResponse.error.message);
  }

  const drafts = await Promise.all((draftsResponse.data ?? []).map(async (draft) => {
    const row = draft as Record<string, any>;
    const supplierProduct = getEmbeddedRow(row.supplier_products);
    const analysis = getEmbeddedRow(row.product_analysis);
    const readiness = await validateListingReadiness({
      draft: {
        id: row.id,
        status: row.status,
        ebay_title: row.ebay_title,
        ebay_description: row.ebay_description,
        ebay_category_id: row.ebay_category_id,
        item_specifics: row.item_specifics,
        condition: row.condition,
        quantity: row.quantity,
        price: row.price,
        supplier_sku: supplierProduct?.supplier_sku,
        optimized_image_urls: row.optimized_image_urls
      },
      account
    });

    return {
      id: row.id as string,
      userId: row.user_id as string,
      supplierProductId: row.supplier_product_id as string,
      analysisId: row.analysis_id as string | null,
      supplierProductTitle: supplierProduct?.title ?? null,
      supplierSku: supplierProduct?.supplier_sku ?? null,
      ebayTitle: row.ebay_title as string,
      ebayDescription: row.ebay_description as string,
      ebayCategoryId: row.ebay_category_id as string | null,
      itemSpecifics: (row.item_specifics ?? {}) as Record<string, string | string[]>,
      condition: row.condition as string,
      quantity: Number(row.quantity),
      price: Number(row.price),
      optimizedImageUrls: (row.optimized_image_urls ?? []) as string[],
      status: row.status as ListingDraft["status"],
      aiGenerated: Boolean(row.ai_generated),
      estimatedProfit: analysis?.estimated_profit == null ? null : Number(analysis.estimated_profit),
      marginPercentage: analysis?.margin_percentage == null ? null : Number(analysis.margin_percentage),
      riskScore: analysis?.risk_score == null ? null : Number(analysis.risk_score),
      finalScore: analysis?.final_score == null ? null : Number(analysis.final_score),
      analysisNotes: analysis?.ai_notes ?? null,
      rejectionReasons: Array.isArray(analysis?.rejection_reasons) ? analysis.rejection_reasons : [],
      errorMessage: row.error_message as string | null,
      ebayErrorCode: row.ebay_error_code as string | null,
      ebayOfferId: row.ebay_offer_id as string | null,
      ebayItemId: row.ebay_item_id as string | null,
      ebaySku: row.ebay_sku as string | null,
      publishAttempts: Number(row.publish_attempts ?? 0),
      lastPublishAttemptAt: row.last_publish_attempt_at as string | null,
      publishedAt: row.published_at as string | null,
      readiness
    };
  }));

  return {
    drafts,
    ebayConnected: account?.status === "connected",
    ebaySetup: {
      paymentPolicy: Boolean(account?.payment_policy_id),
      returnPolicy: Boolean(account?.return_policy_id),
      fulfillmentPolicy: Boolean(account?.fulfillment_policy_id),
      inventoryLocation: Boolean(account?.inventory_location_key)
    }
  };
}

function SetupItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="rounded-md bg-ink-50 p-3 text-sm text-ink-600 dark:bg-white/[0.04] dark:text-ink-300">
      {label}: {ok ? "ready" : "missing"}
    </div>
  );
}

function emptyEbaySetup(): EbaySetupStatus {
  return {
    paymentPolicy: false,
    returnPolicy: false,
    fulfillmentPolicy: false,
    inventoryLocation: false
  };
}

function getEmbeddedRow(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, any> | undefined) ?? null;
  }

  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

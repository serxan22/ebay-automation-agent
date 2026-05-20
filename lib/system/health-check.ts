import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getTelegramAiParserStatus } from "@/lib/telegram/intent-parser";
import { getEbayAccount } from "@/lib/ebay/account";
import { getValidEbayAccessToken } from "@/lib/ebay/account";
import { getOptedInPrograms, SELLING_POLICY_MANAGEMENT } from "@/lib/ebay/programs";
import { validateListingReadiness } from "@/lib/listings/validate-listing-readiness";
import type { EbayAccountRecord } from "@/lib/ebay/account";

export type HealthSeverity = "ready" | "attention" | "missing";

export interface SystemHealthCheck {
  key: string;
  label: string;
  status: HealthSeverity;
  message: string;
  nextAction?: string;
}

export interface SystemHealthSummary {
  status: HealthSeverity;
  ready: boolean;
  checks: SystemHealthCheck[];
  counts: {
    supplierProducts: number;
    analyzedProducts: number;
    approvedProducts: number;
    listingDrafts: number;
    approvedDrafts: number;
    publishReadyDrafts: number;
  };
  lastAutomationError: string | null;
  lastEbayError: string | null;
  suggestedNextAction: string;
}

export async function getSystemHealth({
  supabase,
  user
}: {
  supabase: SupabaseClient;
  user: Pick<User, "id" | "email"> | null;
}): Promise<SystemHealthSummary> {
  const checks: SystemHealthCheck[] = [];

  checks.push({
    key: "supabase",
    label: "Supabase",
    status: "ready",
    message: "Database connection is available."
  });

  if (!user) {
    checks.push({
      key: "auth",
      label: "Authenticated user",
      status: "missing",
      message: "Sign in before running automation.",
      nextAction: "Log in to the dashboard."
    });

    return buildSummary({
      checks,
      counts: emptyCounts(),
      lastAutomationError: null,
      lastEbayError: null
    });
  }

  checks.push({
    key: "auth",
    label: "Authenticated user",
    status: "ready",
    message: user.email ? `Signed in as ${user.email}.` : "Signed in."
  });

  const [
    telegramConnection,
    supplierProductsCount,
    analyzedProductsCount,
    approvedProductsCount,
    draftRows,
    lastAutomationLog,
    lastEbayLog,
    account
  ] = await Promise.all([
    supabase.from("telegram_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("supplier_products").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("product_analysis").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("product_analysis")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("approved_for_listing", true),
    supabase
      .from("listing_drafts")
      .select("id,status,ebay_title,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,supplier_products(supplier_sku)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(250),
    supabase
      .from("automation_logs")
      .select("module,message,created_at")
      .eq("user_id", user.id)
      .eq("level", "error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("automation_logs")
      .select("module,message,created_at")
      .eq("user_id", user.id)
      .ilike("module", "ebay%")
      .in("level", ["error", "warning"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getEbayAccount({ supabase, userId: user.id })
  ]);

  const aiStatus = getTelegramAiParserStatus();
  checks.push({
    key: "ai",
    label: "AI parser",
    status: aiStatus.active ? "ready" : "attention",
    message: aiStatus.active ? aiStatus.label : "No AI key configured; deterministic fallback parser is active.",
    nextAction: aiStatus.active ? undefined : "Add GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY for richer Telegram parsing."
  });

  checks.push({
    key: "telegram",
    label: "Telegram",
    status: telegramConnection.count ? "ready" : "attention",
    message: telegramConnection.count ? "Telegram chat is connected." : "Telegram is not connected yet.",
    nextAction: telegramConnection.count ? undefined : "Open Dashboard → Telegram and connect your chat."
  });

  await addEbayChecks({ supabase, userId: user.id, account, checks });

  const draftRowsData = (draftRows.data ?? []) as Array<Record<string, any>>;
  const publishReadyResults = await Promise.all(
    draftRowsData
      .filter((draft) => draft.status === "approved")
      .slice(0, 100)
      .map((draft) =>
        validateListingReadiness({
          draft: {
            ...draft,
            supplier_sku: getEmbeddedRow(draft.supplier_products)?.supplier_sku ?? null
          },
          account
        })
      )
  );
  const publishReadyDrafts = publishReadyResults.filter((result) => result.canPublishSandbox).length;
  const listingDrafts = draftRowsData.length;
  const approvedDrafts = draftRowsData.filter((draft) => draft.status === "approved").length;

  checks.push({
    key: "supplier_products",
    label: "Supplier products",
    status: (supplierProductsCount.count ?? 0) > 0 ? "ready" : "missing",
    message: `${supplierProductsCount.count ?? 0} supplier products imported.`,
    nextAction: (supplierProductsCount.count ?? 0) > 0 ? undefined : "Import a supplier CSV."
  });

  checks.push({
    key: "listing_drafts",
    label: "Listing drafts",
    status: listingDrafts > 0 ? "ready" : "attention",
    message: `${listingDrafts} listing drafts, ${approvedDrafts} approved, ${publishReadyDrafts} publish-ready.`,
    nextAction: publishReadyDrafts
      ? "Publish ready drafts to sandbox."
      : approvedDrafts
        ? "Fix readiness issues shown on Listings."
        : "Analyze products and create/approve listing drafts."
  });

  return buildSummary({
    checks,
    counts: {
      supplierProducts: supplierProductsCount.count ?? 0,
      analyzedProducts: analyzedProductsCount.count ?? 0,
      approvedProducts: approvedProductsCount.count ?? 0,
      listingDrafts,
      approvedDrafts,
      publishReadyDrafts
    },
    lastAutomationError: formatLog(lastAutomationLog.data),
    lastEbayError: formatLog(lastEbayLog.data)
  });
}

async function addEbayChecks({
  supabase,
  userId,
  account,
  checks
}: {
  supabase: SupabaseClient;
  userId: string;
  account: EbayAccountRecord | null;
  checks: SystemHealthCheck[];
}) {
  checks.push({
    key: "market_account",
    label: "Sandbox connection",
    status: account?.status === "connected" ? "ready" : "missing",
    message: account?.status === "connected" ? "Sandbox account is connected." : "Sandbox account is not connected.",
    nextAction: account?.status === "connected" ? undefined : "Open Settings and connect sandbox."
  });

  checks.push({
    key: "refresh_token",
    label: "Refresh token",
    status: account?.refresh_token_encrypted ? "ready" : "missing",
    message: account?.refresh_token_encrypted ? "Refresh token is stored." : "Refresh token is missing.",
    nextAction: account?.refresh_token_encrypted ? undefined : "Reconnect sandbox OAuth."
  });

  let tokenRefreshWorks = false;
  let businessPoliciesActive = false;

  if (account?.status === "connected" && account.refresh_token_encrypted) {
    try {
      const { accessToken } = await getValidEbayAccessToken({
        supabase,
        userId,
        marketplace: account.marketplace
      });
      tokenRefreshWorks = Boolean(accessToken);
      const programs = await getOptedInPrograms(accessToken);
      businessPoliciesActive = (programs.programs ?? []).some(
        (program) => program.programType === SELLING_POLICY_MANAGEMENT
      );
    } catch {
      tokenRefreshWorks = false;
    }
  }

  checks.push({
    key: "token_refresh",
    label: "Token refresh",
    status: tokenRefreshWorks ? "ready" : account?.status === "connected" ? "attention" : "missing",
    message: tokenRefreshWorks ? "Access token refresh works." : "Could not verify token refresh.",
    nextAction: tokenRefreshWorks ? undefined : "Reconnect sandbox if eBay API calls fail."
  });

  checks.push({
    key: "business_policies",
    label: "Business Policies",
    status: businessPoliciesActive ? "ready" : "missing",
    message: businessPoliciesActive ? "Business Policies are active." : "Business Policies are not active.",
    nextAction: businessPoliciesActive ? undefined : "Click Enable seller policies in Settings."
  });

  checks.push(policyCheck("payment_policy", "Payment policy", account?.payment_policy_id, "Click Create default seller policies."));
  checks.push(policyCheck("return_policy", "Return policy", account?.return_policy_id, "Click Create default seller policies."));
  checks.push(
    policyCheck(
      "fulfillment_policy",
      "Fulfillment policy",
      account?.fulfillment_policy_id,
      "Click Retry next fulfillment attempt, or enable ALLOW_SANDBOX_POLICY_FALLBACK for sandbox diagnostics only."
    )
  );
  checks.push({
    key: "inventory_location",
    label: "Inventory location",
    status: account?.inventory_location_key ? "ready" : "missing",
    message: account?.inventory_location_key ? "Inventory location is stored." : "Inventory location is missing.",
    nextAction: account?.inventory_location_key ? undefined : "Click Setup location in Settings."
  });
}

function policyCheck(key: string, label: string, value: string | null | undefined, nextAction: string): SystemHealthCheck {
  return {
    key,
    label,
    status: value ? "ready" : "missing",
    message: value ? `${label} is stored.` : `${label} is missing.`,
    nextAction: value ? undefined : nextAction
  };
}

function buildSummary({
  checks,
  counts,
  lastAutomationError,
  lastEbayError
}: {
  checks: SystemHealthCheck[];
  counts: SystemHealthSummary["counts"];
  lastAutomationError: string | null;
  lastEbayError: string | null;
}): SystemHealthSummary {
  const hasMissing = checks.some((check) => check.status === "missing");
  const hasAttention = checks.some((check) => check.status === "attention");
  const status: HealthSeverity = hasMissing ? "missing" : hasAttention ? "attention" : "ready";
  const next = checks.find((check) => check.status !== "ready" && check.nextAction);

  return {
    status,
    ready: status === "ready",
    checks,
    counts,
    lastAutomationError,
    lastEbayError,
    suggestedNextAction: next?.nextAction ?? "System is ready for sandbox automation."
  };
}

function emptyCounts(): SystemHealthSummary["counts"] {
  return {
    supplierProducts: 0,
    analyzedProducts: 0,
    approvedProducts: 0,
    listingDrafts: 0,
    approvedDrafts: 0,
    publishReadyDrafts: 0
  };
}

function formatLog(row: unknown) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as { module?: string | null; message?: string | null };
  return [record.module, record.message].filter(Boolean).join(": ") || null;
}

function getEmbeddedRow(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, any> | undefined) ?? null;
  }

  return (value as Record<string, any> | null) ?? null;
}

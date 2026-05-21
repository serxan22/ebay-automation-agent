import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getEbayAccount, getValidEbayAccessToken } from "@/lib/ebay/account";
import { ensureInventoryLocation } from "@/lib/ebay/locations";
import {
  createDefaultSellerPolicies,
  retryFulfillmentPolicyStep,
  runFulfillmentPolicyDocsTest,
  syncSellerPolicies
} from "@/lib/ebay/policies";
import { publishListingDraftToEbaySandbox } from "@/lib/ebay/publish";
import { discoverShippingServicesWithFallback, getPreferredDomesticShippingServices } from "@/lib/ebay/shipping-services";
import { getConfiguredAiProvider } from "@/lib/ai";
import { generateListing } from "@/lib/ai/generate-listing";
import { optimizeProductImages } from "@/lib/images/optimize-product-images";
import { validateListingReadiness } from "@/lib/listings/validate-listing-readiness";
import { analyzeProduct } from "@/lib/products/analyze-product";
import {
  createListingDraft,
  createSafeFallbackListingGeneration
} from "@/lib/products/create-listing-draft";
import { getSystemHealth } from "@/lib/system/health-check";
import type { TelegramIntent } from "@/lib/telegram/intent-parser";
import type {
  AgentTaskResult,
  AutomationSettings,
  ListingGenerationResult,
  ProductAnalysis,
  Supplier,
  SupplierProduct
} from "@/lib/types";

export async function createTelegramAgentTask({
  supabase,
  userId,
  message,
  intent
}: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  intent: TelegramIntent;
}) {
  const { data, error } = await supabase
    .from("agent_tasks")
    .insert({
      user_id: userId,
      source: "telegram",
      original_message: message,
      parsed_intent: intent,
      task_type: intent.intent,
      status: "running",
      parameters_json: intent.parameters
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function finishTelegramAgentTask({
  supabase,
  taskId,
  result
}: {
  supabase: SupabaseClient;
  taskId: string;
  result: AgentTaskResult;
}) {
  const { error } = await supabase
    .from("agent_tasks")
    .update({
      status: result.ok ? "completed" : "failed",
      result_json: result,
      error_message: result.ok ? null : result.message
    })
    .eq("id", taskId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function executeTelegramIntentAction({
  supabase,
  userId,
  intent
}: {
  supabase: SupabaseClient;
  userId: string;
  intent: TelegramIntent;
}): Promise<AgentTaskResult> {
  if (intent.intent === "ASK_CLARIFICATION" || intent.intent === "UNKNOWN") {
    return {
      ok: false,
      message:
        intent.safe_response ||
        intent.clarifying_question ||
        "I need a little more detail before I can safely run that."
    };
  }

  if (intent.needs_confirmation || !intent.should_execute) {
    return {
      ok: false,
      message:
        intent.clarifying_question ??
        intent.safe_response ??
        "Confirmation is required before this action can run."
    };
  }

  switch (intent.intent) {
    case "SHOW_SYSTEM_HEALTH":
      return showSystemHealth({ supabase, userId });
    case "SHOW_STATUS":
      return showStatus({ supabase, userId });
    case "SHOW_DAILY_REPORT":
      return showDailyReport({ supabase, userId });
    case "PAUSE_AUTOMATION":
      return updateAutomationToggle({ supabase, userId, enabled: false });
    case "RESUME_AUTOMATION":
      return updateAutomationToggle({ supabase, userId, enabled: true });
    case "CHANGE_DAILY_LIMIT":
      return changeDailyLimit({ supabase, userId, value: getNumber(intent.parameters.quantity) });
    case "CHANGE_MIN_MARGIN":
      return changeMinMargin({ supabase, userId, value: getNumber(intent.parameters.min_margin_percentage) });
    case "CHANGE_MIN_PROFIT":
      return changeMinProfit({ supabase, userId, value: getNumber(intent.parameters.min_profit_amount) });
    case "CHANGE_RISK_TOLERANCE":
      return changeRiskTolerance({ supabase, userId, value: getNumber(intent.parameters.risk_tolerance) });
    case "ENABLE_TEST_MODE":
      return enableTestMode({ supabase, userId });
    case "FIND_PRODUCTS":
      return findProducts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 10 });
    case "ANALYZE_PRODUCTS":
      return analyzeProducts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 10 });
    case "CREATE_LISTING_DRAFTS":
      return createListingDrafts({
        supabase,
        userId,
        quantity: getNumber(intent.parameters.quantity) ?? 5,
        source: intent.parameters.draft_source ?? "latest_products",
        minMarginPercentage: getNumber(intent.parameters.min_margin_percentage),
        minProfitAmount: getNumber(intent.parameters.min_profit_amount)
      });
    case "SHOW_LISTING_DRAFTS":
      return showListingDrafts({
        supabase,
        userId,
        status: getString(intent.parameters.draft_status),
        quantity: getNumber(intent.parameters.quantity) ?? 5
      });
    case "APPROVE_DRAFTS":
      return approveListingDrafts({
        supabase,
        userId,
        quantity: getNumber(intent.parameters.quantity) ?? 5
      });
    case "REVISE_DRAFT_HELP":
      return reviseDraftHelp();
    case "SHOW_EBAY_READINESS":
      return showEbayReadiness({ supabase, userId });
    case "DISCOVER_SHIPPING_SERVICES":
      return discoverShippingServicesFromTelegram({ supabase, userId });
    case "RUN_FULFILLMENT_DOCS_TEST":
      return runFulfillmentDocsTestFromTelegram({ supabase, userId });
    case "RETRY_FULFILLMENT_STEP":
      return retryFulfillmentStepFromTelegram({
        supabase,
        userId,
        question: getString(intent.parameters.user_question)
      });
    case "SYNC_EBAY_POLICIES":
      return syncEbayPoliciesFromTelegram({ supabase, userId });
    case "CREATE_DEFAULT_EBAY_POLICIES":
      return createDefaultEbayPoliciesFromTelegram({ supabase, userId });
    case "SETUP_EBAY_LOCATION":
      return setupEbayLocationFromTelegram({ supabase, userId });
    case "IMPROVE_LISTING_COPY":
      return improveListingCopyFromTelegram({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 3 });
    case "OPTIMIZE_IMAGES":
      return optimizeImagesFromTelegram({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 5 });
    case "SHOW_READY_DRAFTS":
      return showReadyDrafts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 5 });
    case "PUBLISH_READY_DRAFTS_SANDBOX":
      return publishSafeDraftsSandbox({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 5 });
    case "PUBLISH_SAFE_DRAFTS_SANDBOX":
      return publishSafeDraftsSandbox({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 5 });
    case "SHOW_FAILED_TASKS":
      return showFailedTasks({ supabase, userId });
    case "UPDATE_BLOCKED_CATEGORY":
      return updateBlockedArray({
        supabase,
        userId,
        field: "blocked_categories",
        value: getString(intent.parameters.blocked_category ?? intent.parameters.category)
      });
    case "UPDATE_BLOCKED_BRAND":
      return updateBlockedArray({
        supabase,
        userId,
        field: "blocked_brands",
        value: getString(intent.parameters.blocked_brand)
      });
    case "CHANGE_APPROVAL_MODE":
      return changeApprovalMode({ supabase, userId, value: getString(intent.parameters.approval_mode) });
    case "EXPLAIN_SYSTEM":
      return explainSystem({
        supabase,
        userId,
        question: getString(intent.parameters.user_question)
      });
    default:
      return {
        ok: false,
        message:
          intent.safe_response ||
          intent.clarifying_question ||
          "I could not understand the requested action."
      };
  }
}

async function showStatus({ supabase, userId }: ActionContext) {
  const [settings, suppliers, products, drafts, tasks, ebay] = await Promise.all([
    getAutomationSettings(supabase, userId),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("supplier_products").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("listing_drafts").select("status").eq("user_id", userId).limit(250),
    supabase.from("agent_tasks").select("status").eq("user_id", userId).gte("created_at", startOfTodayIso()).limit(250),
    supabase
      .from("ebay_accounts")
      .select("status,marketplace,payment_policy_id,return_policy_id,fulfillment_policy_id,inventory_location_key")
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  const draftRows = (drafts.data ?? []) as Array<{ status: string }>;
  const taskRows = (tasks.data ?? []) as Array<{ status: string }>;
  const activeDrafts = draftRows.filter((draft) => draft.status === "draft" || draft.status === "approved").length;
  const failedTasks = taskRows.filter((task) => task.status === "failed").length;

  const ebayAccount = ebay.data as
    | {
        status?: string | null;
        marketplace?: string | null;
        payment_policy_id?: string | null;
        return_policy_id?: string | null;
        fulfillment_policy_id?: string | null;
        inventory_location_key?: string | null;
      }
    | null;
  const policiesReady = Boolean(
    ebayAccount?.payment_policy_id && ebayAccount.return_policy_id && ebayAccount.fulfillment_policy_id
  );
  const locationReady = Boolean(ebayAccount?.inventory_location_key);

  return {
    ok: true,
    message: `Status: auto_listing_enabled ${settings.autoListingEnabled ? "true (aktivdir)" : "false (dayandırılıb)"}, daily_listing_limit ${settings.dailyListingLimit}, min_profit_amount $${settings.minProfitAmount}, min_margin_percentage ${settings.minMarginPercentage}%, risk_tolerance ${settings.riskTolerance}, max_shipping_days ${settings.maxShippingDays}, approval_mode ${settings.approvalMode}. Suppliers ${suppliers.count ?? 0}, products ${products.count ?? 0}, active drafts ${activeDrafts}, failed tasks today ${failedTasks}. eBay ${ebay.data?.status ?? "not connected"} (${ebay.data?.marketplace ?? "sandbox"}).`
      + ` Policies ${policiesReady ? "ready" : "missing"}, inventory location ${locationReady ? "ready" : "missing"}.`
  };
}

async function showSystemHealth({ supabase, userId }: ActionContext) {
  const health = await getSystemHealth({
    supabase,
    user: { id: userId }
  });
  const missing = health.checks.filter((check) => check.status !== "ready").slice(0, 6);

  return {
    ok: health.status !== "missing",
    message: [
      `System status: ${health.ready ? "Ready" : health.status === "attention" ? "Needs attention" : "Missing requirement"}.`,
      `Products ${health.counts.supplierProducts}, analyzed ${health.counts.analyzedProducts}, approved products ${health.counts.approvedProducts}, drafts ${health.counts.listingDrafts}, ready drafts ${health.counts.publishReadyDrafts}.`,
      missing.length
        ? `Needs action:\n${missing.map((check) => `- ${check.message}${check.nextAction ? ` Next: ${check.nextAction}` : ""}`).join("\n")}`
        : "No blocking checklist item found for sandbox automation.",
      health.lastEbayError ? `Last integration warning: ${health.lastEbayError}` : "",
      health.lastAutomationError ? `Last automation error: ${health.lastAutomationError}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function showDailyReport({ supabase, userId }: ActionContext) {
  const [analyses, drafts, logs] = await Promise.all([
    supabase.from("product_analysis").select("approved_for_listing,estimated_profit,margin_percentage,rejection_reasons").eq("user_id", userId).gte("created_at", startOfTodayIso()).limit(500),
    supabase.from("listing_drafts").select("status").eq("user_id", userId).gte("created_at", startOfTodayIso()).limit(500),
    supabase.from("automation_logs").select("level").eq("user_id", userId).gte("created_at", startOfTodayIso()).limit(500)
  ]);
  const analysisRows = (analyses.data ?? []) as Array<{
    approved_for_listing: boolean;
    estimated_profit: number;
    margin_percentage: number;
    rejection_reasons: string[];
  }>;
  const draftRows = (drafts.data ?? []) as Array<{ status: string }>;
  const logRows = (logs.data ?? []) as Array<{ level: string }>;
  const approved = analysisRows.filter((item) => item.approved_for_listing);
  const profit = approved.reduce((sum, item) => sum + Number(item.estimated_profit ?? 0), 0);
  const failedDrafts = draftRows.filter((draft) => draft.status === "failed").length;
  const errors = logRows.filter((log) => log.level === "error").length;

  return {
    ok: true,
    message: `Today's report: ${analysisRows.length} products analyzed, ${approved.length} approved, ${draftRows.length} drafts touched, ${failedDrafts} failed drafts, ${errors} error logs. Estimated profit from approved products: $${profit.toFixed(2)}.`
  };
}

async function updateAutomationToggle({ supabase, userId, enabled }: ActionContext & { enabled: boolean }) {
  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({ auto_listing_enabled: enabled })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    message: enabled
      ? "Automation aktiv edildi. Saved rules əsasında işləyəcək."
      : "Automation dayandırıldı. Mən artıq auto-listing etməyəcəm."
  };
}

async function changeDailyLimit({ supabase, userId, value }: ActionContext & { value?: number }) {
  if (!value || value < 0 || value > 250) {
    return { ok: false, message: "Daily listing limit must be a number between 0 and 250." };
  }

  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({ daily_listing_limit: value })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `Daily listing limit changed to ${value}.` };
}

async function changeMinMargin({ supabase, userId, value }: ActionContext & { value?: number }) {
  if (!value || value < 1 || value > 95) {
    return { ok: false, message: "Minimum margin must be between 1% and 95%." };
  }

  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({ min_margin_percentage: value })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `Minimum margin changed to ${value}%.` };
}

async function changeMinProfit({ supabase, userId, value }: ActionContext & { value?: number }) {
  if (value === undefined || value < 0 || value > 10000) {
    return { ok: false, message: "Minimum profit must be a number between 0 and 10000 dollars." };
  }

  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({ min_profit_amount: value })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `Minimum profit ${value} dollar olaraq yeniləndi.` };
}

async function changeRiskTolerance({ supabase, userId, value }: ActionContext & { value?: number }) {
  if (value === undefined || value < 0 || value > 100) {
    return { ok: false, message: "Risk tolerance must be between 0 and 100." };
  }

  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({ risk_tolerance: value })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `Risk tolerance ${value} olaraq yeniləndi.` };
}

async function enableTestMode({ supabase, userId }: ActionContext) {
  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase
    .from("automation_settings")
    .update({
      min_profit_amount: 0.5,
      min_margin_percentage: 5,
      risk_tolerance: 40,
      max_shipping_days: 10,
      daily_listing_limit: 10
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    message: "Test mode aktiv edildi: min profit $0.5, margin 5%, risk tolerance 40, max shipping 10 days."
  };
}

async function findProducts({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const limit = clampBatchQuantity(quantity, 50);
  const { data, error } = await supabase
    .from("supplier_products")
    .select("id,title,category,stock_quantity,shipping_days")
    .eq("user_id", userId)
    .gt("stock_quantity", 0)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    return { ok: true, message: "No supplier products found yet. Upload an approved supplier CSV first." };
  }

  const names = data.slice(0, 3).map((item) => item.title).join("; ");
  return {
    ok: true,
    message: `Found ${data.length} candidate products to analyze. Top candidates: ${names}.`
  };
}

async function analyzeProducts({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const limit = clampBatchQuantity(quantity, 25);
  const settings = await getAutomationSettings(supabase, userId);
  const { products, suppliers } = await loadProductsForAction({ supabase, userId, limit });

  if (!products.length) {
    return { ok: true, message: "No supplier products available for analysis." };
  }

  let approved = 0;
  let rejected = 0;
  const rejectionCounts = new Map<string, number>();

  for (const product of products) {
    const supplier = suppliers.find((item) => item.id === product.supplierId) ?? null;
    const analysis = analyzeProduct({ product, settings, supplier });
    approved += analysis.approvedForListing ? 1 : 0;
    rejected += analysis.approvedForListing ? 0 : 1;

    if (!analysis.approvedForListing) {
      for (const reason of analysis.rejectionReasons) {
        const groupedReason = groupRejectionReason(reason);
        rejectionCounts.set(groupedReason, (rejectionCounts.get(groupedReason) ?? 0) + 1);
      }
    }

    const { error } = await supabase.from("product_analysis").insert({
      user_id: userId,
      supplier_product_id: product.id,
      profit_score: analysis.profitScore,
      risk_score: analysis.riskScore,
      demand_score: analysis.demandScore,
      competition_score: analysis.competitionScore,
      image_score: analysis.imageScore,
      shipping_score: analysis.shippingScore,
      final_score: analysis.finalScore,
      estimated_ebay_fees: analysis.estimatedEbayFees,
      estimated_total_cost: analysis.estimatedTotalCost,
      recommended_ebay_price: analysis.recommendedEbayPrice,
      estimated_profit: analysis.estimatedProfit,
      margin_percentage: analysis.marginPercentage,
      ai_notes: analysis.aiNotes,
      rejection_reasons: analysis.rejectionReasons,
      approved_for_listing: analysis.approvedForListing
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  const reasons = formatGroupedRejectionReasons(rejectionCounts);

  return {
    ok: true,
    message: `${products.length} products analyzed: ${approved} approved, ${rejected} rejected.${
      reasons ? `\nReasons:\n${reasons}` : ""
    }`
  };
}

async function createListingDrafts({
  supabase,
  userId,
  quantity,
  source,
  minMarginPercentage,
  minProfitAmount
}: ActionContext & {
  quantity: number;
  source: "latest_products" | "approved_products";
  minMarginPercentage?: number;
  minProfitAmount?: number;
}) {
  const limit = clampBatchQuantity(quantity, 25);
  const savedSettings = await getAutomationSettings(supabase, userId);
  const settings = {
    ...savedSettings,
    minMarginPercentage: minMarginPercentage ?? savedSettings.minMarginPercentage,
    minProfitAmount: minProfitAmount ?? savedSettings.minProfitAmount
  };
  const startedAt = new Date().toISOString();
  let draftsCreated = 0;
  let rejected = 0;
  let approved = 0;
  let publishedSandbox = 0;
  const rejectionCounts = new Map<string, number>();
  const failures: string[] = [];
  const createdDraftIds: string[] = [];
  const autoApprovedDraftIds: string[] = [];

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "listing_drafts",
    message: "draft_creation_started",
    metadata: { quantity, source, startedAt }
  });

  const candidates =
    source === "approved_products"
      ? await loadApprovedAnalysisCandidates({ supabase, userId, limit })
      : await analyzeLatestProductsForDrafts({ supabase, userId, settings, limit });

  if (!candidates.length) {
    return {
      ok: true,
      message:
        source === "approved_products"
          ? "No approved product analysis rows found. Analyze products first."
          : "No supplier products available for draft creation."
    };
  }

  for (const candidate of candidates) {
    if (!candidate.analysis.approvedForListing) {
      rejected += 1;
      for (const reason of candidate.analysis.rejectionReasons) {
        const groupedReason = groupRejectionReason(reason);
        rejectionCounts.set(groupedReason, (rejectionCounts.get(groupedReason) ?? 0) + 1);
      }
      continue;
    }

    approved += 1;
    const created = await createDraftFromCandidate({
      supabase,
      userId,
      settings,
      candidate
    });

    if (created.ok) {
      draftsCreated += 1;
      createdDraftIds.push(created.draftId);
      if (created.status === "approved") {
        autoApprovedDraftIds.push(created.draftId);
      }
    } else {
      failures.push(created.reason);
    }
  }

  let publishBlockReason = "";
  if (settings.approvalMode === "trusted_auto" && autoApprovedDraftIds.length > 0) {
    const publishResult = await publishTrustedAutoDraftsSandbox({ supabase, userId, draftIds: autoApprovedDraftIds });
    publishedSandbox = publishResult.published;
    publishBlockReason = publishResult.blockedReason ?? "";
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "listing_drafts",
    message: "Telegram listing drafts created.",
    metadata: {
      productsAnalyzed: candidates.length,
      approved,
      rejected,
      draftsCreated,
      publishedSandbox,
      publishBlockReason,
      failures
    }
  });

  const reasons = formatGroupedRejectionReasons(rejectionCounts);
  const failureSummary = failures.length ? `\nDraft creation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}` : "";

  return {
    ok: failures.length === 0 || draftsCreated > 0,
    message: `${candidates.length} products analyzed: ${approved} approved, ${rejected} rejected. ${draftsCreated} listing drafts created.${
      publishedSandbox ? ` ${publishedSandbox} published to sandbox.` : ""
    }${
      settings.approvalMode === "manual" && draftsCreated
        ? "\nManual approval mode is active. Review and approve drafts before sandbox publish."
        : ""
    }${
      publishBlockReason ? `\n${publishBlockReason}` : ""
    }${
      reasons ? `\nReasons:\n${reasons}` : ""
    }${failureSummary}`
  };
}

async function publishTrustedAutoDraftsSandbox({
  supabase,
  userId,
  draftIds
}: ActionContext & {
  draftIds: string[];
}) {
  const account = await getEbayAccount({ supabase, userId, marketplace: "EBAY_US" });

  if (!account?.fulfillment_policy_id) {
    return {
      published: 0,
      blockedReason: [
        "Drafts are ready, but sandbox publish is blocked because fulfillment policy is missing.",
        isSandboxPolicyFallbackAllowed()
          ? "Sandbox fallback is enabled for diagnostics, but real offer publish is blocked until a real fulfillment policy exists."
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  if (!account.payment_policy_id || !account.return_policy_id || !account.inventory_location_key) {
    return {
      published: 0,
      blockedReason: "Drafts are ready, but sandbox publish is blocked because seller policy or inventory location setup is incomplete."
    };
  }

  let published = 0;
  for (const draftId of draftIds.slice(0, 10)) {
    try {
      await publishListingDraftToEbaySandbox({ supabase, userId, draftId });
      published += 1;
    } catch {
      // Individual publish failures are recorded on the draft by publishListingDraftToEbaySandbox.
    }
  }

  return { published, blockedReason: published ? null : "Trusted auto publish found no fully ready sandbox drafts." };
}

async function analyzeLatestProductsForDrafts({
  supabase,
  userId,
  settings,
  limit
}: ActionContext & {
  settings: AutomationSettings;
  limit: number;
}): Promise<DraftCandidate[]> {
  const { products, suppliers } = await loadProductsForAction({ supabase, userId, limit });
  const candidates: DraftCandidate[] = [];

  for (const product of products) {
    const supplier = suppliers.find((item) => item.id === product.supplierId) ?? null;
    const analysis = analyzeProduct({ product, settings, supplier });

    if (!product.id) {
      candidates.push({
        product,
        analysis,
        analysisId: null,
        failureReason: "missing supplier_product_id"
      });
      continue;
    }

    const { data, error } = await supabase
      .from("product_analysis")
      .insert({
        user_id: userId,
        supplier_product_id: product.id,
        profit_score: analysis.profitScore,
        risk_score: analysis.riskScore,
        demand_score: analysis.demandScore,
        competition_score: analysis.competitionScore,
        image_score: analysis.imageScore,
        shipping_score: analysis.shippingScore,
        final_score: analysis.finalScore,
        estimated_ebay_fees: analysis.estimatedEbayFees,
        estimated_total_cost: analysis.estimatedTotalCost,
        recommended_ebay_price: analysis.recommendedEbayPrice,
        estimated_profit: analysis.estimatedProfit,
        margin_percentage: analysis.marginPercentage,
        ai_notes: analysis.aiNotes,
        rejection_reasons: analysis.rejectionReasons,
        approved_for_listing: analysis.approvedForListing
      })
      .select("id")
      .single();

    candidates.push({
      product,
      analysis,
      analysisId: data?.id ?? null,
      failureReason: error ? describeSupabaseError(error) : data?.id ? undefined : "missing analysis_id"
    });
  }

  return candidates;
}

async function loadApprovedAnalysisCandidates({
  supabase,
  userId,
  limit
}: ActionContext & {
  limit: number;
}): Promise<DraftCandidate[]> {
  const { data: analysisRows, error } = await supabase
    .from("product_analysis")
    .select("*")
    .eq("user_id", userId)
    .eq("approved_for_listing", true)
    .order("created_at", { ascending: false })
    .limit(limit * 4);

  if (error) {
    throw new Error(describeSupabaseError(error));
  }

  if (!analysisRows?.length) {
    return [];
  }

  const analysisIds = analysisRows.map((row) => row.id as string);
  const { data: existingDrafts, error: draftError } = await supabase
    .from("listing_drafts")
    .select("analysis_id")
    .eq("user_id", userId)
    .in("analysis_id", analysisIds);

  if (draftError) {
    throw new Error(describeSupabaseError(draftError));
  }

  const existingAnalysisIds = new Set((existingDrafts ?? []).map((row) => row.analysis_id).filter(Boolean));
  const availableRows = analysisRows.filter((row) => !existingAnalysisIds.has(row.id)).slice(0, limit);
  const productIds = availableRows.map((row) => row.supplier_product_id as string).filter(Boolean);

  if (!productIds.length) {
    return [];
  }

  const { data: productRows, error: productError } = await supabase
    .from("supplier_products")
    .select("*")
    .eq("user_id", userId)
    .in("id", productIds);

  if (productError) {
    throw new Error(describeSupabaseError(productError));
  }

  const productsById = new Map(
    ((productRows ?? []) as Array<Record<string, any>>).map((row) => [row.id as string, mapSupplierProduct(row)])
  );

  return availableRows
    .map<DraftCandidate | null>((row) => {
      const product = productsById.get(row.supplier_product_id as string);

      if (!product) {
        return null;
      }

      return {
        product,
        analysis: mapProductAnalysis(row as Record<string, any>),
        analysisId: row.id as string
      };
    })
    .filter((candidate): candidate is DraftCandidate => candidate !== null);
}

async function createDraftFromCandidate({
  supabase,
  userId,
  settings,
  candidate
}: ActionContext & {
  settings: AutomationSettings;
  candidate: DraftCandidate;
}): Promise<{ ok: true; draftId: string; status: "draft" | "approved" } | { ok: false; reason: string }> {
  const reason = validateDraftCandidate(candidate);

  if (reason) {
    await logDraftCreationFailed({ supabase, userId, candidate, reason });
    return { ok: false, reason };
  }

  try {
    const generated = await generateListingForDraft(candidate.product, candidate.analysis);
    const imageResult = await optimizeProductImages({
      imageUrls: candidate.product.imageUrls,
      userId,
      supplierProductId: candidate.product.id,
      store: isSupabaseImageStorageConfigured(),
      maxImages: 8
    });

    if (!imageResult.optimizedUrls.length) {
      const imageReason = imageResult.rejected[0]?.reason ?? "no valid image URLs";
      await logDraftCreationFailed({ supabase, userId, candidate, reason: imageReason });
      return { ok: false, reason: imageReason };
    }

    const ebayCategoryId = /^\d+$/.test(generated.categorySuggestion) ? generated.categorySuggestion : null;
    const draft = createListingDraft({
      product: candidate.product,
      analysis: candidate.analysis,
      generatedListing: {
        ...generated,
        itemSpecifics: generated.itemSpecifics ?? {}
      },
      settings,
      optimizedImageUrls: imageResult.optimizedUrls,
      analysisId: candidate.analysisId
    });
    const fallbackUsed = generated.warnings.includes("Safe fallback listing content was used.");
    const draftStatus = settings.approvalMode === "trusted_auto" && candidate.analysis.finalScore >= 70 ? "approved" : draft.status;
    const { data, error } = await supabase
      .from("listing_drafts")
      .insert({
        user_id: userId,
        supplier_product_id: draft.supplierProductId,
        analysis_id: draft.analysisId,
        ebay_title: draft.ebayTitle,
        ebay_description: draft.ebayDescription,
        ebay_category_id: ebayCategoryId ?? draft.ebayCategoryId,
        item_specifics: draft.itemSpecifics,
        condition: draft.condition,
        quantity: fallbackUsed ? Math.max(1, Math.min(candidate.product.stockQuantity || 1, 1)) : draft.quantity,
        price: draft.price,
        optimized_image_urls: draft.optimizedImageUrls,
        status: draftStatus,
        ai_generated: draft.aiGenerated
      })
      .select("id")
      .single();

    if (error) {
      const insertReason = describeSupabaseError(error);
      await logDraftCreationFailed({ supabase, userId, candidate, reason: insertReason });
      return { ok: false, reason: insertReason };
    }

    await logAutomationEvent({
      supabase,
      userId,
      level: "success",
      module: "listing_drafts",
      message: "draft_created",
      metadata: {
        draftId: data.id,
        supplierProductId: candidate.product.id,
        analysisId: candidate.analysisId,
        price: draft.price
      }
    });

    return { ok: true, draftId: data.id as string, status: draftStatus === "approved" ? "approved" : "draft" };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "draft_creation_failed";
    await logDraftCreationFailed({ supabase, userId, candidate, reason: failureReason });
    return { ok: false, reason: failureReason };
  }
}

function isSupabaseImageStorageConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isSandboxPolicyFallbackAllowed() {
  return process.env.EBAY_ENVIRONMENT !== "production" && process.env.ALLOW_SANDBOX_POLICY_FALLBACK === "true";
}

function validateDraftCandidate(candidate: DraftCandidate) {
  if (candidate.failureReason) {
    return candidate.failureReason;
  }

  if (!candidate.product.id) {
    return "missing supplier_product_id";
  }

  if (!candidate.analysisId) {
    return "missing analysis_id";
  }

  if (!Number.isFinite(candidate.analysis.recommendedEbayPrice) || candidate.analysis.recommendedEbayPrice <= 0) {
    return "missing price";
  }

  if (!candidate.product.title?.trim()) {
    return "validation error: missing product title";
  }

  return null;
}

async function generateListingForDraft(product: SupplierProduct, analysis: ProductAnalysis): Promise<ListingGenerationResult> {
  const provider = getConfiguredAiProvider();

  if (!provider) {
    return createSafeFallbackListingGeneration(product, analysis);
  }

  try {
    const generated = await generateListing({ product, analysis });

    if (generated.warnings.some((warning) => /AI provider fallback used/i.test(warning))) {
      return createSafeFallbackListingGeneration(product, analysis);
    }

    return generated;
  } catch {
    return createSafeFallbackListingGeneration(product, analysis);
  }
}

async function logDraftCreationFailed({
  supabase,
  userId,
  candidate,
  reason
}: ActionContext & {
  candidate: DraftCandidate;
  reason: string;
}) {
  await logAutomationEvent({
    supabase,
    userId,
    level: "error",
    module: "listing_drafts",
    message: "draft_creation_failed",
    metadata: {
      reason,
      supplierProductId: candidate.product.id,
      supplierSku: candidate.product.supplierSku,
      analysisId: candidate.analysisId
    }
  });
}

async function showListingDrafts({
  supabase,
  userId,
  status,
  quantity
}: ActionContext & {
  status?: string;
  quantity: number;
}) {
  const limit = Math.min(Math.max(quantity, 1), 5);
  let query = supabase
    .from("listing_drafts")
    .select("id,ebay_title,price,status,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status && ["draft", "approved", "published", "failed"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(describeSupabaseError(error));
  }

  const rows = (data ?? []) as Array<{
    id: string;
    ebay_title: string;
    price: number | string;
    status: string;
  }>;

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "listing_drafts",
    message: "listing_drafts_listed",
    metadata: {
      status: status ?? "all",
      count: rows.length
    }
  });

  if (!rows.length) {
    return {
      ok: true,
      message: status
        ? `No ${status} listing drafts found. Analyze products and create drafts first.`
        : "No listing drafts found. Analyze products and create drafts first."
    };
  }

  return {
    ok: true,
    message: rows
      .map((draft, index) => {
        const price = Number(draft.price ?? 0);
        return `${index + 1}. ${draft.ebay_title} - $${price.toFixed(2)} - ${draft.status}`;
      })
      .join("\n")
  };
}

async function approveListingDrafts({
  supabase,
  userId,
  quantity
}: ActionContext & {
  quantity: number;
}) {
  const limit = Math.min(Math.max(quantity, 1), 25);
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,ebay_title")
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(describeSupabaseError(error));
  }

  const rows = (data ?? []) as Array<{ id: string; ebay_title: string }>;

  if (!rows.length) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "info",
      module: "listing_drafts",
      message: "listing_drafts_approve_skipped",
      metadata: { reason: "no_draft_rows" }
    });

    return { ok: true, message: "No draft listing rows found to approve." };
  }

  const ids = rows.map((draft) => draft.id);
  const { data: updatedRows, error: updateError } = await supabase
    .from("listing_drafts")
    .update({
      status: "approved",
      error_message: null,
      ebay_error_code: null,
      ebay_error_json: {}
    })
    .eq("user_id", userId)
    .in("id", ids)
    .select("id,ebay_title,status");

  if (updateError) {
    await logAutomationEvent({
      supabase,
      userId,
      level: "error",
      module: "listing_drafts",
      message: "listing_drafts_approve_failed",
      metadata: {
        reason: describeSupabaseError(updateError),
        draftIds: ids
      }
    });

    throw new Error(describeSupabaseError(updateError));
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "listing_drafts",
    message: "listing_drafts_approved_from_telegram",
    metadata: {
      count: updatedRows?.length ?? 0,
      draftIds: ids
    }
  });

  return {
    ok: true,
    message: `${updatedRows?.length ?? 0} listing drafts approved. No eBay publish action was run.`
  };
}

function reviseDraftHelp(): AgentTaskResult {
  return {
    ok: true,
    message:
      "Draft revision hazırdır: dashboardda /dashboard/listings səhifəsinə gir, draft kartında Revise seç və eBay title, description, price, quantity, category ID, item specifics JSON və image URL-ləri dəyiş. Listing copy yeniləmək üçün title və description sahələrini orada revise et; Telegram approve edə bilər, amma revise üçün UI modal daha təhlükəsizdir."
  };
}

async function showEbayReadiness({ supabase, userId }: ActionContext) {
  const account = await getEbayAccount({ supabase, userId });
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,ebay_title,status,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,error_message,ebay_error_code")
    .eq("user_id", userId)
    .in("status", ["approved", "draft", "failed"])
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, any>>;
  const readinessResults = await Promise.all(
    rows.map((draft) =>
      validateListingReadiness({
        draft,
        account
      })
    )
  );
  const readyCount = readinessResults.filter((result) => result.ready).length;
  const firstMissing = readinessResults.find((result) => !result.ready)?.missing.slice(0, 4) ?? [];
  const lastFailed = rows.find((row) => row.status === "failed");
  const policiesReady = Boolean(account?.payment_policy_id && account.return_policy_id && account.fulfillment_policy_id);
  const locationReady = Boolean(account?.inventory_location_key);

  return {
    ok: true,
    message: [
      `eBay sandbox: ${account?.status === "connected" ? "connected" : account?.status ?? "disconnected"} (${account?.marketplace ?? "EBAY_US"}).`,
      `Policies: ${policiesReady ? "ready" : "missing"}. Inventory location: ${locationReady ? "ready" : "missing"}.`,
      `Draft readiness: ${readyCount}/${rows.length} recent drafts ready to publish.`,
      !account?.fulfillment_policy_id
        ? "Next action: Run docs fulfillment test. If it returns 20500, report eBay sandbox Account API issue; draft/demo workflow can continue but publish remains blocked."
        : firstMissing.length
          ? `Next fixes: ${firstMissing.join(", ")}.`
          : "Next action: approved ready drafts can be published to sandbox.",
      !account?.fulfillment_policy_id && isSandboxPolicyFallbackAllowed()
        ? "Sandbox fallback is enabled for diagnostics, but real offer publish is blocked until a real fulfillment policy exists."
        : "",
      lastFailed ? `Last publish error: ${lastFailed.ebay_error_code ?? "ERROR"} ${lastFailed.error_message ?? ""}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function discoverShippingServicesFromTelegram({ supabase, userId }: ActionContext) {
  try {
    const { accessToken } = await getValidEbayAccessToken({ supabase, userId, marketplace: "EBAY_US" });
    const discovery = await discoverShippingServicesWithFallback(accessToken);
    const services = getPreferredDomesticShippingServices(discovery.services).slice(0, 8);

    return {
      ok: true,
      message: [
        discovery.discovered
          ? `Discovered ${discovery.services.length} sandbox shipping services.`
          : `Shipping discovery used fallback services: ${discovery.discoveryError ?? "discovery failed"}.`,
        services.length
          ? `Top services:\n${services.map((service) => `- ${service.shippingService}${service.description ? `: ${service.description}` : ""}`).join("\n")}`
          : "No domestic selling services found."
      ].join("\n")
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Shipping service discovery failed."
    };
  }
}

async function runFulfillmentDocsTestFromTelegram({ supabase, userId }: ActionContext) {
  const result = await runFulfillmentPolicyDocsTest({ supabase, userId, marketplaceId: "EBAY_US" });

  return {
    ok: result.ok,
    message: [
      `Docs fulfillment test: ${result.ok ? "success" : result.timedOut ? "timeout" : "failed"}.`,
      `schemaVariant: ${result.schemaVariant}. endpoint: ${result.endpoint}. status: ${result.status ?? "null"}.`,
      result.fulfillmentPolicyId ? `Fulfillment policy stored: ${result.fulfillmentPolicyId}.` : "",
      result.locationHeader ? `Location: ${result.locationHeader}.` : "",
      result.code === "EBAY_INTERNAL_ERROR"
        ? "eBay returned internal application error 20500 from the official fulfillment policy endpoint."
        : result.errorSummary || result.message
          ? `eBay response: ${result.errorSummary ?? result.message}.`
          : "",
      result.ok
        ? "Sandbox publish can continue after readiness checks."
        : "Sandbox fallback is enabled for diagnostics only if configured; real offer publish is blocked until a real fulfillment policy exists.",
      `Next: ${result.recommendation}`
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function retryFulfillmentStepFromTelegram({
  supabase,
  userId,
  question
}: ActionContext & {
  question?: string;
}) {
  if (isFulfillmentWhyQuestion(question)) {
    return explainFulfillmentFailureFromTelegram({ supabase, userId });
  }

  const result = await retryFulfillmentPolicyStep({ supabase, userId, marketplaceId: "EBAY_US" });
  const attempt = result.attempt;

  return {
    ok: result.ok,
    message: [
      result.message,
      attempt
        ? `Attempt ${attempt.attemptNumber}: ${attempt.serviceCode} / ${attempt.schemaVariant} / ${attempt.status}. ${
            attempt.message ?? ""
          }`
        : "",
      result.nextAttemptIndex != null ? `Next attempt index: ${result.nextAttemptIndex + 1}.` : "",
      result.fulfillmentPolicyStored ? "Fulfillment policy is now stored." : "",
      !result.fulfillmentPolicyStored && attempt?.status === "timeout"
        ? "If every service keeps timing out, eBay sandbox Account API is likely blocking fulfillment policy creation for this seller. Payment, return, and location can still be ready, but offer publish stays blocked until fulfillment policy exists."
        : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function explainFulfillmentFailureFromTelegram({ supabase, userId }: ActionContext) {
  const [account, logs] = await Promise.all([
    getEbayAccount({ supabase, userId, marketplace: "EBAY_US" }),
    supabase
      .from("automation_logs")
      .select("message,metadata_json,created_at")
      .eq("user_id", userId)
      .eq("module", "ebay_policies")
      .in("message", [
        "ebay_fulfillment_step_failed",
        "ebay_fulfillment_long_test_timeout",
        "ebay_fulfillment_long_test_inconclusive"
      ])
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  if (logs.error) {
    throw new Error(logs.error.message);
  }

  const timeoutServices = Array.from(
    new Set(
      (logs.data ?? [])
        .map((row) => {
          const metadata = (row as { metadata_json?: unknown }).metadata_json;
          if (!metadata || typeof metadata !== "object") {
            return null;
          }

          const record = metadata as Record<string, unknown>;
          const status = record.status;
          const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
          const timedOut = status === "timeout" || message.includes("timed out") || row.message.includes("timeout");

          if (!timedOut) {
            return null;
          }

          return (
            (typeof record.serviceCode === "string" && record.serviceCode) ||
            (typeof record.shippingServiceCode === "string" && record.shippingServiceCode) ||
            null
          );
        })
        .filter((value): value is string => Boolean(value))
    )
  );
  const paymentReady = Boolean(account?.payment_policy_id);
  const returnReady = Boolean(account?.return_policy_id);
  const locationReady = Boolean(account?.inventory_location_key);
  const fulfillmentReady = Boolean(account?.fulfillment_policy_id);

  return {
    ok: fulfillmentReady,
    message: [
      fulfillmentReady
        ? "Fulfillment policy is stored now. Sync seller policies if the UI still looks stale."
        : "Fulfillment policy still is not stored.",
      timeoutServices.length
        ? `Recent fulfillment creation attempts timed out for: ${timeoutServices.join(", ")}.`
        : "Recent logs do not show a successful fulfillment policy creation attempt.",
      !fulfillmentReady
        ? "This now looks like an eBay sandbox Account API timeout for this seller, not a shipping service code problem."
        : "",
      `Readiness: payment ${paymentReady ? "ready" : "missing"}, return ${returnReady ? "ready" : "missing"}, inventory location ${locationReady ? "ready" : "missing"}.`,
      !fulfillmentReady
        ? "Offer publish is blocked until a real fulfillment policy ID exists. Run the official docs fulfillment test; if it returns 20500, report eBay sandbox Account API issue and continue draft/demo workflow only."
        : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function syncEbayPoliciesFromTelegram({ supabase, userId }: ActionContext) {
  try {
    const result = await syncSellerPolicies({ supabase, userId });
    const policies = result.policies;

    return {
      ok: true,
      message: `Seller policies synced. Payment: ${policies.paymentPolicy?.name ?? "missing"}, return: ${
        policies.returnPolicy?.name ?? "missing"
      }, fulfillment: ${policies.fulfillmentPolicy?.name ?? "missing"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Seller policy sync failed."
    };
  }
}

async function createDefaultEbayPoliciesFromTelegram({ supabase, userId }: ActionContext) {
  try {
    const result = await createDefaultSellerPolicies({ supabase, userId, marketplaceId: "EBAY_US" });
    const status = result.policyStatus;

    return {
      ok: !result.partial,
      message: [
        result.partial
          ? `Default policy setup partially completed. Missing: ${result.missing.join(", ")}.`
          : "Default sandbox seller policies created and synced.",
        `Payment: ${status.paymentPolicy.policyName ?? status.paymentPolicy.status}.`,
        `Return: ${status.returnPolicy.policyName ?? status.returnPolicy.status}.`,
        `Fulfillment: ${status.fulfillmentPolicy.policyName ?? status.fulfillmentPolicy.status}.`
      ].join("\n")
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Default seller policy creation failed."
    };
  }
}

async function setupEbayLocationFromTelegram({ supabase, userId }: ActionContext) {
  try {
    const result = await ensureInventoryLocation({ supabase, userId });

    return {
      ok: true,
      message: `Inventory location ready: ${result.location.merchantLocationKey}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Inventory location setup failed."
    };
  }
}

async function publishSafeDraftsSandbox({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,ebay_title,status,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls")
    .eq("user_id", userId)
    .eq("status", "approved")
    .limit(quantity);

  if (error) {
    throw new Error(error.message);
  }

  const account = await getEbayAccount({ supabase, userId });
  const rows = (data ?? []) as Array<Record<string, any>>;

  if (!account?.fulfillment_policy_id) {
    return {
      ok: false,
      message: [
        "Drafts are ready, but sandbox publish is blocked because fulfillment policy is missing.",
        isSandboxPolicyFallbackAllowed()
          ? "Sandbox fallback is enabled for diagnostics, but real offer publish is blocked until a real fulfillment policy exists."
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  const readiness = await Promise.all(rows.map((draft) => validateListingReadiness({ draft, account })));
  const readyDrafts = rows.filter((_, index) => readiness[index]?.ready);

  if (!readyDrafts.length) {
    const firstMissing = readiness.find((result) => !result.ready)?.missing.slice(0, 5).join(", ");
    return {
      ok: true,
      message: firstMissing
        ? `No sandbox-ready drafts found. First missing items: ${firstMissing}.`
        : "No approved listing drafts found. Approve drafts and complete readiness checks first."
    };
  }

  let published = 0;
  let failed = 0;
  const failureReasons: string[] = [];

  for (const draft of readyDrafts as Array<{ id: string }>) {
    try {
      await publishListingDraftToEbaySandbox({ supabase, userId, draftId: draft.id });
      published += 1;
    } catch (error) {
      failed += 1;
      failureReasons.push(error instanceof Error ? error.message : "Publish failed.");
    }
  }

  return {
    ok: failed === 0,
    message: `Sandbox publish finished: ${published} published, ${failed} failed. Production eBay publishing remains disabled.${
      failureReasons.length ? `\nFailures:\n${failureReasons.slice(0, 5).map((reason) => `- ${reason}`).join("\n")}` : ""
    }`
  };
}

async function showReadyDrafts({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const account = await getEbayAccount({ supabase, userId });
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,ebay_title,status,ebay_description,ebay_category_id,item_specifics,condition,quantity,price,optimized_image_urls,supplier_products(supplier_sku)")
    .eq("user_id", userId)
    .in("status", ["approved", "draft", "failed"])
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(quantity * 3, 5), 50));

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, any>>;
  const readiness = await Promise.all(
    rows.map((draft) =>
      validateListingReadiness({
        draft: {
          ...draft,
          supplier_sku: getEmbeddedRow(draft.supplier_products)?.supplier_sku ?? null
        },
        account
      })
    )
  );
  const ready = rows.filter((_, index) => readiness[index]?.canPublishSandbox).slice(0, quantity);
  const firstMissing = readiness.find((result) => !result.canPublishSandbox)?.missing.slice(0, 5) ?? [];

  return {
    ok: true,
    message: ready.length
      ? `Publish-ready drafts:\n${ready.map((draft, index) => `${index + 1}. ${draft.ebay_title}`).join("\n")}`
      : `No publish-ready drafts yet.${firstMissing.length ? ` Missing first: ${firstMissing.join(", ")}.` : ""}`
  };
}

async function improveListingCopyFromTelegram({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const limit = Math.min(Math.max(quantity, 1), 5);
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,status,supplier_products(*),product_analysis(*)")
    .eq("user_id", userId)
    .neq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  let skipped = 0;

  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const productRow = getEmbeddedRow(row.supplier_products);
    const analysisRow = getEmbeddedRow(row.product_analysis);

    if (!productRow || !analysisRow) {
      skipped += 1;
      continue;
    }

    const product = mapSupplierProduct(productRow);
    const analysis = mapProductAnalysis(analysisRow);
    const generated = await generateListingForDraft(product, analysis);
    const { error: updateError } = await supabase
      .from("listing_drafts")
      .update({
        ebay_title: generated.ebayTitle,
        ebay_description: generated.ebayDescription,
        item_specifics: generated.itemSpecifics,
        ai_generated: true,
        error_message: null,
        ebay_error_code: null,
        ebay_error_json: {}
      })
      .eq("user_id", userId)
      .eq("id", row.id);

    if (updateError) {
      skipped += 1;
    } else {
      updated += 1;
    }
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: updated > 0 ? "success" : "warning",
    module: "listing_drafts",
    message: "listing_copy_improved_from_telegram",
    metadata: { updated, skipped }
  });

  return {
    ok: updated > 0,
    message: `${updated} draft listing copy updated. ${skipped} skipped. No publish action was run.`
  };
}

async function optimizeImagesFromTelegram({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const limit = Math.min(Math.max(quantity, 1), 5);
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id,supplier_product_id,optimized_image_urls,supplier_products(image_urls)")
    .eq("user_id", userId)
    .neq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  let updated = 0;
  let rejected = 0;
  const warnings = new Set<string>();
  const storeImages = isSupabaseImageStorageConfigured();

  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const product = getEmbeddedRow(row.supplier_products);
    const sourceUrls = Array.isArray(row.optimized_image_urls) && row.optimized_image_urls.length
      ? row.optimized_image_urls
      : Array.isArray(product?.image_urls)
        ? product.image_urls
        : [];
    const result = await optimizeProductImages({
      imageUrls: sourceUrls,
      userId,
      supplierProductId: row.supplier_product_id as string,
      store: storeImages,
      maxImages: 8
    });

    rejected += result.rejected.length;
    for (const warning of result.warnings) {
      warnings.add(warning);
    }

    if (result.optimizedUrls.length) {
      const { error: updateError } = await supabase
        .from("listing_drafts")
        .update({ optimized_image_urls: result.optimizedUrls })
        .eq("user_id", userId)
        .eq("id", row.id);

      if (!updateError) {
        updated += 1;
      }
    }
  }

  return {
    ok: updated > 0,
    message: `${updated} drafts now have validated image URLs. ${rejected} image URLs rejected.${
      warnings.size ? `\n${Array.from(warnings).join("\n")}` : ""
    }`
  };
}

async function showFailedTasks({ supabase, userId }: ActionContext) {
  const [tasks, drafts] = await Promise.all([
    supabase
      .from("agent_tasks")
      .select("task_type,error_message,created_at")
      .eq("user_id", userId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("listing_drafts")
      .select("ebay_title,ebay_error_code,error_message")
      .eq("user_id", userId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5)
  ]);

  const failedTasks = (tasks.data ?? []) as Array<{ task_type: string; error_message?: string | null }>;
  const failedDrafts = (drafts.data ?? []) as Array<{ ebay_title: string; ebay_error_code?: string | null; error_message?: string | null }>;

  if (!failedTasks.length && !failedDrafts.length) {
    return { ok: true, message: "No failed tasks or failed listing drafts found." };
  }

  return {
    ok: true,
    message: [
      ...failedTasks.map((task) => `${task.task_type}: ${task.error_message ?? "failed"}`),
      ...failedDrafts.map((draft) => `${draft.ebay_title}: ${draft.ebay_error_code ?? "ERROR"} ${draft.error_message ?? ""}`)
    ]
      .slice(0, 6)
      .join("\n")
  };
}

async function explainSystem({
  supabase,
  userId,
  question
}: ActionContext & {
  question?: string;
}) {
  const settings = await getAutomationSettings(supabase, userId);
  const [suppliers, products, drafts, logs] = await Promise.all([
    supabase.from("suppliers").select("id,name,status,allows_dropshipping").eq("user_id", userId).limit(25),
    supabase.from("supplier_products").select("id,supplier_id").eq("user_id", userId).limit(1000),
    supabase.from("listing_drafts").select("status").eq("user_id", userId).limit(500),
    supabase
      .from("automation_logs")
      .select("level,module,message,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  if (suppliers.error) {
    throw new Error(suppliers.error.message);
  }

  if (products.error) {
    throw new Error(products.error.message);
  }

  if (drafts.error) {
    throw new Error(drafts.error.message);
  }

  if (logs.error) {
    throw new Error(logs.error.message);
  }

  const supplierRows = (suppliers.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    allows_dropshipping: boolean;
  }>;
  const productRows = (products.data ?? []) as Array<{ supplier_id: string }>;
  const draftRows = (drafts.data ?? []) as Array<{ status: string }>;
  const logRows = (logs.data ?? []) as Array<{ level: string; module: string; message: string }>;
  const activeSuppliers = supplierRows.filter((supplier) => supplier.status === "active" && supplier.allows_dropshipping).length;
  const failedDrafts = draftRows.filter((draft) => draft.status === "failed").length;
  const recentProblem = logRows.find((log) => log.level === "error" || log.level === "warning");
  const supplierProductCounts = supplierRows
    .map((supplier) => ({
      name: supplier.name,
      count: productRows.filter((product) => product.supplier_id === supplier.id).length,
      status: supplier.status,
      allowed: supplier.allows_dropshipping
    }))
    .sort((a, b) => b.count - a.count);

  if (question && /supplier|təchizat|techizat|hansi|hansı|better|yaxsi|yaxşı/i.test(question)) {
    const best = supplierProductCounts[0];

    return {
      ok: true,
      message: best
        ? `Supplier baxımından ən güclü namizəd hazırda ${best.name}: ${best.count} imported products, status ${best.status}, dropshipping ${
            best.allowed ? "allowed" : "not confirmed"
          }. Daha dəqiq qərar üçün sales və failure history Phase 5-də stock/order sync ilə güclənəcək.`
        : "Hələ supplier data yoxdur. Approved wholesale supplier CSV upload etdikdən sonra müqayisə edə bilərəm."
    };
  }

  if (question && /problem|xeta|xəta|hata|issue|niye|niyə/i.test(question)) {
    return {
      ok: true,
      message: recentProblem
        ? `Əsas problem kimi son log görünür: ${recentProblem.module} - ${recentProblem.message}. Failed drafts: ${failedDrafts}. Automation ${
            settings.autoListingEnabled ? "aktivdir" : "dayandırılıb"
          }.`
        : `Kritik problem görünmür. Automation ${settings.autoListingEnabled ? "aktivdir" : "dayandırılıb"}, active approved suppliers ${activeSuppliers}, failed drafts ${failedDrafts}.`
    };
  }

  return {
    ok: true,
    message: `Sadə izah: mən approved supplier məhsullarını analiz edirəm, profit/risk qaydalarına uyğun olanlardan draft yaradıram və yalnız sandbox eBay publish flow istifadə edirəm. Current rules: automation ${
      settings.autoListingEnabled ? "aktivdir" : "dayandırılıb"
    }, daily limit ${settings.dailyListingLimit}, min margin ${settings.minMarginPercentage}%, approval mode ${settings.approvalMode}. Production publishing bağlıdır.`
  };
}

async function updateBlockedArray({
  supabase,
  userId,
  field,
  value
}: ActionContext & {
  field: "blocked_categories" | "blocked_brands";
  value?: string;
}) {
  if (!value) {
    return { ok: false, message: `Tell me which ${field === "blocked_categories" ? "category" : "brand"} to block.` };
  }

  const settings = await getSettingsRow(supabase, userId);
  const current = Array.isArray(settings?.[field]) ? (settings[field] as string[]) : [];
  const next = Array.from(new Set([...current, value.trim()]));
  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase.from("automation_settings").update({ [field]: next }).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `${value} added to ${field.replace("_", " ")}.` };
}

async function changeApprovalMode({ supabase, userId, value }: ActionContext & { value?: string }) {
  const allowed = new Set(["manual", "trusted_auto", "full_auto"]);

  if (!value || !allowed.has(value)) {
    return { ok: false, message: "Approval mode must be manual, trusted_auto, or full_auto." };
  }

  if (value === "full_auto") {
    return {
      ok: false,
      message: "Full auto mode is not enabled through Telegram in Phase 3. Use manual or trusted_auto after sandbox validation."
    };
  }

  await ensureSettingsRow(supabase, userId);
  const { error } = await supabase.from("automation_settings").update({ approval_mode: value }).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: `Approval mode changed to ${value}.` };
}

async function getAutomationSettings(supabase: SupabaseClient, userId: string): Promise<AutomationSettings> {
  const row = await getSettingsRow(supabase, userId);

  if (!row) {
    await ensureSettingsRow(supabase, userId);
    return getAutomationSettings(supabase, userId);
  }

  return {
    userId,
    dailyListingLimit: Number(row.daily_listing_limit ?? 10),
    minProfitAmount: Number(row.min_profit_amount ?? 2),
    minMarginPercentage: Number(row.min_margin_percentage ?? 20),
    maxShippingDays: Number(row.max_shipping_days ?? 10),
    minStockQuantity: Number(row.min_stock_quantity ?? 5),
    autoListingEnabled: Boolean(row.auto_listing_enabled),
    approvalMode: row.approval_mode ?? "manual",
    riskTolerance: Number(row.risk_tolerance ?? 40),
    defaultQuantity: Number(row.default_quantity ?? 1),
    pricingBufferPercentage: Number(row.pricing_buffer_percentage ?? 5),
    promotedListingPercentage: Number(row.promoted_listing_percentage ?? 0),
    allowedCategories: row.allowed_categories ?? [],
    blockedCategories: row.blocked_categories ?? [],
    blockedBrands: row.blocked_brands ?? [],
    blockedKeywords: row.blocked_keywords ?? [],
    supplierPriority: row.supplier_priority ?? [],
    defaultMarketplace: "EBAY_US",
    shippingCountryPreference: row.shipping_country_preference ?? "US",
    maxPrice: row.max_price ? Number(row.max_price) : null,
    minPrice: row.min_price ? Number(row.min_price) : null,
    requireImageQualityScore: Number(row.require_image_quality_score ?? 65),
    requireDemandScore: Number(row.require_demand_score ?? 35),
    newAccountSafeMode: Boolean(row.new_account_safe_mode ?? true)
  };
}

async function getSettingsRow(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("automation_settings").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Record<string, any> | null;
}

async function ensureSettingsRow(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("automation_settings").upsert(
    {
      user_id: userId,
      daily_listing_limit: 10,
      min_margin_percentage: 20,
      min_profit_amount: 2,
      risk_tolerance: 40,
      max_shipping_days: 10,
      approval_mode: "manual"
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function loadProductsForAction({
  supabase,
  userId,
  limit
}: ActionContext & { limit: number }) {
  const [productResponse, supplierResponse] = await Promise.all([
    supabase
      .from("supplier_products")
      .select("*")
      .eq("user_id", userId)
      .gt("stock_quantity", 0)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("suppliers").select("*").eq("user_id", userId)
  ]);

  if (productResponse.error) {
    throw new Error(productResponse.error.message);
  }

  if (supplierResponse.error) {
    throw new Error(supplierResponse.error.message);
  }

  return {
    products: ((productResponse.data ?? []) as Array<Record<string, any>>).map(mapSupplierProduct),
    suppliers: ((supplierResponse.data ?? []) as Array<Record<string, any>>).map(mapSupplier)
  };
}

function mapSupplierProduct(row: Record<string, any>): SupplierProduct {
  return {
    id: row.id,
    userId: row.user_id,
    supplierId: row.supplier_id,
    supplierSku: row.supplier_sku,
    title: row.title,
    description: row.description,
    brand: row.brand,
    category: row.category,
    supplierPrice: Number(row.supplier_price ?? 0),
    shippingCost: Number(row.shipping_cost ?? 0),
    stockQuantity: Number(row.stock_quantity ?? 0),
    currency: row.currency ?? "USD",
    productUrl: row.product_url,
    imageUrls: row.image_urls ?? [],
    rawData: row.raw_data ?? {},
    shippingDays: Number(row.shipping_days ?? 5),
    countryOfOrigin: row.country_of_origin
  };
}

function mapSupplier(row: Record<string, any>): Supplier {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    status: row.status,
    country: row.country,
    defaultShippingDays: Number(row.default_shipping_days ?? 5),
    allowsDropshipping: Boolean(row.allows_dropshipping),
    notes: row.notes
  };
}

function mapProductAnalysis(row: Record<string, any>): ProductAnalysis {
  return {
    profitScore: Number(row.profit_score ?? 0),
    riskScore: Number(row.risk_score ?? 0),
    demandScore: Number(row.demand_score ?? 0),
    competitionScore: Number(row.competition_score ?? 0),
    imageScore: Number(row.image_score ?? 0),
    shippingScore: Number(row.shipping_score ?? 0),
    finalScore: Number(row.final_score ?? 0),
    estimatedEbayFees: Number(row.estimated_ebay_fees ?? 0),
    estimatedTotalCost: Number(row.estimated_total_cost ?? 0),
    recommendedEbayPrice: Number(row.recommended_ebay_price ?? 0),
    estimatedProfit: Number(row.estimated_profit ?? 0),
    marginPercentage: Number(row.margin_percentage ?? 0),
    aiNotes: row.ai_notes ?? "",
    rejectionReasons: Array.isArray(row.rejection_reasons) ? row.rejection_reasons : [],
    approvedForListing: Boolean(row.approved_for_listing)
  };
}

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampBatchQuantity(value: number, max: number) {
  return Math.min(Math.max(Math.floor(value || 1), 1), max);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isFulfillmentWhyQuestion(question?: string) {
  if (!question) {
    return false;
  }

  return /niy[əe]|why|al[ıi]nm[ıi]r|problem|timeout|timed out/i.test(question);
}

function groupRejectionReason(reason: string) {
  if (/estimated profit/i.test(reason)) {
    return "Estimated profit below minimum";
  }

  if (/margin/i.test(reason)) {
    return "Margin below minimum";
  }

  if (/risk score/i.test(reason)) {
    return "Risk score below tolerance";
  }

  if (/image quality|no usable supplier images/i.test(reason)) {
    return "Image requirement failed";
  }

  if (/shipping time/i.test(reason)) {
    return "Shipping time above maximum";
  }

  if (/stock is below/i.test(reason)) {
    return "Stock below minimum";
  }

  if (/blocked category/i.test(reason)) {
    return "Blocked category matched";
  }

  if (/blocked brand/i.test(reason)) {
    return "Blocked brand matched";
  }

  if (/supplier/i.test(reason)) {
    return "Supplier compliance issue";
  }

  if (/required sku|missing/i.test(reason)) {
    return "Missing required product data";
  }

  return reason.replace(/\.$/, "");
}

function formatGroupedRejectionReasons(rejectionCounts: Map<string, number>) {
  return Array.from(rejectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, count]) => `- ${reason}: ${count} ${count === 1 ? "product" : "products"}`)
    .join("\n");
}

function describeSupabaseError(error: { message?: string; code?: string }) {
  const message = error.message ?? "Supabase operation failed.";

  if (error.code === "42501" || /row-level security|rls/i.test(message)) {
    return `RLS error: ${message}`;
  }

  return message;
}

function getEmbeddedRow(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    return (value[0] as Record<string, any> | undefined) ?? null;
  }

  return (value as Record<string, any> | null) ?? null;
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

interface ActionContext {
  supabase: SupabaseClient;
  userId: string;
}

interface DraftCandidate {
  product: SupplierProduct;
  analysis: ProductAnalysis;
  analysisId: string | null;
  failureReason?: string;
}

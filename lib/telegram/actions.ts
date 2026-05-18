import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { publishListingDraftToEbaySandbox } from "@/lib/ebay/publish";
import { generateListing } from "@/lib/ai/generate-listing";
import { analyzeProduct } from "@/lib/products/analyze-product";
import type { TelegramIntent } from "@/lib/telegram/intent-parser";
import type { AgentTaskResult, AutomationSettings, Supplier, SupplierProduct } from "@/lib/types";

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
    case "FIND_PRODUCTS":
      return findProducts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 10 });
    case "ANALYZE_PRODUCTS":
      return analyzeProducts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 10 });
    case "CREATE_LISTING_DRAFTS":
      return createListingDrafts({ supabase, userId, quantity: getNumber(intent.parameters.quantity) ?? 5 });
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
    supabase.from("ebay_accounts").select("status,marketplace").eq("user_id", userId).maybeSingle()
  ]);
  const draftRows = (drafts.data ?? []) as Array<{ status: string }>;
  const taskRows = (tasks.data ?? []) as Array<{ status: string }>;
  const activeDrafts = draftRows.filter((draft) => draft.status === "draft" || draft.status === "approved").length;
  const failedTasks = taskRows.filter((task) => task.status === "failed").length;

  return {
    ok: true,
    message: `Status: automation ${settings.autoListingEnabled ? "aktivdir" : "dayandırılıb"}, daily limit ${settings.dailyListingLimit}, min margin ${settings.minMarginPercentage}%, approval mode ${settings.approvalMode}. Suppliers ${suppliers.count ?? 0}, products ${products.count ?? 0}, active drafts ${activeDrafts}, failed tasks today ${failedTasks}. eBay ${ebay.data?.status ?? "not connected"} (${ebay.data?.marketplace ?? "sandbox"}).`
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

async function findProducts({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const { data, error } = await supabase
    .from("supplier_products")
    .select("id,title,category,stock_quantity,shipping_days")
    .eq("user_id", userId)
    .gt("stock_quantity", 0)
    .order("created_at", { ascending: false })
    .limit(quantity);

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
  const settings = await getAutomationSettings(supabase, userId);
  const { products, suppliers } = await loadProductsForAction({ supabase, userId, limit: quantity });

  if (!products.length) {
    return { ok: true, message: "No supplier products available for analysis." };
  }

  let approved = 0;
  let rejected = 0;

  for (const product of products) {
    const supplier = suppliers.find((item) => item.id === product.supplierId) ?? null;
    const analysis = analyzeProduct({ product, settings, supplier });
    approved += analysis.approvedForListing ? 1 : 0;
    rejected += analysis.approvedForListing ? 0 : 1;

    await supabase.from("product_analysis").insert({
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
  }

  return {
    ok: true,
    message: `${products.length} products analyzed: ${approved} approved, ${rejected} rejected by safety/profit rules.`
  };
}

async function createListingDrafts({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const settings = await getAutomationSettings(supabase, userId);
  const { products, suppliers } = await loadProductsForAction({ supabase, userId, limit: quantity });

  if (!products.length) {
    return { ok: true, message: "No supplier products available for draft creation." };
  }

  let draftsCreated = 0;
  let rejected = 0;

  for (const product of products) {
    const supplier = suppliers.find((item) => item.id === product.supplierId) ?? null;
    const analysis = analyzeProduct({ product, settings, supplier });

    if (!analysis.approvedForListing) {
      rejected += 1;
      continue;
    }

    const generated = await generateListing({ product, analysis });
    const { error } = await supabase.from("listing_drafts").insert({
      user_id: userId,
      supplier_product_id: product.id,
      ebay_title: generated.ebayTitle,
      ebay_description: generated.ebayDescription,
      ebay_category_id: null,
      item_specifics: generated.itemSpecifics,
      condition: "NEW",
      quantity: Math.min(settings.defaultQuantity, Math.max(product.stockQuantity, 1)),
      price: analysis.recommendedEbayPrice,
      optimized_image_urls: product.imageUrls,
      status: "draft",
      ai_generated: true
    });

    if (error) {
      throw new Error(error.message);
    }

    draftsCreated += 1;
  }

  return {
    ok: true,
    message: `${draftsCreated} listing drafts created, ${rejected} products held back by rules. Drafts still need eBay category IDs before sandbox publish.`
  };
}

async function publishSafeDraftsSandbox({ supabase, userId, quantity }: ActionContext & { quantity: number }) {
  const { data, error } = await supabase
    .from("listing_drafts")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["approved", "draft"])
    .not("ebay_category_id", "is", null)
    .limit(quantity);

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    return {
      ok: true,
      message: "No sandbox-ready drafts found. Drafts need approved status, eBay category ID, item specifics, and image URLs."
    };
  }

  let published = 0;
  let failed = 0;

  for (const draft of data as Array<{ id: string }>) {
    try {
      await publishListingDraftToEbaySandbox({ supabase, userId, draftId: draft.id });
      published += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ok: failed === 0,
    message: `Sandbox publish finished: ${published} published, ${failed} failed. Production eBay publishing remains disabled.`
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
    dailyListingLimit: Number(row.daily_listing_limit ?? 5),
    minProfitAmount: Number(row.min_profit_amount ?? 5),
    minMarginPercentage: Number(row.min_margin_percentage ?? 25),
    maxShippingDays: Number(row.max_shipping_days ?? 5),
    minStockQuantity: Number(row.min_stock_quantity ?? 5),
    autoListingEnabled: Boolean(row.auto_listing_enabled),
    approvalMode: row.approval_mode ?? "manual",
    riskTolerance: Number(row.risk_tolerance ?? 80),
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
  const { error } = await supabase.from("automation_settings").upsert({ user_id: userId }, { onConflict: "user_id" });

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

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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

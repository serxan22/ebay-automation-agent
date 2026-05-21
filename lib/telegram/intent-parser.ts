import { z } from "zod";
import { getConfiguredAiProvider } from "@/lib/ai";
import { telegramIntentSystemPrompt } from "@/lib/ai/prompts/telegram-intent";
import type { AutomationSettings } from "@/lib/types";

export const TelegramIntentNameSchema = z.enum([
  "SHOW_SYSTEM_HEALTH",
  "RESUME_AUTOMATION",
  "PAUSE_AUTOMATION",
  "SHOW_STATUS",
  "SHOW_DAILY_REPORT",
  "CHANGE_DAILY_LIMIT",
  "CHANGE_MIN_MARGIN",
  "CHANGE_MIN_PROFIT",
  "CHANGE_RISK_TOLERANCE",
  "ENABLE_TEST_MODE",
  "FIND_PRODUCTS",
  "ANALYZE_PRODUCTS",
  "CREATE_LISTING_DRAFTS",
  "SHOW_LISTING_DRAFTS",
  "APPROVE_DRAFTS",
  "REVISE_DRAFT_HELP",
  "SHOW_EBAY_READINESS",
  "DISCOVER_SHIPPING_SERVICES",
  "RUN_FULFILLMENT_DOCS_TEST",
  "RESOLVE_CATEGORIES",
  "GENERATE_ITEM_SPECIFICS",
  "RETRY_FULFILLMENT_STEP",
  "SYNC_EBAY_POLICIES",
  "CREATE_DEFAULT_EBAY_POLICIES",
  "SETUP_EBAY_LOCATION",
  "IMPROVE_LISTING_COPY",
  "OPTIMIZE_IMAGES",
  "SHOW_READY_DRAFTS",
  "PUBLISH_READY_DRAFTS_SANDBOX",
  "PUBLISH_SAFE_DRAFTS_SANDBOX",
  "SHOW_FAILED_TASKS",
  "UPDATE_BLOCKED_CATEGORY",
  "UPDATE_BLOCKED_BRAND",
  "CHANGE_APPROVAL_MODE",
  "EXPLAIN_SYSTEM",
  "ASK_CLARIFICATION",
  "UNKNOWN"
]);

const NullableNumberSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return value;
}, z.number().nullable());

const NullableStringSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}, z.string().nullable());

export const TelegramIntentParametersSchema = z
  .object({
    quantity: NullableNumberSchema.default(null),
    min_margin_percentage: NullableNumberSchema.default(null),
    min_profit_amount: NullableNumberSchema.default(null),
    risk_tolerance: NullableNumberSchema.default(null),
    category: NullableStringSchema.default(null),
    blocked_category: NullableStringSchema.default(null),
    blocked_brand: NullableStringSchema.default(null),
    approval_mode: z.enum(["manual", "trusted_auto", "full_auto", "full_auto_sandbox_only"]).nullable().default(null),
    timeframe: z.enum(["today", "tomorrow", "daily", "weekly"]).nullable().default(null),
    publish_mode: z.enum(["sandbox_only"]).nullable().default(null),
    draft_source: z.enum(["latest_products", "approved_products"]).nullable().default(null),
    draft_status: z.enum(["draft", "approved", "published", "failed"]).nullable().default(null),
    user_question: NullableStringSchema.default(null)
  })
  .strict()
  .default({
    quantity: null,
    min_margin_percentage: null,
    min_profit_amount: null,
    risk_tolerance: null,
    category: null,
    blocked_category: null,
    blocked_brand: null,
    approval_mode: null,
    timeframe: null,
    publish_mode: null,
    draft_source: null,
    draft_status: null,
    user_question: null
  });

export const TelegramIntentPayloadSchema = z
  .object({
    intent: TelegramIntentNameSchema,
    confidence: z.number().min(0).max(1),
    language: z.enum(["az", "tr", "en", "mixed"]),
    parameters: TelegramIntentParametersSchema,
    should_execute: z.boolean(),
    needs_confirmation: z.boolean(),
    clarifying_question: NullableStringSchema.default(null),
    safe_response: z.string().default("")
  })
  .strict();

export const TelegramIntentSchema = TelegramIntentPayloadSchema.extend({
  parser: z.enum(["ai", "deterministic", "heuristic"]).optional(),
  parser_warning: z.string().optional()
});

export type TelegramIntent = z.infer<typeof TelegramIntentSchema>;
export type TelegramIntentName = z.infer<typeof TelegramIntentNameSchema>;
export type TelegramParserMode = NonNullable<TelegramIntent["parser"]>;

export function getTelegramAiParserStatus() {
  const requestedProvider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const candidates = [
    { provider: "groq", hasKey: Boolean(process.env.GROQ_API_KEY) },
    { provider: "openai", hasKey: Boolean(process.env.OPENAI_API_KEY) },
    { provider: "anthropic", hasKey: Boolean(process.env.ANTHROPIC_API_KEY) }
  ];
  const requested = candidates.find((candidate) => candidate.provider === requestedProvider);
  const active = requested?.hasKey ? requested : candidates.find((candidate) => candidate.hasKey);

  if (active) {
    return {
      active: true,
      provider: active.provider,
      requestedProvider,
      label: `AI parser active: ${active.provider} configured`
    };
  }

  return {
    active: false,
    provider: null,
    requestedProvider,
    label: "Fallback parser active: no AI provider key configured",
    warning: "Telegram AI parser is disabled because no Groq, OpenAI, or Anthropic API key is configured."
  };
}

export async function parseTelegramIntent({
  message,
  settings
}: {
  message: string;
  settings?: Partial<AutomationSettings>;
}): Promise<TelegramIntent> {
  const parserStatus = getTelegramAiParserStatus();
  const provider = parserStatus.active ? getConfiguredAiProvider() : null;

  if (provider) {
    try {
      const parsed = await provider.generateJson<unknown>({
        temperature: 0,
        maxTokens: 900,
        messages: [
          { role: "system", content: telegramIntentSystemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              message,
              savedSettings: settings ?? null,
              allowedIntents: TelegramIntentNameSchema.options,
              sandboxOnlyPublishing: true,
              requiredJsonShape: {
                intent: TelegramIntentNameSchema.options,
                confidence: "number from 0 to 1",
                language: ["az", "tr", "en", "mixed"],
                parameters: Object.keys(TelegramIntentParametersSchema.parse({})),
                should_execute: "boolean",
                needs_confirmation: "boolean",
                clarifying_question: "string or null",
                safe_response: "string"
              }
            })
          }
        ]
      });

      return coerceDraftIntentForMessage(
        normalizeIntent(TelegramIntentPayloadSchema.parse(parsed), "ai"),
        message
      );
    } catch (error) {
      const fallback = parseTelegramIntentHeuristically(message, settings);
      const reason = error instanceof Error ? error.message : "AI parser returned invalid JSON.";

      return coerceDraftIntentForMessage(
        {
          ...fallback,
          parser_warning: `AI parser failed, deterministic fallback used. ${reason}`
        },
        message
      );
    }
  }

  const fallback = parseTelegramIntentHeuristically(message, settings);

  return coerceDraftIntentForMessage({
    ...fallback,
    parser_warning: parserStatus.warning
  }, message);
}

export function parseTelegramIntentHeuristically(
  message: string,
  settings?: Partial<AutomationSettings>
): TelegramIntent {
  const deterministicIntent = parseDeterministicControlIntent(message, settings);

  if (deterministicIntent) {
    return deterministicIntent;
  }

  const text = normalizeCommandText(message);
  const quantity = extractQuantity(text);
  const margin = extractMargin(text);
  const minProfit = extractMinProfit(text);
  const riskTolerance = extractRiskTolerance(text);
  const language = detectLanguage(text);
  const parameters = defaultIntentParameters();
  parameters.user_question = message;

  if (quantity) {
    parameters.quantity = quantity;
  }

  if (margin) {
    parameters.min_margin_percentage = margin;
  }

  if (minProfit !== undefined) {
    parameters.min_profit_amount = minProfit;
  }

  if (riskTolerance !== undefined) {
    parameters.risk_tolerance = riskTolerance;
  }

  if (/\bus\b|amerika|united states/.test(text)) {
    parameters.category = parameters.category ?? null;
  }

  if (/today|bugun|bugün|bu gun|bu gün/.test(text)) {
    parameters.timeframe = "today";
  }

  if (/tomorrow|sabah/.test(text)) {
    parameters.timeframe = "tomorrow";
  }

  if (/daily|gundelik|gündəlik|gunluk|günlük/.test(text)) {
    parameters.timeframe = "daily";
  }

  if (/home|kitchen|decor|metbex|mətbəx|ev|mutfak/.test(text)) {
    parameters.category = "home kitchen";
  }

  if (isProductionPublishRequest(text)) {
    return makeIntent("ASK_CLARIFICATION", language, {
      confidence: 0.88,
      should_execute: false,
      needs_confirmation: true,
      clarifying_question: "Production publishing hazırda safety üçün bağlıdır. Sandbox-da test etmək istəyirsən?",
      safe_response: "Production publishing safety üçün bağlıdır. Sandbox test edə bilərəm.",
      parameters: { ...parameters, publish_mode: null, user_question: message }
    });
  }

  if (isCreateDefaultEbayPoliciesRequest(text)) {
    return makeIntent("CREATE_DEFAULT_EBAY_POLICIES", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.9,
      safe_response: "Default sandbox seller policies yaradılır."
    });
  }

  if (isEbayPolicySyncRequest(text)) {
    return makeIntent("SYNC_EBAY_POLICIES", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.9,
      safe_response: "eBay sandbox seller policies sync edilir."
    });
  }

  if (isEbayLocationSetupRequest(text)) {
    return makeIntent("SETUP_EBAY_LOCATION", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.9,
      safe_response: "eBay sandbox inventory location qurulur."
    });
  }

  if (isEbayReadinessRequest(text)) {
    return makeIntent(/problem|nə problem|ne problem|catmir|çatmır/.test(text) ? "SHOW_SYSTEM_HEALTH" : "SHOW_EBAY_READINESS", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.9,
      safe_response: "eBay sandbox readiness statusunu yoxlayıram."
    });
  }

  if (/shipping service|shipping services|discover shipping|kargo service|çatdırılma service/.test(text)) {
    return makeIntent("DISCOVER_SHIPPING_SERVICES", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.9,
      safe_response: "Sandbox shipping services yoxlanılır."
    });
  }

  if (/docs fulfillment test|official docs.*fulfillment|fulfillment docs|docs test/.test(text)) {
    return makeIntent("RUN_FULFILLMENT_DOCS_TEST", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.92,
      safe_response: "Official docs fulfillment test işə salınır."
    });
  }

  if (/fulfillment|shipping policy|retry fulfillment|fulfillment niye|fulfillment niyə/.test(text)) {
    return makeIntent("RETRY_FULFILLMENT_STEP", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.88,
      safe_response: "Fulfillment policy üçün növbəti sandbox cəhdi işə salınır."
    });
  }

  if (/(category|categoryleri|categoryləri|kateqoriya|kateqoriyalari|kateqoriyaları).*(tap|find|duzelt|düzəlt|resolve)|(missing category|missing categoryleri|missing categoryləri)/.test(text)) {
    return makeIntent("RESOLVE_CATEGORIES", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.88,
      safe_response: "Missing eBay categoryləri Taxonomy API ilə resolve edirəm."
    });
  }

  if (/(item specific|item specifics|specifics|aspect|aspects).*(hazirla|hazırla|generate|duzelt|düzəlt|tap)/.test(text)) {
    return makeIntent("GENERATE_ITEM_SPECIFICS", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.88,
      safe_response: "Category-required item specifics hazırlanır."
    });
  }

  if (isUnsafeDropshippingRequest(text)) {
    return makeIntent("ASK_CLARIFICATION", language, {
      confidence: 0.84,
      should_execute: false,
      needs_confirmation: true,
      clarifying_question:
        "Marketplace-to-marketplace dropshipping safety və eBay policy baxımından risklidir. Approved wholesale supplier CSV/API ilə davam edək?",
      safe_response:
        "Unsafe marketplace-to-marketplace dropshipping qurmayacam. Yalnız approved wholesale supplier feed, CSV və supplier API-lərlə işləyə bilərəm.",
      parameters: { ...parameters, user_question: message }
    });
  }

  const blockedCategory = extractBlockedCategory(message);
  if (blockedCategory) {
    return makeIntent("UPDATE_BLOCKED_CATEGORY", language, {
      parameters: { ...parameters, blocked_category: blockedCategory },
      confidence: 0.82,
      safe_response: `${blockedCategory} blocked categories siyahısına əlavə ediləcək.`
    });
  }

  const blockedBrand = extractBlockedBrand(message);
  if (blockedBrand) {
    return makeIntent("UPDATE_BLOCKED_BRAND", language, {
      parameters: { ...parameters, blocked_brand: blockedBrand },
      confidence: 0.78,
      safe_response: `${blockedBrand} blocked brands siyahısına əlavə ediləcək.`
    });
  }

  if (/riskli|risky|tehlukeli|təhlükəli/.test(text) && /list etme|list etmə|etme|do not|don't|publish etme|publish etmə|yayınlama/.test(text)) {
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { ...parameters, approval_mode: "manual" },
      confidence: 0.76,
      safe_response: "Riskli məhsullar auto-list edilməsin deyə manual approval mode istifadə olunacaq."
    });
  }

  if (isTestModeRequest(text)) {
    return makeIntent("ENABLE_TEST_MODE", language, {
      parameters,
      confidence: 0.9,
      safe_response: "Test mode aktiv ediləcək: min profit $0.5, margin 5%, risk tolerance 40, max shipping 10 days."
    });
  }

  if (riskTolerance !== undefined && /(risk|tolerance|seviyye|səviyyə|seviyyesini|səviyyəsini)/.test(text)) {
    return makeIntent("CHANGE_RISK_TOLERANCE", language, {
      parameters: { ...parameters, risk_tolerance: riskTolerance },
      confidence: 0.9,
      safe_response: `Risk tolerance ${riskTolerance} olaraq yeniləndi.`
    });
  }

  if (minProfit !== undefined && /(profit|qazanc|dollar|\$|usd)/.test(text)) {
    return makeIntent("CHANGE_MIN_PROFIT", language, {
      parameters: { ...parameters, min_profit_amount: minProfit },
      confidence: 0.9,
      safe_response: `Minimum profit ${minProfit} dollar olaraq yeniləndi.`
    });
  }

  if (/daily limit|limit|gundelik|gündəlik|gunluk|günlük/.test(text) && quantity) {
    return makeIntent("CHANGE_DAILY_LIMIT", language, {
      parameters: { ...parameters, quantity },
      confidence: 0.86,
      needs_confirmation: quantity > 25 || Boolean(settings?.newAccountSafeMode),
      safe_response: `Daily listing limit ${quantity} olacaq.`
    });
  }

  if (/(minimum|min).*(margin|profit|marja|faiz)|(\d{1,3})\s*(%|faiz|percent).*(olsun|minimum|min|margin|profit)/.test(text) && margin) {
    return makeIntent("CHANGE_MIN_MARGIN", language, {
      parameters: { ...parameters, min_margin_percentage: margin },
      confidence: 0.86,
      safe_response: `Minimum margin ${margin}% olaraq yadda saxlanacaq.`
    });
  }

  if (/(full auto sandbox|full_auto_sandbox_only|sandbox only auto|sandbox auto)/.test(text)) {
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { ...parameters, approval_mode: "full_auto_sandbox_only" },
      confidence: 0.8,
      safe_response:
        "Full auto sandbox-only mode production publish etmir və readiness tam deyilsə publish bloklanır."
    });
  }

  if (/full auto|tam auto|tam avto/.test(text)) {
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { ...parameters, approval_mode: "full_auto" },
      confidence: 0.78,
      needs_confirmation: true,
      clarifying_question:
        "Full auto mode listing riskini artırır. Phase 3-də Telegram üzərindən full auto aktiv etmirəm; trusted_auto və ya manual seçə bilərsən.",
      safe_response:
        "Full auto mode Telegramdan aktiv edilmir. Safety üçün manual və ya trusted_auto mode istifadə et."
    });
  }

  if (/manual/.test(text) && /approval|mode|rejim/.test(text)) {
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { ...parameters, approval_mode: "manual" },
      confidence: 0.78,
      safe_response: "Manual approval mode aktiv ediləcək."
    });
  }

  if (/trusted auto|trusted_auto|etibarli auto|etibarlı auto/.test(text)) {
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { ...parameters, approval_mode: "trusted_auto" },
      confidence: 0.78,
      safe_response: "Trusted auto mode saxlanmış safety qaydaları ilə aktiv ediləcək."
    });
  }

  if (/report|hesabat|rapor/.test(text)) {
    if (/failed|fail|xeta|xəta|hata|reject|rejected|niye|niyə/.test(text)) {
      return makeIntent("SHOW_FAILED_TASKS", language, {
        parameters,
        confidence: 0.82,
        safe_response: "Failed və rejected taskları yoxlayıram."
      });
    }

    return makeIntent("SHOW_DAILY_REPORT", language, {
      parameters: { ...parameters, timeframe: parameters.timeframe ?? "today" },
      confidence: 0.84,
      safe_response: "Bugünkü reportu hazırlayıram."
    });
  }

  if (/sistem statusu|ne problem|nə problem|problem var|catmir|çatmır|issue|xeta|xəta|hata/.test(text)) {
    return makeIntent("SHOW_SYSTEM_HEALTH", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.88,
      safe_response: "Sistem checklistini yoxlayıram."
    });
  }

  if (/description|title|seo|premium|copy|cəlbedici|celbedici|listingleri premium|listingləri premium/.test(text)) {
    return makeIntent("IMPROVE_LISTING_COPY", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.82,
      safe_response: "Listing copy yenilənəcək; publish avtomatik edilməyəcək."
    });
  }

  if (/sekil|şəkil|image|images|optimize|hazirla|hazırla/.test(text)) {
    return makeIntent("OPTIMIZE_IMAGES", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.8,
      safe_response: "Draft şəkilləri yoxlanılacaq və mümkün olsa optimizasiya ediləcək."
    });
  }

  if (/ready draft|hazir draft|hazır draft|publish ucun hazir|publish üçün hazır/.test(text)) {
    return makeIntent("SHOW_READY_DRAFTS", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.84,
      safe_response: "Publish-ready draftları yoxlayıram."
    });
  }

  if (/problem|issue|supplier|izah|explain|insan kimi/.test(text)) {
    return makeIntent("EXPLAIN_SYSTEM", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.76,
      safe_response: "Sistemin vəziyyətini sadə dildə izah edirəm."
    });
  }

  if (isShowListingDraftsRequest(text)) {
    return makeIntent("SHOW_LISTING_DRAFTS", language, {
      parameters: { ...parameters, draft_status: extractDraftStatus(text), user_question: message },
      confidence: 0.86,
      safe_response: "Listing draftlarını yoxlayıram."
    });
  }

  if (isApproveDraftsRequest(text)) {
    return makeIntent("APPROVE_DRAFTS", language, {
      parameters: { ...parameters, draft_status: "draft", user_question: message },
      confidence: 0.86,
      safe_response: "Draftları approve edəcəm, eBay publish etməyəcəm."
    });
  }

  if (isReviseDraftHelpRequest(text)) {
    return makeIntent("REVISE_DRAFT_HELP", language, {
      parameters: { ...parameters, user_question: message },
      confidence: 0.82,
      safe_response: "Draft revision üçün hansı sahələri dəyişə biləcəyini izah edirəm."
    });
  }

  if (/(sandbox|test|draft|listing|list|publish|yerlesdir|yerləşdir|qoy|ebay)/.test(text) && /(publish|list|yerlesdir|yerləşdir|qoy|yayınla)/.test(text)) {
    return makeIntent("PUBLISH_SAFE_DRAFTS_SANDBOX", language, {
      parameters: { ...parameters, publish_mode: "sandbox_only" },
      confidence: 0.82,
      safe_response: `${quantity ?? 5} safe draft sandbox eBay-də publish ediləcək. Production publishing bağlıdır.`
    });
  }

  if (isApprovedDraftRequest(text)) {
    return makeIntent("CREATE_LISTING_DRAFTS", language, {
      parameters: { ...parameters, draft_source: "approved_products" },
      confidence: 0.88,
      safe_response: "Approved məhsullardan listing draftları yaradacam."
    });
  }

  if (isCreateDraftRequest(text)) {
    return makeIntent("CREATE_LISTING_DRAFTS", language, {
      parameters: { ...parameters, draft_source: "latest_products" },
      confidence: 0.8,
      safe_response: "Safe məhsullardan listing draftları yaradacam."
    });
  }

  if (/analy[sz]e|analiz/.test(text)) {
    return makeIntent("ANALYZE_PRODUCTS", language, {
      parameters,
      confidence: 0.78,
      safe_response: `${quantity ?? "mövcud"} məhsulu profit və risk qaydaları ilə analiz edəcəm.`
    });
  }

  if (/find|tap|bul|axtar/.test(text)) {
    return makeIntent("FIND_PRODUCTS", language, {
      parameters,
      confidence: 0.78,
      safe_response: `${quantity ?? "Uyğun"} məhsul axtarıram. Riskli məhsullar list olunmayacaq.`
    });
  }

  return makeIntent("UNKNOWN", language, {
    confidence: 0.25,
    should_execute: false,
    clarifying_question: "Automation, məhsul analizi, draft, report və ya safety qaydaları ilə bağlı nə etməyimi istəyirsən?",
    safe_response: "Tam başa düşmədim. Automation, məhsul analizi, draft, report və ya safety qaydaları haqqında yaza bilərsən.",
    parameters: { ...parameters, user_question: message }
  });
}

export function parseDeterministicControlIntent(
  message: string,
  settings?: Partial<AutomationSettings>
): TelegramIntent | null {
  const text = normalizeCommandText(message);
  const language = detectLanguage(text);

  if (matchesAny(text, pauseAutomationPhrases) || /\b(dayandir|dayandır|durdur|pause|stop|off)\b/.test(text) && /(automation|avtomat|sistem|bot)/.test(text)) {
    return makeIntent("PAUSE_AUTOMATION", language, {
      confidence: 0.98,
      safe_response: "Automation dayandırıldı. Mən artıq auto-listing etməyəcəm."
    });
  }

  if (matchesAny(text, resumeAutomationPhrases) || /\b(ise sal|işə sal|aktivlesdir|aktivləşdir|enable|resume|start)\b/.test(text) && /(automation|avtomat|sistem|bot)/.test(text)) {
    return makeIntent("RESUME_AUTOMATION", language, {
      confidence: 0.98,
      safe_response: "Automation aktiv edildi. Saved rules əsasında işləyəcək."
    });
  }

  if (matchesAny(text, showStatusPhrases) || /(sistem|bot).*(isleyir|işləyir|calisir|çalışır|running)/.test(text)) {
    return makeIntent("SHOW_STATUS", language, {
      confidence: 0.96,
      safe_response: "Statusu yoxlayıram."
    });
  }

  if (/daily limit|gundelik limit|gündəlik limit|gunluk limit|günlük limit/.test(text)) {
    const quantity = extractQuantity(text);

    if (quantity) {
      return makeIntent("CHANGE_DAILY_LIMIT", language, {
        parameters: { quantity },
        confidence: 0.88,
        needs_confirmation: quantity > 25 || Boolean(settings?.newAccountSafeMode),
        safe_response: `Daily listing limit ${quantity} olacaq.`
      });
    }
  }

  const minProfit = extractMinProfit(text);
  if (minProfit !== undefined && /(profit|qazanc|dollar|\$|usd)/.test(text)) {
    return makeIntent("CHANGE_MIN_PROFIT", language, {
      parameters: { min_profit_amount: minProfit },
      confidence: 0.92,
      safe_response: `Minimum profit ${minProfit} dollar olaraq yeniləndi.`
    });
  }

  const riskTolerance = extractRiskTolerance(text);
  if (riskTolerance !== undefined && /(risk|tolerance|seviyye|səviyyə|seviyyesini|səviyyəsini)/.test(text)) {
    return makeIntent("CHANGE_RISK_TOLERANCE", language, {
      parameters: { risk_tolerance: riskTolerance },
      confidence: 0.92,
      safe_response: `Risk tolerance ${riskTolerance} olaraq yeniləndi.`
    });
  }

  if (isTestModeRequest(text)) {
    return makeIntent("ENABLE_TEST_MODE", language, {
      confidence: 0.94,
      safe_response: "Test mode aktiv edildi: min profit $0.5, margin 5%, risk tolerance 40, max shipping 10 days."
    });
  }

  if (/(category|categoryleri|categoryləri|kateqoriya|kateqoriyalari|kateqoriyaları).*(tap|find|duzelt|düzəlt|resolve)|(missing category|missing categoryleri|missing categoryləri)/.test(text)) {
    return makeIntent("RESOLVE_CATEGORIES", language, {
      parameters: { quantity: extractQuantity(text) ?? null, user_question: message },
      confidence: 0.9,
      safe_response: "Missing eBay categoryləri resolve edirəm."
    });
  }

  if (/(item specific|item specifics|specifics|aspect|aspects).*(hazirla|hazırla|generate|duzelt|düzəlt|tap)/.test(text)) {
    return makeIntent("GENERATE_ITEM_SPECIFICS", language, {
      parameters: { quantity: extractQuantity(text) ?? null, user_question: message },
      confidence: 0.9,
      safe_response: "Required item specifics hazırlanır."
    });
  }

  if (isShowListingDraftsRequest(text)) {
    return makeIntent("SHOW_LISTING_DRAFTS", language, {
      parameters: {
        quantity: extractQuantity(text) ?? null,
        draft_status: extractDraftStatus(text),
        user_question: message
      },
      confidence: 0.92,
      safe_response: "Listing draftlarını yoxlayıram."
    });
  }

  if (isApproveDraftsRequest(text)) {
    return makeIntent("APPROVE_DRAFTS", language, {
      parameters: {
        quantity: extractQuantity(text) ?? null,
        draft_status: "draft",
        user_question: message
      },
      confidence: 0.9,
      safe_response: "Draftları approve edəcəm, eBay publish etməyəcəm."
    });
  }

  if (isReviseDraftHelpRequest(text)) {
    return makeIntent("REVISE_DRAFT_HELP", language, {
      parameters: { user_question: message },
      confidence: 0.88,
      safe_response: "Draft revision üçün kömək göstərəcəm."
    });
  }

  if (isApprovedDraftRequest(text)) {
    return makeIntent("CREATE_LISTING_DRAFTS", language, {
      parameters: { quantity: extractQuantity(text) ?? null, draft_source: "approved_products", user_question: message },
      confidence: 0.9,
      safe_response: "Approved məhsullardan listing draftları yaradacam."
    });
  }

  if (isCreateDraftRequest(text)) {
    return makeIntent("CREATE_LISTING_DRAFTS", language, {
      parameters: { quantity: extractQuantity(text) ?? null, draft_source: "latest_products", user_question: message },
      confidence: 0.88,
      safe_response: "Safe məhsullardan listing draftları yaradacam."
    });
  }

  return null;
}

export const telegramIntentExamples: Array<{ message: string; expectedIntent: TelegramIntent["intent"] }> = [
  { message: "automationu aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "qaqa automationu aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "botu işə sal", expectedIntent: "RESUME_AUTOMATION" },
  { message: "automation aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "avtomatlaşdırmanı aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "sistemi aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "botu aktiv et", expectedIntent: "RESUME_AUTOMATION" },
  { message: "davam etdir", expectedIntent: "RESUME_AUTOMATION" },
  { message: "automationu davam etdir", expectedIntent: "RESUME_AUTOMATION" },
  { message: "yenidən başlat", expectedIntent: "RESUME_AUTOMATION" },
  { message: "resume automation", expectedIntent: "RESUME_AUTOMATION" },
  { message: "enable automation", expectedIntent: "RESUME_AUTOMATION" },
  { message: "turn on automation", expectedIntent: "RESUME_AUTOMATION" },
  { message: "start automation", expectedIntent: "RESUME_AUTOMATION" },
  { message: "automationu dayandır", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "indi sistemi dayandır, mən sonra davam etdirəcəm", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "automation dayandır", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "avtomatlaşdırmanı dayandır", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "sistemi dayandır", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "botu dayandır", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "pause automation", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "stop automation", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "turn off automation", expectedIntent: "PAUSE_AUTOMATION" },
  { message: "status", expectedIntent: "SHOW_STATUS" },
  { message: "vəziyyət", expectedIntent: "SHOW_STATUS" },
  { message: "bugünkü statusu göstər", expectedIntent: "SHOW_STATUS" },
  { message: "sistem işləyir?", expectedIntent: "SHOW_STATUS" },
  { message: "bot işləyir?", expectedIntent: "SHOW_STATUS" },
  { message: "show status", expectedIntent: "SHOW_STATUS" },
  { message: "minimum profit 0.5 dollar olsun", expectedIntent: "CHANGE_MIN_PROFIT" },
  { message: "risk tolerance 40 olsun", expectedIntent: "CHANGE_RISK_TOLERANCE" },
  { message: "test mode aktiv et", expectedIntent: "ENABLE_TEST_MODE" },
  { message: "3 məhsul analiz et və draft yarat", expectedIntent: "CREATE_LISTING_DRAFTS" },
  { message: "son 3 approved məhsuldan listing draft yarat", expectedIntent: "CREATE_LISTING_DRAFTS" },
  { message: "create drafts from approved products", expectedIntent: "CREATE_LISTING_DRAFTS" },
  { message: "draftlarımı göstər", expectedIntent: "SHOW_LISTING_DRAFTS" },
  { message: "listing draftlarım var?", expectedIntent: "SHOW_LISTING_DRAFTS" },
  { message: "approved draftları göstər", expectedIntent: "SHOW_LISTING_DRAFTS" },
  { message: "safe draftları approve et", expectedIntent: "APPROVE_DRAFTS" },
  { message: "docs fulfillment test elə", expectedIntent: "RUN_FULFILLMENT_DOCS_TEST" },
  { message: "categoryləri tap", expectedIntent: "RESOLVE_CATEGORIES" },
  { message: "missing categoryləri düzəlt", expectedIntent: "RESOLVE_CATEGORIES" },
  { message: "item specifics hazırla", expectedIntent: "GENERATE_ITEM_SPECIFICS" },
  { message: "10 dənə məhsul tap bu supplierdan və 20 faiz profitlə listing hazırla", expectedIntent: "CREATE_LISTING_DRAFTS" }
];

export function runTelegramIntentExamples() {
  return telegramIntentExamples.map((example) => {
    const parsed = parseTelegramIntentHeuristically(example.message);
    return {
      ...example,
      actualIntent: parsed.intent,
      passed: parsed.intent === example.expectedIntent
    };
  });
}

export function createTelegramIntent(
  intent: TelegramIntentName,
  partial: TelegramIntentPartial = {}
): TelegramIntent {
  return makeIntent(intent, partial.language ?? "en", partial);
}

function normalizeIntent(payload: z.infer<typeof TelegramIntentPayloadSchema>, parser: TelegramParserMode): TelegramIntent {
  const normalized = TelegramIntentSchema.parse({
    ...payload,
    parameters: normalizeParameters(payload.parameters),
    parser
  });

  if (normalized.confidence < 0.65 && normalized.intent !== "ASK_CLARIFICATION" && normalized.intent !== "UNKNOWN") {
    return makeIntent("ASK_CLARIFICATION", normalized.language, {
      confidence: normalized.confidence,
      parser,
      should_execute: false,
      needs_confirmation: true,
      parameters: {
        ...normalized.parameters,
        user_question: normalized.parameters.user_question ?? "Low-confidence Telegram message"
      },
      clarifying_question:
        normalized.clarifying_question ??
        "Tam əmin olmadım. Automation, məhsul analizi, draft publish, report və ya safety qaydasından hansını etməyimi istəyirsən?",
      safe_response:
        normalized.safe_response ||
        "Tam əmin olmadım. Zəhmət olmasa istədiyin automation action-ı bir az dəqiqləşdir."
    });
  }

  if (normalized.intent === "PUBLISH_SAFE_DRAFTS_SANDBOX") {
    return {
      ...normalized,
      parameters: {
        ...normalized.parameters,
        publish_mode: "sandbox_only"
      },
      should_execute: normalized.should_execute && !normalized.needs_confirmation,
      safe_response:
        normalized.safe_response ||
        "Safe draftlar yalnız sandbox eBay-də publish ediləcək. Production publishing bağlıdır."
    };
  }

  if (normalized.intent === "ASK_CLARIFICATION" || normalized.intent === "UNKNOWN") {
    return {
      ...normalized,
      should_execute: false
    };
  }

  return normalized;
}

function makeIntent(
  intent: TelegramIntent["intent"],
  language: TelegramIntent["language"],
  partial: TelegramIntentPartial = {}
): TelegramIntent {
  const payload = TelegramIntentSchema.parse({
    intent,
    language,
    confidence: partial.confidence ?? 0.5,
    parameters: normalizeParameters(partial.parameters),
    should_execute: partial.should_execute ?? (intent !== "UNKNOWN" && intent !== "ASK_CLARIFICATION"),
    needs_confirmation: partial.needs_confirmation ?? false,
    clarifying_question: partial.clarifying_question ?? null,
    safe_response: partial.safe_response ?? "",
    parser: partial.parser ?? (intent === "UNKNOWN" ? "heuristic" : "deterministic"),
    parser_warning: partial.parser_warning
  });

  return normalizeIntent(payload, payload.parser ?? "heuristic");
}

type TelegramIntentPartial = Partial<Omit<TelegramIntent, "intent" | "parameters">> & {
  parameters?: Partial<TelegramIntent["parameters"]> | Record<string, unknown>;
};

function normalizeParameters(parameters?: Partial<TelegramIntent["parameters"]> | Record<string, unknown>) {
  const raw = (parameters ?? {}) as Record<string, unknown>;

  return TelegramIntentParametersSchema.parse({
    quantity: raw.quantity ?? raw.daily_listing_limit ?? null,
    min_margin_percentage: raw.min_margin_percentage ?? raw.margin ?? null,
    min_profit_amount: raw.min_profit_amount ?? null,
    risk_tolerance: raw.risk_tolerance ?? null,
    category: raw.category ?? null,
    blocked_category: raw.blocked_category ?? raw.category_to_block ?? null,
    blocked_brand: raw.blocked_brand ?? raw.brand ?? null,
    approval_mode: raw.approval_mode ?? null,
    timeframe: raw.timeframe ?? null,
    publish_mode: raw.publish_mode ?? null,
    draft_source: raw.draft_source ?? null,
    draft_status: raw.draft_status ?? raw.status ?? null,
    user_question: raw.user_question ?? null
  });
}

function defaultIntentParameters(): z.infer<typeof TelegramIntentParametersSchema> {
  return {
    quantity: null,
    min_margin_percentage: null,
    min_profit_amount: null,
    risk_tolerance: null,
    category: null,
    blocked_category: null,
    blocked_brand: null,
    approval_mode: null,
    timeframe: null,
    publish_mode: null,
    draft_source: null,
    draft_status: null,
    user_question: null
  };
}

function coerceDraftIntentForMessage(intent: TelegramIntent, message: string) {
  const text = normalizeCommandText(message);

  if (!isCreateDraftRequest(text) && !isApprovedDraftRequest(text)) {
    return intent;
  }

  const draftSource = isApprovedDraftRequest(text) ? "approved_products" : "latest_products";

  return TelegramIntentSchema.parse({
    ...intent,
    intent: "CREATE_LISTING_DRAFTS",
    confidence: Math.max(intent.confidence, 0.82),
    should_execute: true,
    needs_confirmation: false,
    parameters: {
      ...intent.parameters,
      draft_source: intent.parameters.draft_source ?? draftSource,
      quantity: intent.parameters.quantity ?? extractQuantity(text) ?? null,
      min_margin_percentage: intent.parameters.min_margin_percentage ?? extractMargin(text) ?? null,
      user_question: intent.parameters.user_question ?? message
    },
    safe_response: intent.safe_response || "Safe məhsullardan listing draftları yaradacam."
  });
}

function extractQuantity(text: string) {
  const match = text.match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : undefined;
}

function extractMargin(text: string) {
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*(%|faiz|percent)/);
  return match ? Number(match[1]) : undefined;
}

function extractMinProfit(text: string) {
  const match = text.match(/(?:minimum|min|ən az|en az)?\s*(?:profit|qazanc|net profit|minimum profit|min profit).*?(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollar|usd|\$)?/);
  const reversed = text.match(/(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollar|usd|\$).*(?:profit|qazanc)/);
  const value = match?.[1] ?? reversed?.[1];
  const parsed = value ? Number(value) : undefined;

  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractRiskTolerance(text: string) {
  const match = text.match(/(?:risk(?:\s+tolerance)?|risk\s*(?:seviyyesini|səviyyəsini|seviyye|səviyyə)).*?(\d{1,3})/);
  const parsed = match?.[1] ? Number(match[1]) : undefined;

  if (parsed === undefined || !Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, parsed));
}

function detectLanguage(text: string): TelegramIntent["language"] {
  const hasAz =
    /[əğıöşüç]/.test(text) ||
    /\b(qaqa|bugun|bugün|mehsul|məhsul|yerlesdir|yerləşdir|goster|göstər|aktiv et|dayandir|dayandır|isleyir|işləyir|sistemi|botu|davam etdir|yeniden|yenidən|faiz|qoy)\b/.test(text);
  const hasTr = /\b(urun|ürün|listele|goster|göster|durdur|çalışıyor|calisiyor|bugün|gunluk|günlük)\b/.test(text);
  const hasEnglish = /\b(automation|status|report|find|publish|draft|safe|supplier|explain|daily|limit|margin|profit|risk|tolerance|test)\b/.test(text);

  if ((hasAz || hasTr) && hasEnglish) {
    return "mixed";
  }

  if (hasAz) {
    return "az";
  }

  if (hasTr) {
    return "tr";
  }

  return "en";
}

const resumeAutomationPhrases = [
  "automationu aktiv et",
  "automation aktiv et",
  "avtomatlasdirmani aktiv et",
  "avtomatlasdırmanı aktiv et",
  "avtomatlaşdırmanı aktiv et",
  "sistemi aktiv et",
  "botu aktiv et",
  "botu ise sal",
  "botu işə sal",
  "davam etdir",
  "automationu davam etdir",
  "yeniden baslat",
  "yenidən başlat",
  "resume automation",
  "enable automation",
  "turn on automation",
  "start automation"
];

const pauseAutomationPhrases = [
  "automationu dayandir",
  "automationu dayandır",
  "automation dayandir",
  "automation dayandır",
  "avtomatlasdirmani dayandir",
  "avtomatlasdırmanı dayandır",
  "avtomatlaşdırmanı dayandır",
  "sistemi dayandir",
  "sistemi dayandır",
  "botu dayandir",
  "botu dayandır",
  "pause automation",
  "stop automation",
  "turn off automation"
];

const showStatusPhrases = [
  "status",
  "veziyyet",
  "vəziyyət",
  "bugunku statusu goster",
  "bugünkü statusu göstər",
  "sistem isleyir",
  "sistem işləyir",
  "bot isleyir",
  "bot işləyir",
  "show status"
];

function normalizeCommandText(message: string) {
  return message
    .toLowerCase()
    .trim()
    .replace(/[?!.,;:]+/g, "")
    .replace(/\s+/g, " ");
}

function matchesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text === normalizeCommandText(phrase) || text.includes(normalizeCommandText(phrase)));
}

function isProductionPublishRequest(text: string) {
  return /(production|real ebay|real hesab|canli ebay|canlı ebay|live ebay)/.test(text) && /(publish|list|yerlesdir|yerləşdir|qoy|listele)/.test(text);
}

function isUnsafeDropshippingRequest(text: string) {
  return /(amazon|walmart|aliexpress|temu|etsy).*(ebay|dropship|dropshipping)|marketplace[-\s]?to[-\s]?marketplace/.test(text);
}

function isTestModeRequest(text: string) {
  return /(test mode|test qayda|qaydalari test|qaydaları test|test ucun|test üçün|yumşalt|yumsalt)/.test(text) &&
    /(aktiv|enable|et|ele|elə|yumsalt|yumşalt|mode|qayda)/.test(text);
}

function isApprovedDraftRequest(text: string) {
  return /(approved|təsdiq|tesdiq|uygun|uyğun)/.test(text) && isCreateDraftRequest(text);
}

function isShowListingDraftsRequest(text: string) {
  return /(draft|draftlar|draftlari|draftları|listing draft|qaralama|taslak)/.test(text) &&
    /(goster|göstər|show|var|list|siyahi|siyahı|hansi|hansı)/.test(text);
}

function isEbayReadinessRequest(text: string) {
  return /(ebay|sandbox).*(status|connection|connected|readiness|ready|hazir|hazır|veziyyet|vəziyyət)|draft.*(publish.*hazir|publish.*hazır|ready)/.test(text);
}

function isEbayPolicySyncRequest(text: string) {
  return /(seller polic|business polic|payment polic|return polic|fulfillment polic|policy|policies).*(sync|sinx|yenile|yenilə|et)/.test(text);
}

function isCreateDefaultEbayPoliciesRequest(text: string) {
  return /(seller polic|business polic|payment polic|return polic|fulfillment polic|policy|policies).*(yarat|create|default|qur)/.test(text);
}

function isEbayLocationSetupRequest(text: string) {
  return /(inventory location|location|warehouse|anbar).*(qur|setup|yarat|create|check|hazirla|hazırla)/.test(text);
}

function isApproveDraftsRequest(text: string) {
  return /(draft|draftlar|draftlari|draftları|listing draft|qaralama|taslak)/.test(text) &&
    /(approve|approved et|tesdiq|təsdiq|qebul|qəbul)/.test(text);
}

function isReviseDraftHelpRequest(text: string) {
  return /(draft|draftlar|draftlari|draftları|listing draft|qaralama|taslak)/.test(text) &&
    /(revise|revision|duzelt|düzəlt|edit|deyis|dəyiş|redakte|nece|necə|help|kom[eə]k)/.test(text);
}

function extractDraftStatus(text: string) {
  if (/(approved|tesdiq|təsdiq)/.test(text)) {
    return "approved" as const;
  }

  if (/(published|publish olun|list olun|yayınlan)/.test(text)) {
    return "published" as const;
  }

  if (/(failed|fail|xeta|xəta|hata)/.test(text)) {
    return "failed" as const;
  }

  if (/\bdraft\b|qaralama|taslak/.test(text)) {
    return "draft" as const;
  }

  return null;
}

function isCreateDraftRequest(text: string) {
  return /(draft|listing|listing draft|qaralama|taslak)/.test(text) &&
    /(create|yarat|olustur|oluştur|hazirla|hazırla|analyz|analyse|analyze|analiz)/.test(text);
}

function extractBlockedCategory(message: string) {
  const text = normalizeCommandText(message);
  const explicit = text.match(/(.+?)\s+(?:kateqoriyasini|kateqoriyasını|category|kategorisini)\s+(?:blokla|block|ban|qadağan)/);

  if (explicit?.[1]) {
    return cleanExtractedName(explicit[1]);
  }

  const category = text.match(/(?:block|blokla|qadağan et|do not list|list etme|list etmə)\s+([a-zA-ZəğıöşüçƏĞIİÖŞÜÇ\s-]{3,40})(?:\s+(?:category|kateqoriya|products|məhsul|urun|ürün))?/);

  return category?.[1] ? cleanExtractedName(category[1]) : undefined;
}

function extractBlockedBrand(message: string) {
  const match = message.match(/(?:do not|don't|block|blok|blokla|list etmə|listeleme)\s+(?:list\s+)?([A-Z][A-Za-z0-9&.\-\s]{1,40})(?:\s+(?:anymore|artıq|artik|products|məhsul|urun|ürün))?/);
  const brand = match?.[1]?.trim();

  if (!brand || /electronics|elektron|category|products|məhsul|urun|ürün/i.test(brand)) {
    return undefined;
  }

  return brand;
}

function cleanExtractedName(value: string) {
  return value
    .replace(/\b(electronicsi|category|kateqoriya|kategorisini|products|mehsul|məhsul|urun|ürün|blokla|block)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

import { z } from "zod";
import { getConfiguredAiProvider } from "@/lib/ai";
import { telegramIntentSystemPrompt } from "@/lib/ai/prompts/telegram-intent";
import type { AutomationSettings } from "@/lib/types";

export const TelegramIntentSchema = z.object({
  intent: z.enum([
    "START_AUTOMATION",
    "PAUSE_AUTOMATION",
    "RESUME_AUTOMATION",
    "CHANGE_DAILY_LIMIT",
    "CHANGE_PROFIT_RULE",
    "FIND_PRODUCTS",
    "ANALYZE_PRODUCTS",
    "LIST_PRODUCTS",
    "FIND_AND_LIST_PRODUCTS",
    "APPROVE_DRAFTS",
    "REJECT_DRAFTS",
    "SHOW_STATUS",
    "SHOW_REPORT",
    "SHOW_FAILED_TASKS",
    "UPDATE_BLOCKED_CATEGORY",
    "UPDATE_BLOCKED_BRAND",
    "CHANGE_APPROVAL_MODE",
    "CONNECT_HELP",
    "UNKNOWN"
  ]),
  language: z.enum(["az", "tr", "en", "unknown"]).default("unknown"),
  confidence: z.number().min(0).max(1).default(0.4),
  parameters: z.record(z.unknown()).default({}),
  requiresConfirmation: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  safetyNotes: z.array(z.string()).default([])
});

export type TelegramIntent = z.infer<typeof TelegramIntentSchema>;

export async function parseTelegramIntent({
  message,
  settings
}: {
  message: string;
  settings?: Partial<AutomationSettings>;
}): Promise<TelegramIntent> {
  const provider = getConfiguredAiProvider();

  if (!provider) {
    return parseTelegramIntentHeuristically(message, settings);
  }

  try {
    const parsed = await provider.generateJson<TelegramIntent>({
      temperature: 0,
      messages: [
        { role: "system", content: telegramIntentSystemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            message,
            savedSettings: settings,
            allowedIntents: TelegramIntentSchema.shape.intent.options
          })
        }
      ]
    });

    return TelegramIntentSchema.parse(parsed);
  } catch {
    return parseTelegramIntentHeuristically(message, settings);
  }
}

export function parseTelegramIntentHeuristically(
  message: string,
  settings?: Partial<AutomationSettings>
): TelegramIntent {
  const text = message.toLowerCase();
  const quantity = extractQuantity(text);
  const margin = extractMargin(text);
  const language = detectLanguage(text);
  const parameters: Record<string, unknown> = {};
  const safetyNotes: string[] = [];

  if (quantity) {
    parameters.quantity = quantity;
  }

  if (margin) {
    parameters.min_margin_percentage = margin;
  }

  if (/\bus\b|amerika|united states/.test(text)) {
    parameters.shipping_country = "US";
  }

  if (/home|kitchen|decor|mətbəx|ev|mutfak/.test(text)) {
    parameters.category = "home kitchen";
  }

  if (/electron|elektron/.test(text) && /do not|don't|list etmə|etme|yazma|blok|block/.test(text)) {
    return makeIntent("UPDATE_BLOCKED_CATEGORY", language, {
      parameters: { category: "electronics", action: "block" },
      confidence: 0.82
    });
  }

  if (/pause|stop|dayandır|durdur/.test(text)) {
    return makeIntent("PAUSE_AUTOMATION", language, { confidence: 0.9 });
  }

  if (/resume|start|başla|davam|devam/.test(text) && /automation|listing|auto|avto/.test(text)) {
    return makeIntent("RESUME_AUTOMATION", language, { confidence: 0.82 });
  }

  if (/daily limit|limit|gündəlik|gunluk/.test(text) && quantity) {
    return makeIntent("CHANGE_DAILY_LIMIT", language, {
      parameters: { daily_listing_limit: quantity },
      confidence: 0.86,
      requiresConfirmation: quantity > 25 || Boolean(settings?.newAccountSafeMode)
    });
  }

  if (/full auto|tam auto|tam avto/.test(text)) {
    safetyNotes.push("Full auto mode can publish without per-item approval and should only be used after sandbox validation.");
    return makeIntent("CHANGE_APPROVAL_MODE", language, {
      parameters: { approval_mode: "full_auto" },
      confidence: 0.78,
      requiresConfirmation: true,
      safetyNotes
    });
  }

  if (/report|hesabat|rapor|status|vəziyyət|durum/.test(text)) {
    return makeIntent(/failed|fail|xəta|hata/.test(text) ? "SHOW_FAILED_TASKS" : "SHOW_REPORT", language, {
      confidence: 0.82
    });
  }

  if (/approve|təsdiq|onay/.test(text)) {
    return makeIntent("APPROVE_DRAFTS", language, { parameters, confidence: 0.75, requiresConfirmation: true });
  }

  if (/analy[sz]e|analiz/.test(text)) {
    return makeIntent("ANALYZE_PRODUCTS", language, { parameters, confidence: 0.78 });
  }

  if (/find|tap|bul/.test(text) && /(list|yerləşdir|yerlestir|yayınla|publish)/.test(text)) {
    return makeIntent("FIND_AND_LIST_PRODUCTS", language, {
      parameters,
      confidence: 0.86,
      requiresConfirmation: settings?.approvalMode !== "full_auto"
    });
  }

  if (/find|tap|bul/.test(text)) {
    return makeIntent("FIND_PRODUCTS", language, { parameters, confidence: 0.78 });
  }

  if (/list|yerləşdir|yerlestir|publish/.test(text)) {
    return makeIntent("LIST_PRODUCTS", language, {
      parameters,
      confidence: 0.78,
      requiresConfirmation: settings?.approvalMode !== "full_auto"
    });
  }

  return makeIntent("UNKNOWN", language, {
    confidence: 0.25,
    clarificationQuestion: "What would you like the eBay agent to do?"
  });
}

function makeIntent(
  intent: TelegramIntent["intent"],
  language: TelegramIntent["language"],
  partial: Partial<TelegramIntent> = {}
): TelegramIntent {
  return TelegramIntentSchema.parse({
    intent,
    language,
    confidence: partial.confidence ?? 0.5,
    parameters: partial.parameters ?? {},
    requiresConfirmation: partial.requiresConfirmation ?? false,
    clarificationQuestion: partial.clarificationQuestion,
    safetyNotes: partial.safetyNotes ?? []
  });
}

function extractQuantity(text: string) {
  const match = text.match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : undefined;
}

function extractMargin(text: string) {
  const match = text.match(/(\d{1,3})\s*(%|faiz|percent)/);
  return match ? Number(match[1]) : undefined;
}

function detectLanguage(text: string): TelegramIntent["language"] {
  if (/[əğıöşüç]/.test(text) || /\b(qaqa|bugün|məhsul|yerləşdir|göstər)\b/.test(text)) {
    return "az";
  }

  if (/\b(bugün|urun|ürün|listele|goster|göster|durdur)\b/.test(text)) {
    return "tr";
  }

  if (/[a-z]/.test(text)) {
    return "en";
  }

  return "unknown";
}

import type { TelegramIntent } from "@/lib/telegram/intent-parser";
import type { AgentTaskResult } from "@/lib/types";

export function buildIntentAcknowledgement(intent: TelegramIntent) {
  const language = intent.language === "mixed" ? "az" : intent.language;
  const quantity = typeof intent.parameters.quantity === "number" ? intent.parameters.quantity : undefined;
  const margin =
    typeof intent.parameters.min_margin_percentage === "number"
      ? intent.parameters.min_margin_percentage
      : undefined;

  if (intent.safe_response) {
    return intent.safe_response;
  }

  if (language === "az") {
    if (intent.needs_confirmation || !intent.should_execute) {
      return "Bu əməliyyat listing və ya hesab riski yarada bilər. Dəqiqləşdirsən, safety qaydaları ilə davam edəcəm.";
    }

    return `Oldu. ${quantity ? `${quantity} məhsul üçün ` : ""}qaydaları yoxlayıram${
      margin ? `, minimum margin ${margin}% olacaq` : ""
    }. Riskli məhsullar list olunmayacaq.`;
  }

  if (language === "tr") {
    if (intent.needs_confirmation || !intent.should_execute) {
      return "Bu işlem listeleme veya hesap riski oluşturabilir. Netleştirirsen güvenlik kurallarıyla devam edeceğim.";
    }

    return `Tamam. ${quantity ? `${quantity} urun icin ` : ""}kuralları kontrol ediyorum${
      margin ? `, minimum margin ${margin}% olacak` : ""
    }. Riskli urunler listelenmeyecek.`;
  }

  if (intent.needs_confirmation || !intent.should_execute) {
    return "This action can affect listing or account risk. Clarify it and I will stay inside the saved safety rules.";
  }

  return `Got it. I will apply saved rules${quantity ? ` for ${quantity} products` : ""}${
    margin ? ` with at least ${margin}% margin` : ""
  }. Risky products will not be listed.`;
}

export function buildTaskResultReply(result: AgentTaskResult, language: TelegramIntent["language"] = "en") {
  const replyLanguage = language === "mixed" ? "az" : language;

  if (replyLanguage === "az") {
    return result.ok ? `Hazırdır. ${result.message}` : result.message;
  }

  if (replyLanguage === "tr") {
    return result.ok ? `Hazır. ${result.message}` : result.message;
  }

  return result.ok ? `Done. ${result.message}` : result.message;
}

export function buildTelegramReply(intent: TelegramIntent, result: AgentTaskResult) {
  if (intent.intent === "UNKNOWN" || intent.intent === "ASK_CLARIFICATION") {
    return (
      intent.safe_response ||
      intent.clarifying_question ||
      result.message ||
      "I did not understand that yet. Please tell me what to do with automation, products, drafts, or reports."
    );
  }

  if (intent.needs_confirmation || !intent.should_execute) {
    return intent.clarifying_question || intent.safe_response || result.message;
  }

  if (
    intent.intent === "RESUME_AUTOMATION" ||
    intent.intent === "PAUSE_AUTOMATION" ||
    intent.intent === "SHOW_STATUS" ||
    intent.intent === "SHOW_DAILY_REPORT" ||
    intent.intent === "SHOW_FAILED_TASKS" ||
    intent.intent === "CHANGE_DAILY_LIMIT" ||
    intent.intent === "CHANGE_MIN_MARGIN" ||
    intent.intent === "CHANGE_MIN_PROFIT" ||
    intent.intent === "CHANGE_RISK_TOLERANCE" ||
    intent.intent === "ENABLE_TEST_MODE" ||
    intent.intent === "CREATE_LISTING_DRAFTS" ||
    intent.intent === "SHOW_LISTING_DRAFTS" ||
    intent.intent === "APPROVE_DRAFTS" ||
    intent.intent === "REVISE_DRAFT_HELP" ||
    intent.intent === "SHOW_EBAY_READINESS" ||
    intent.intent === "SYNC_EBAY_POLICIES" ||
    intent.intent === "CREATE_DEFAULT_EBAY_POLICIES" ||
    intent.intent === "SETUP_EBAY_LOCATION" ||
    intent.intent === "PUBLISH_SAFE_DRAFTS_SANDBOX" ||
    intent.intent === "UPDATE_BLOCKED_CATEGORY" ||
    intent.intent === "UPDATE_BLOCKED_BRAND" ||
    intent.intent === "CHANGE_APPROVAL_MODE" ||
    intent.intent === "EXPLAIN_SYSTEM"
  ) {
    return result.message;
  }

  if (!result.ok) {
    return buildTaskResultReply(result, intent.language);
  }

  const acknowledgement = buildIntentAcknowledgement(intent);

  if (!acknowledgement || result.message.includes(acknowledgement)) {
    return buildTaskResultReply(result, intent.language);
  }

  return `${acknowledgement}\n\n${buildTaskResultReply(result, intent.language)}`;
}

import type { TelegramIntent } from "@/lib/telegram/intent-parser";
import type { AgentTaskResult } from "@/lib/types";

export function buildIntentAcknowledgement(intent: TelegramIntent) {
  const language = intent.language === "unknown" ? "en" : intent.language;
  const quantity = typeof intent.parameters.quantity === "number" ? intent.parameters.quantity : undefined;
  const margin =
    typeof intent.parameters.min_margin_percentage === "number"
      ? intent.parameters.min_margin_percentage
      : undefined;

  if (language === "az") {
    if (intent.requiresConfirmation) {
      return "Bu əməliyyat listing və ya hesab riski yarada bilər. Təsdiqləsən, saxlanmış qaydalar və təhlükəsizlik limitləri ilə icra edəcəm.";
    }

    if (intent.intent === "SHOW_STATUS" || intent.intent === "SHOW_DAILY_REPORT" || intent.intent === "SHOW_FAILED_TASKS") {
      return "Oldu. Məlumatları yoxlayıram.";
    }

    return `Oldu. ${quantity ? `${quantity} məhsul üçün ` : ""}qaydaları yoxlayıram${
      margin ? `, minimum margin ${margin}% olacaq` : ""
    }. Riskli məhsullar list olunmayacaq.`;
  }

  if (language === "tr") {
    if (intent.intent === "SHOW_STATUS" || intent.intent === "SHOW_DAILY_REPORT" || intent.intent === "SHOW_FAILED_TASKS") {
      return "Tamam. Bilgileri kontrol ediyorum.";
    }

    return intent.requiresConfirmation
      ? "Bu işlem listeleme veya hesap riski oluşturabilir. Onaylarsan kaydedilmiş kurallarla çalıştıracağım."
      : `Tamam. ${quantity ? `${quantity} urun icin ` : ""}kuralları kontrol ediyorum${
          margin ? `, minimum margin ${margin}% olacak` : ""
        }. Riskli urunler listelenmeyecek.`;
  }

  if (intent.intent === "SHOW_STATUS" || intent.intent === "SHOW_DAILY_REPORT" || intent.intent === "SHOW_FAILED_TASKS") {
    return "Got it. I am checking the latest data.";
  }

  return intent.requiresConfirmation
    ? "This action can affect listings or account risk. Confirm and I will run it within your saved safety rules."
    : `Got it. I will apply saved rules${quantity ? ` for ${quantity} products` : ""}${
        margin ? ` with at least ${margin}% margin` : ""
      }. Risky products will not be listed.`;
}

export function buildTaskResultReply(result: AgentTaskResult, language: TelegramIntent["language"] = "en") {
  if (language === "az") {
    return result.ok ? `Hazırdır. ${result.message}` : `İcra alınmadı. ${result.message}`;
  }

  if (language === "tr") {
    return result.ok ? `Hazır. ${result.message}` : `İşlem tamamlanamadı. ${result.message}`;
  }

  return result.ok ? `Done. ${result.message}` : `I could not complete it. ${result.message}`;
}

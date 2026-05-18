import { createAgentTask, runAgentTask } from "@/lib/agent/orchestrator";
import type { TelegramIntent } from "@/lib/telegram/intent-parser";
import type { AgentTaskResult } from "@/lib/types";

export async function executeTelegramIntent({
  userId,
  intent
}: {
  userId: string;
  intent: TelegramIntent;
}): Promise<AgentTaskResult> {
  if (intent.requiresConfirmation) {
    return {
      ok: false,
      message: intent.clarificationQuestion ?? "Confirmation is required before this action can run.",
      warnings: intent.safetyNotes
    };
  }

  switch (intent.intent) {
    case "SHOW_STATUS":
    case "SHOW_DAILY_REPORT":
    case "SHOW_FAILED_TASKS":
      return {
        ok: true,
        message: "Dashboard reporting is available. Use the Telegram webhook flow for live account-scoped execution."
      };
    case "PAUSE_AUTOMATION":
    case "RESUME_AUTOMATION":
    case "CHANGE_DAILY_LIMIT":
    case "CHANGE_MIN_MARGIN":
    case "UPDATE_BLOCKED_CATEGORY":
    case "UPDATE_BLOCKED_BRAND":
    case "CHANGE_APPROVAL_MODE":
      return {
        ok: true,
        message: `${intent.intent} parsed successfully. Persisting settings updates is wired to the Phase 3 Telegram control flow.`
      };
    case "FIND_PRODUCTS":
    case "ANALYZE_PRODUCTS":
    case "CREATE_LISTING_DRAFTS":
    case "PUBLISH_SAFE_DRAFTS_SANDBOX": {
      const task = createAgentTask({
        userId,
        taskType: "telegram_requested_task",
        parameters: intent.parameters
      });
      return runAgentTask(task);
    }
    default:
      return {
        ok: false,
        message: intent.clarificationQuestion ?? "I could not understand the requested action."
      };
  }
}

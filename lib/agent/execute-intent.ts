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
    case "SHOW_DAILY_REPORT":
    case "SHOW_FAILED_TASKS":
    case "SHOW_LISTING_DRAFTS":
    case "REVISE_DRAFT_HELP":
      return {
        ok: true,
        message: "Dashboard reporting is available. Use the Telegram webhook flow for live account-scoped execution."
      };
    case "PAUSE_AUTOMATION":
    case "RESUME_AUTOMATION":
    case "CHANGE_DAILY_LIMIT":
    case "CHANGE_MIN_MARGIN":
    case "CHANGE_MIN_PROFIT":
    case "CHANGE_RISK_TOLERANCE":
    case "ENABLE_TEST_MODE":
    case "APPROVE_DRAFTS":
    case "UPDATE_BLOCKED_CATEGORY":
    case "UPDATE_BLOCKED_BRAND":
    case "CHANGE_APPROVAL_MODE":
      return {
        ok: true,
        message: `${intent.intent} parsed successfully. Persisting settings updates is wired to the Phase 3 Telegram control flow.`
      };
    case "EXPLAIN_SYSTEM":
      return {
        ok: true,
        message: "The Telegram webhook flow can explain live account status, suppliers, and recent automation logs."
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
        message:
          intent.safe_response ||
          intent.clarifying_question ||
          "I could not understand the requested action."
      };
  }
}

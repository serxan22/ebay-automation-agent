import { NextResponse } from "next/server";
import { z } from "zod";
import { logAutomationEvent } from "@/lib/automation/logging";
import {
  connectTelegramChatWithCode,
  findTelegramConnectionByChatId,
  touchTelegramConnection
} from "@/lib/telegram/connection";
import {
  createTelegramAgentTask,
  executeTelegramIntentAction,
  finishTelegramAgentTask
} from "@/lib/telegram/actions";
import { parseTelegramIntent } from "@/lib/telegram/intent-parser";
import { buildIntentAcknowledgement, buildTaskResultReply } from "@/lib/telegram/replies";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const telegramUpdateSchema = z.object({
  message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      chat: z.object({
        id: z.union([z.string(), z.number()]),
        username: z.string().optional(),
        type: z.string().optional()
      }),
      from: z
        .object({
          username: z.string().optional(),
          first_name: z.string().optional(),
          language_code: z.string().optional()
        })
        .optional()
    })
    .optional()
});

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  let supabase: SupabaseClient | null = null;
  let currentUserId: string | null = null;
  let currentTaskId: string | null = null;
  let currentChatId: string | null = null;

  if (expectedSecret && receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret." }, { status: 401 });
  }

  try {
    supabase = createSupabaseServiceClient();
    const update = telegramUpdateSchema.parse(await request.json());
    const text = update.message?.text;
    const chatId = update.message?.chat.id;
    const username = update.message?.from?.username ?? update.message?.chat.username ?? null;

    if (!text || !chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const chatIdString = String(chatId);
    currentChatId = chatIdString;
    const connectionCode = extractStartCode(text);
    const detectedLanguage = detectTelegramLanguage(text, update.message?.from?.language_code);

    if (connectionCode) {
      const connected = await connectTelegramChatWithCode({
        supabase,
        code: connectionCode,
        chatId: chatIdString,
        username,
        language: detectedLanguage
      });

      const reply = connected
        ? "Telegram connected. You can now control your eBay sandbox automation from this chat."
        : "That connection code is invalid or expired. Generate a new code from the dashboard Telegram page.";

      if (connected) {
        const intent = await parseTelegramIntent({ message: "connect telegram" });
        const taskId = await createTelegramAgentTask({
          supabase,
          userId: connected.userId,
          message: text,
          intent
        });
        await finishTelegramAgentTask({
          supabase,
          taskId,
          result: { ok: true, message: "Telegram chat connected." }
        });
      }

      if (process.env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage({ chatId: chatIdString, text: reply });
      }

      return NextResponse.json({ ok: true, connected: Boolean(connected), reply });
    }

    const connection = await findTelegramConnectionByChatId({
      supabase,
      chatId: chatIdString
    });

    if (!connection) {
      const reply =
        "This Telegram chat is not connected yet. Open /dashboard/telegram, generate a connection code, then send /start CODE here.";

      if (process.env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage({ chatId: chatIdString, text: reply });
      }

      return NextResponse.json({ ok: true, connected: false, reply });
    }

    const settings = await loadUserSettingsForParser(supabase, connection.user_id);
    const intent = await parseTelegramIntent({ message: text, settings });
    currentUserId = connection.user_id;
    const taskId = await createTelegramAgentTask({
      supabase,
      userId: connection.user_id,
      message: text,
      intent
    });
    currentTaskId = taskId;
    const acknowledgement = buildIntentAcknowledgement(intent);
    const result = await executeTelegramIntentAction({
      supabase,
      userId: connection.user_id,
      intent
    });
    const reply = `${acknowledgement}\n\n${buildTaskResultReply(result, intent.language)}`;

    await finishTelegramAgentTask({
      supabase,
      taskId,
      result
    });

    await touchTelegramConnection({
      supabase,
      chatId: chatIdString,
      language: intent.language
    });

    await logAutomationEvent({
      supabase,
      userId: connection.user_id,
      level: result.ok ? "success" : "warning",
      module: "telegram",
      message: reply,
      metadata: {
        chatId: chatIdString,
        originalMessage: text,
        intent: intent.intent,
        parameters: intent.parameters,
        taskId
      }
    });

    if (process.env.TELEGRAM_BOT_TOKEN) {
      await sendTelegramMessage({ chatId: chatIdString, text: reply });
    }

    return NextResponse.json({ ok: true, intent, result, reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram webhook failed.";

    if (supabase && currentUserId) {
      if (currentTaskId) {
        await finishTelegramAgentTask({
          supabase,
          taskId: currentTaskId,
          result: { ok: false, message }
        }).catch(() => undefined);
      }

      await logAutomationEvent({
        supabase,
        userId: currentUserId,
        level: "error",
        module: "telegram",
        message,
        metadata: { chatId: currentChatId }
      }).catch(() => undefined);
    }

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

function extractStartCode(text: string) {
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{6,32})$/i);
  return match?.[1];
}

function detectTelegramLanguage(text: string, telegramLanguage?: string | null) {
  if (/[əğıöşüç]/i.test(text) || /\b(qaqa|bugün|məhsul|göstər|dayandır)\b/i.test(text)) {
    return "az" as const;
  }

  if (telegramLanguage?.startsWith("tr")) {
    return "tr" as const;
  }

  if (telegramLanguage?.startsWith("az")) {
    return "az" as const;
  }

  return "en" as const;
}

async function loadUserSettingsForParser(supabase: ReturnType<typeof createSupabaseServiceClient>, userId: string) {
  const { data } = await supabase
    .from("automation_settings")
    .select("approval_mode,new_account_safe_mode")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return undefined;
  }

  return {
    approvalMode: data.approval_mode,
    newAccountSafeMode: data.new_account_safe_mode
  };
}

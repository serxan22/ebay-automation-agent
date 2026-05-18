import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAutomationEvent } from "@/lib/automation/logging";
import { getTelegramBotMe } from "@/lib/telegram/bot";
import type { TelegramIntent } from "@/lib/telegram/intent-parser";

export interface TelegramConnectionRecord {
  id: string;
  user_id: string;
  telegram_chat_id: string;
  telegram_username?: string | null;
  preferred_language: TelegramIntent["language"];
  last_message_at?: string | null;
  status: string;
}

export function hashTelegramConnectionCode(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function createTelegramConnectionCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function createTelegramConnectionToken({
  supabase,
  userId
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const code = createTelegramConnectionCode();
  const codeHash = hashTelegramConnectionCode(code);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const bot = await getTelegramBotMe();

  const { error } = await supabase.from("telegram_connection_tokens").insert({
    user_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(error.message);
  }

  await logAutomationEvent({
    supabase,
    userId,
    level: "info",
    module: "telegram",
    message: "Telegram connection code created.",
    metadata: { expiresAt }
  });

  return {
    code,
    expiresAt,
    botUsername: bot?.username ?? null,
    deepLink: bot?.username ? `https://t.me/${bot.username}?start=${code}` : null
  };
}

export async function connectTelegramChatWithCode({
  supabase,
  code,
  chatId,
  username,
  language
}: {
  supabase: SupabaseClient;
  code: string;
  chatId: string;
  username?: string | null;
  language: TelegramIntent["language"];
}) {
  const codeHash = hashTelegramConnectionCode(code);
  const now = new Date().toISOString();
  const { data: token, error } = await supabase
    .from("telegram_connection_tokens")
    .select("id,user_id,expires_at,used_at")
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!token) {
    return null;
  }

  const userId = token.user_id as string;

  const { error: upsertError } = await supabase.from("telegram_connections").upsert(
    {
      user_id: userId,
      telegram_chat_id: chatId,
      telegram_username: username,
      preferred_language: language === "unknown" ? "en" : language,
      last_message_at: now,
      status: "active"
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  await supabase
    .from("telegram_connection_tokens")
    .update({
      used_at: now,
      telegram_chat_id: chatId,
      telegram_username: username
    })
    .eq("id", token.id);

  await logAutomationEvent({
    supabase,
    userId,
    level: "success",
    module: "telegram",
    message: "Telegram chat connected.",
    metadata: { chatId, username }
  });

  return { userId };
}

export async function findTelegramConnectionByChatId({
  supabase,
  chatId
}: {
  supabase: SupabaseClient;
  chatId: string;
}) {
  const { data, error } = await supabase
    .from("telegram_connections")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TelegramConnectionRecord | null;
}

export async function touchTelegramConnection({
  supabase,
  chatId,
  language
}: {
  supabase: SupabaseClient;
  chatId: string;
  language: TelegramIntent["language"];
}) {
  await supabase
    .from("telegram_connections")
    .update({
      last_message_at: new Date().toISOString(),
      preferred_language: language === "unknown" ? "en" : language
    })
    .eq("telegram_chat_id", chatId);
}

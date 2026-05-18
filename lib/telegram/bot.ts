export interface TelegramSendMessageInput {
  chatId: string;
  text: string;
}

export async function sendTelegramMessage({ chatId, text }: TelegramSendMessageInput) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${await response.text()}`);
  }

  return response.json() as Promise<{ ok: boolean; result: unknown }>;
}

export async function getTelegramBotMe() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Telegram getMe failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    ok: boolean;
    result?: { id: number; is_bot: boolean; first_name: string; username?: string };
  };

  return payload.result ?? null;
}

export async function setTelegramWebhook(url: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"]
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram setWebhook failed: ${await response.text()}`);
  }

  return response.json() as Promise<{ ok: boolean; result: boolean; description?: string }>;
}

export async function getTelegramWebhookInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Telegram getWebhookInfo failed: ${await response.text()}`);
  }

  return response.json() as Promise<{
    ok: boolean;
    result?: {
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
      last_error_message?: string;
    };
  }>;
}

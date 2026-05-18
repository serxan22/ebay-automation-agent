"use client";

import { useState } from "react";
import { Link2, PlugZap, RefreshCcw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function TelegramConnectionPanel({
  connected,
  chatId,
  username
}: {
  connected: boolean;
  chatId?: string | null;
  username?: string | null;
}) {
  const [message, setMessage] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<"code" | "webhook" | "disconnect" | null>(null);

  async function generateCode() {
    setBusy("code");
    setMessage("");
    const response = await fetch("/api/telegram/connect-token", { method: "POST" });
    const payload = (await response.json()) as {
      ok?: boolean;
      code?: string;
      deepLink?: string | null;
      expiresAt?: string;
      error?: string;
    };
    setBusy(null);

    if (!payload.ok || !payload.code) {
      setMessage(payload.error ?? "Could not create Telegram connection code.");
      return;
    }

    setCode(payload.code);
    setDeepLink(payload.deepLink ?? null);
    setMessage(`Send /start ${payload.code} to the bot. Code expires at ${payload.expiresAt}.`);
  }

  async function setupWebhook() {
    setBusy("webhook");
    setMessage("");
    const response = await fetch("/api/telegram/webhook/setup", { method: "POST" });
    const payload = (await response.json()) as { ok?: boolean; webhookUrl?: string; error?: string };
    setBusy(null);
    setMessage(payload.ok ? `Webhook set: ${payload.webhookUrl}` : payload.error ?? "Webhook setup failed.");
  }

  async function disconnect() {
    setBusy("disconnect");
    setMessage("");
    const response = await fetch("/api/telegram/disconnect", { method: "POST" });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    setMessage(payload.ok ? "Telegram disconnected." : payload.error ?? "Disconnect failed.");
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink-950 dark:text-white">Connect Telegram</h3>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Bind one Telegram chat to your account, then use normal language to control safe automation.
          </p>
        </div>
        <div className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700 dark:bg-white/[0.04] dark:text-ink-200">
          {connected ? `Connected${username ? `: @${username}` : ""}` : "Not connected"}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={generateCode} disabled={busy !== null}>
          <Link2 size={16} /> {busy === "code" ? "Generating..." : "Generate link code"}
        </Button>
        <Button variant="secondary" onClick={setupWebhook} disabled={busy !== null}>
          <PlugZap size={16} /> {busy === "webhook" ? "Setting..." : "Set webhook"}
        </Button>
        <Button variant="ghost" onClick={disconnect} disabled={!connected || busy !== null}>
          <Unplug size={16} /> Disconnect
        </Button>
      </div>

      {code ? (
        <div className="mt-5 rounded-lg border border-mint-200 bg-mint-50 p-4 text-sm text-mint-950 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100">
          <p className="font-semibold">/start {code}</p>
          {deepLink ? (
            <a href={deepLink} className="mt-2 inline-flex items-center gap-2 font-medium text-mint-700 dark:text-mint-300">
              <RefreshCcw size={14} /> Open Telegram bot
            </a>
          ) : (
            <p className="mt-2">Set TELEGRAM_BOT_TOKEN to generate a clickable bot link.</p>
          )}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200">
          {message}
        </div>
      ) : null}

      {chatId ? <p className="mt-4 text-xs text-ink-500 dark:text-ink-400">Chat ID: {chatId}</p> : null}
    </section>
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { executeTelegramIntent } from "@/lib/agent/execute-intent";
import { parseTelegramIntent } from "@/lib/telegram/intent-parser";
import { buildIntentAcknowledgement, buildTaskResultReply } from "@/lib/telegram/replies";
import { sendTelegramMessage } from "@/lib/telegram/bot";

const telegramUpdateSchema = z.object({
  message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      chat: z.object({
        id: z.union([z.string(), z.number()]),
        username: z.string().optional()
      }),
      from: z
        .object({
          username: z.string().optional(),
          language_code: z.string().optional()
        })
        .optional()
    })
    .optional()
});

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (expectedSecret && receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret." }, { status: 401 });
  }

  try {
    const update = telegramUpdateSchema.parse(await request.json());
    const text = update.message?.text;
    const chatId = update.message?.chat.id;

    if (!text || !chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const intent = await parseTelegramIntent({ message: text });
    const acknowledgement = buildIntentAcknowledgement(intent);
    const result = await executeTelegramIntent({
      userId: `telegram:${chatId}`,
      intent
    });
    const reply = `${acknowledgement}\n\n${buildTaskResultReply(result, intent.language)}`;

    if (process.env.TELEGRAM_BOT_TOKEN) {
      await sendTelegramMessage({ chatId: String(chatId), text: reply });
    }

    return NextResponse.json({ ok: true, intent, result, reply });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Telegram webhook failed." },
      { status: 400 }
    );
  }
}

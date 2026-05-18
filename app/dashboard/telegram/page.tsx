import { Bot, CheckCircle2, MessageSquareText } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TelegramConnectionPanel } from "@/components/telegram/TelegramConnectionPanel";
import { TelegramMessagePreview } from "@/components/telegram/TelegramMessagePreview";
import { getTelegramBotMe } from "@/lib/telegram/bot";
import { getTelegramAiParserStatus } from "@/lib/telegram/intent-parser";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const samples = [
  "qaqa automationu aktiv et",
  "bugün 10 dənə yaxşı məhsul tap, riskli şeyləri list eləmə",
  "minimum profit 20 faiz olsun",
  "safe olan 5 draftı sandbox ebaydə publish elə",
  "electronics kateqoriyasını blokla",
  "mənə insan kimi izah et"
];

export default async function TelegramPage() {
  const { connection, tasks, logs } = await loadTelegramDashboardData();
  const bot = await getTelegramBotMe().catch(() => null);
  const parserStatus = getTelegramAiParserStatus();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Telegram AI control</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Conversational AI parser for Azerbaijani, Turkish, English, and mixed eBay automation requests.
          </p>
        </div>
        <StatusBadge status="Webhook route ready" tone="success" />
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <DashboardCard title="Bot username" value={bot?.username ? `@${bot.username}` : "@not_configured"} detail="Set TELEGRAM_BOT_TOKEN." icon={<Bot size={18} />} />
        <DashboardCard
          title="Chat status"
          value={connection?.status === "active" ? "Connected" : "Disconnected"}
          detail={connection?.telegram_username ? `@${connection.telegram_username}` : "Generate a code and send it to the bot."}
          icon={<MessageSquareText size={18} />}
          tone={connection?.status === "active" ? "success" : "warning"}
        />
        <DashboardCard
          title="Intent parser"
          value={parserStatus.active ? "AI active" : "Fallback"}
          detail={parserStatus.label}
          icon={<CheckCircle2 size={18} />}
          tone={parserStatus.active ? "success" : "warning"}
        />
      </section>

      {!parserStatus.active ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          AI parser key is not configured. Telegram still works with deterministic fallback, but natural mixed-language instructions are much stronger with `AI_PROVIDER=groq` and `GROQ_API_KEY`.
        </div>
      ) : null}

      <TelegramConnectionPanel
        connected={connection?.status === "active"}
        chatId={connection?.telegram_chat_id}
        username={connection?.telegram_username}
      />

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <h3 className="font-semibold text-ink-950 dark:text-white">Sample messages</h3>
          <div className="mt-4 space-y-2">
            {samples.map((sample) => (
              <div key={sample} className="rounded-md bg-ink-50 p-3 text-sm text-ink-700 dark:bg-white/[0.04] dark:text-ink-200">
                {sample}
              </div>
            ))}
          </div>
        </div>
        <TelegramMessagePreview />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <h3 className="font-semibold text-ink-950 dark:text-white">Latest Telegram commands</h3>
          <div className="mt-4 space-y-3">
            {tasks.length ? (
              tasks.map((task) => (
                <div key={task.id} className="rounded-md bg-ink-50 p-3 text-sm dark:bg-white/[0.04]">
                  <p className="font-medium text-ink-900 dark:text-white">{task.task_type}</p>
                  <p className="mt-1 text-ink-500 dark:text-ink-400">{task.original_message}</p>
                  {task.parsed_intent ? (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-white p-3 text-xs text-ink-700 dark:bg-ink-950 dark:text-ink-200">
                      {JSON.stringify(task.parsed_intent, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500 dark:text-ink-400">No Telegram commands saved yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <h3 className="font-semibold text-ink-950 dark:text-white">Natural language agent logs</h3>
          <div className="mt-4 space-y-3">
            {logs.length ? (
              logs.map((log) => (
                <div key={log.id} className="rounded-md bg-ink-50 p-3 text-sm dark:bg-white/[0.04]">
                  <p className="font-medium text-ink-900 dark:text-white">{log.level} - {log.module}</p>
                  <p className="mt-1 text-ink-500 dark:text-ink-400">{log.message}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500 dark:text-ink-400">No Telegram automation logs yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

async function loadTelegramDashboardData() {
  if (!hasSupabaseServerEnv()) {
    return { connection: null, tasks: [], logs: [] };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { connection: null, tasks: [], logs: [] };
  }

  const [connection, tasks, logs] = await Promise.all([
    supabase.from("telegram_connections").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("agent_tasks")
      .select("id,task_type,original_message,status,parsed_intent,created_at")
      .eq("user_id", user.id)
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("automation_logs")
      .select("id,level,module,message,created_at")
      .eq("user_id", user.id)
      .eq("module", "telegram")
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  return {
    connection: connection.data as {
      status: string;
      telegram_chat_id: string;
      telegram_username?: string | null;
    } | null,
    tasks: (tasks.data ?? []) as Array<{
      id: string;
      task_type: string;
      original_message: string | null;
      status: string;
      parsed_intent: unknown;
    }>,
    logs: (logs.data ?? []) as Array<{
      id: string;
      level: string;
      module: string;
      message: string;
    }>
  };
}

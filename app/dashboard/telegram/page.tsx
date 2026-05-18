import { Bot, CheckCircle2, MessageSquareText } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TelegramConnectionPanel } from "@/components/telegram/TelegramConnectionPanel";
import { TelegramMessagePreview } from "@/components/telegram/TelegramMessagePreview";
import { getTelegramBotMe } from "@/lib/telegram/bot";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const samples = [
  "Find 20 profitable products today and list them on eBay.",
  "Only list products with at least 25% margin.",
  "Bugün 20 məhsul tap və yerləşdir.",
  "Do not list branded electronics.",
  "Show me today's report."
];

export default async function TelegramPage() {
  const { connection, tasks, logs } = await loadTelegramDashboardData();
  const bot = await getTelegramBotMe().catch(() => null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Telegram AI control</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Natural-language intent parsing scaffold for Azerbaijani, Turkish, and English.
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
        <DashboardCard title="Intent parser" value="Ready" detail="AI fallback plus deterministic parser." icon={<CheckCircle2 size={18} />} tone="success" />
      </section>

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
      .select("id,task_type,original_message,status,created_at")
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
    }>,
    logs: (logs.data ?? []) as Array<{
      id: string;
      level: string;
      module: string;
      message: string;
    }>
  };
}

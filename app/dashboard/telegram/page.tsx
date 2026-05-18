import { Bot, CheckCircle2, MessageSquareText } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TelegramMessagePreview } from "@/components/telegram/TelegramMessagePreview";

const samples = [
  "Find 20 profitable products today and list them on eBay.",
  "Only list products with at least 25% margin.",
  "Bugün 20 məhsul tap və yerləşdir.",
  "Do not list branded electronics.",
  "Show me today's report."
];

export default function TelegramPage() {
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
        <DashboardCard title="Bot username" value="@not_configured" detail="Set TELEGRAM_BOT_TOKEN." icon={<Bot size={18} />} />
        <DashboardCard title="Chat status" value="Disconnected" detail="Connect after webhook setup." icon={<MessageSquareText size={18} />} tone="warning" />
        <DashboardCard title="Intent parser" value="Ready" detail="AI fallback plus deterministic parser." icon={<CheckCircle2 size={18} />} tone="success" />
      </section>

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
    </div>
  );
}

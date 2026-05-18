import { KeyRound, ShieldCheck, Store, WandSparkles } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Settings</h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Connections, policies, credentials, notifications, and safety defaults.
        </p>
      </div>

      <SettingsSection title="eBay account" description="OAuth and sandbox policy configuration.">
        <SettingRow icon={<Store size={18} />} label="Connection" value="Sandbox not connected" tone="warning" />
        <SettingRow icon={<ShieldCheck size={18} />} label="Policies" value="Payment, return, fulfillment missing" tone="warning" />
        <SettingRow icon={<Store size={18} />} label="Inventory location" value="Missing" tone="warning" />
      </SettingsSection>

      <SettingsSection title="AI provider" description="OpenAI, Groq, and Claude-compatible provider abstraction.">
        <SettingRow icon={<WandSparkles size={18} />} label="Provider" value="AI_PROVIDER=openai" tone="neutral" />
        <SettingRow icon={<KeyRound size={18} />} label="Keys" value="Server-side only" tone="success" />
      </SettingsSection>

      <SettingsSection title="Safety settings" description="Default guardrails for new eBay accounts.">
        <div className="grid gap-3 md:grid-cols-3">
          {["New account safe mode", "Manual approval", "Restricted categories blocked", "Supplier permission required", "No marketplace-to-marketplace", "No misleading image edits"].map((item) => (
            <div key={item} className="rounded-md bg-ink-50 p-3 text-sm font-medium text-ink-700 dark:bg-white/[0.04] dark:text-ink-200">
              {item}
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-md bg-ink-50 p-3 last:mb-0 dark:bg-white/[0.04]">
      <div className="flex items-center gap-3 text-sm font-medium text-ink-800 dark:text-ink-100">
        {icon}
        {label}
      </div>
      <StatusBadge status={value} tone={tone} />
    </div>
  );
}

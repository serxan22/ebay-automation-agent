import { KeyRound, ShieldCheck, Store, WandSparkles } from "lucide-react";
import { EbayConnectPanel } from "@/components/ebay/EbayConnectPanel";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { getEbayAccount } from "@/lib/ebay/account";
import { getEbayRunameWarning } from "@/lib/ebay/client";
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: { ebay?: string; message?: string };
}) {
  const account = await loadEbayAccount();
  const connected = account?.status === "connected";
  const statusMessage = getEbayStatusMessage(searchParams);
  const statusTone = searchParams?.ebay === "error" || searchParams?.ebay === "declined" ? "error" : "success";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Settings</h2>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Connections, policies, credentials, notifications, and safety defaults.
        </p>
      </div>

      <EbayConnectPanel
        statusMessage={statusMessage}
        statusTone={statusTone}
        warningMessage={getEbayRunameWarning()}
        connected={connected}
        accountStatus={account?.status ?? "disconnected"}
        ebayUserId={account?.ebay_user_id}
        marketplace={account?.marketplace ?? process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US"}
        tokenExpiresAt={account?.token_expires_at}
        hasRefreshToken={Boolean(account?.refresh_token_encrypted)}
        paymentPolicy={account?.payment_policy_name ?? account?.payment_policy_id}
        returnPolicy={account?.return_policy_name ?? account?.return_policy_id}
        fulfillmentPolicy={account?.fulfillment_policy_name ?? account?.fulfillment_policy_id}
        inventoryLocation={account?.inventory_location_name ?? account?.inventory_location_key}
      />

      <SettingsSection title="eBay account" description="OAuth and sandbox policy configuration.">
        <SettingRow
          icon={<Store size={18} />}
          label="Connection"
          value={connected ? "Sandbox connected" : account?.status === "expired" ? "Token expired" : "Sandbox not connected"}
          tone={connected ? "success" : "warning"}
        />
        <SettingRow
          icon={<KeyRound size={18} />}
          label="Sandbox account"
          value={account?.ebay_user_id ?? "Not available yet"}
          tone={account?.ebay_user_id ? "success" : "neutral"}
        />
        <SettingRow
          icon={<KeyRound size={18} />}
          label="Token expiry"
          value={formatDateTime(account?.token_expires_at)}
          tone={connected && account?.token_expires_at ? "success" : "warning"}
        />
        <SettingRow
          icon={<ShieldCheck size={18} />}
          label="Policies"
          value={
            account?.payment_policy_id && account.return_policy_id && account.fulfillment_policy_id
              ? "Payment, return, fulfillment loaded"
              : "Payment, return, fulfillment missing"
          }
          tone={account?.payment_policy_id && account.return_policy_id && account.fulfillment_policy_id ? "success" : "warning"}
        />
        <SettingRow
          icon={<Store size={18} />}
          label="Inventory location"
          value={account?.inventory_location_key ?? "Missing"}
          tone={account?.inventory_location_key ? "success" : "warning"}
        />
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

async function loadEbayAccount() {
  if (!hasSupabaseServerEnv()) {
    return null;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return getEbayAccount({ supabase, userId: user.id });
}

function getEbayStatusMessage(searchParams?: { ebay?: string; message?: string }) {
  if (searchParams?.ebay === "connected") {
    return "eBay sandbox connected. Sync policies and setup an inventory location before publishing.";
  }

  if (searchParams?.ebay === "declined") {
    return "eBay authorization was declined. Click Connect sandbox when you are ready to authorize access.";
  }

  if (searchParams?.ebay === "error") {
    return searchParams.message ?? "eBay sandbox connection failed. Review the message and try again.";
  }

  return "";
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Missing";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

"use client";

import { useState } from "react";
import { Building2, KeyRound, MapPin, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EbayConnectPanelProps {
  statusMessage?: string;
  connected: boolean;
  paymentPolicy?: string | null;
  returnPolicy?: string | null;
  fulfillmentPolicy?: string | null;
  inventoryLocation?: string | null;
}

export function EbayConnectPanel({
  statusMessage,
  connected,
  paymentPolicy,
  returnPolicy,
  fulfillmentPolicy,
  inventoryLocation
}: EbayConnectPanelProps) {
  const [message, setMessage] = useState(statusMessage ?? "");
  const [busy, setBusy] = useState<"policies" | "location" | null>(null);

  async function postAction(url: string, action: "policies" | "location") {
    setBusy(action);
    setMessage("");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
        action === "location"
          ? JSON.stringify({
              name: "eBay Agent Sandbox Warehouse",
              country: "US",
              postalCode: "10001"
            })
          : undefined
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      recommendation?: string;
    };

    setBusy(null);
    setMessage(
      payload.ok
        ? action === "policies"
          ? "Seller policies synced from eBay sandbox."
          : "Inventory location checked and saved."
        : `${payload.error ?? "Action failed."}${payload.recommendation ? ` ${payload.recommendation}` : ""}`
    );
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink-950 dark:text-white">eBay sandbox connection</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            OAuth tokens are encrypted server-side. Production publishing is disabled in Phase 2.
          </p>
        </div>
        <Button onClick={() => window.location.assign("/api/ebay/oauth")}>
          <KeyRound size={16} /> {connected ? "Reconnect sandbox" : "Connect sandbox"}
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <ReadinessItem icon={<Building2 size={16} />} label="Payment policy" value={paymentPolicy} />
        <ReadinessItem icon={<Building2 size={16} />} label="Return policy" value={returnPolicy} />
        <ReadinessItem icon={<Building2 size={16} />} label="Fulfillment policy" value={fulfillmentPolicy} />
        <ReadinessItem icon={<MapPin size={16} />} label="Inventory location" value={inventoryLocation} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => postAction("/api/ebay/policies/sync", "policies")}
          disabled={busy !== null}
        >
          <RefreshCcw size={16} /> {busy === "policies" ? "Syncing..." : "Sync seller policies"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => postAction("/api/ebay/location", "location")}
          disabled={busy !== null}
        >
          <MapPin size={16} /> {busy === "location" ? "Checking..." : "Setup location"}
        </Button>
      </div>

      {message ? (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function ReadinessItem({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-ink-900 dark:text-white">{value ?? "Missing"}</p>
    </div>
  );
}

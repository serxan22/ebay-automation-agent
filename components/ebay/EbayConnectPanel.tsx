"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, LogOut, MapPin, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EbayConnectPanelProps {
  statusMessage?: string;
  statusTone?: "success" | "error";
  warningMessage?: string | null;
  oauthDisabledReason?: string;
  connected: boolean;
  accountStatus: string;
  ebayUserId?: string | null;
  marketplace: string;
  tokenExpiresAt?: string | null;
  hasRefreshToken: boolean;
  paymentPolicy?: string | null;
  returnPolicy?: string | null;
  fulfillmentPolicy?: string | null;
  inventoryLocation?: string | null;
}

interface ProgramStatus {
  ok?: boolean;
  programTypes?: string[];
  sellingPolicyManagement?: {
    active: boolean;
    eligible: boolean;
    canOptIn: boolean;
    status: string;
  };
  error?: string;
  recommendation?: string;
}

export function EbayConnectPanel({
  statusMessage,
  statusTone = "success",
  warningMessage,
  oauthDisabledReason,
  connected,
  accountStatus,
  ebayUserId,
  marketplace,
  tokenExpiresAt,
  hasRefreshToken,
  paymentPolicy,
  returnPolicy,
  fulfillmentPolicy,
  inventoryLocation
}: EbayConnectPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState(statusMessage ?? "");
  const [messageTone, setMessageTone] = useState(statusTone);
  const [busy, setBusy] = useState<"policies" | "createDefaults" | "location" | "disconnect" | "optIn" | null>(null);
  const [programStatus, setProgramStatus] = useState<ProgramStatus | null>(null);
  const [programLoading, setProgramLoading] = useState(false);
  const hasAllSellerPolicies = Boolean(paymentPolicy && returnPolicy && fulfillmentPolicy);
  const canCreateDefaultPolicies =
    connected && Boolean(programStatus?.sellingPolicyManagement?.active) && !hasAllSellerPolicies;

  const refreshPrograms = useCallback(async (showMessage = false) => {
    setProgramLoading(true);

    let payload: ProgramStatus;

    try {
      const response = await fetch("/api/ebay/programs");
      payload = (await response.json()) as ProgramStatus;
      setProgramStatus(payload);

      if (showMessage) {
        setMessageTone(response.ok ? "success" : "error");
        setMessage(
          response.ok
            ? getProgramStatusMessage(payload)
            : `${payload.error ?? "Could not check seller policy status."}${
                payload.recommendation ? ` ${payload.recommendation}` : ""
              }`
        );
      }
    } catch {
      payload = { ok: false, error: "Could not check seller policy status." };
      setProgramStatus(payload);

      if (showMessage) {
        setMessageTone("error");
        setMessage(payload.error ?? "Could not check seller policy status.");
      }
    } finally {
      setProgramLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      setProgramStatus(null);
      return;
    }

    void refreshPrograms();
  }, [connected, refreshPrograms]);

  async function postAction(url: string, action: "policies" | "location") {
    setBusy(action);
    setMessage("");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
        action === "location"
          ? JSON.stringify({
              name: "Seller Automation Sandbox Warehouse",
              country: "US",
              postalCode: "10001"
            })
          : undefined
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      recommendation?: string;
    };

    setBusy(null);
    setMessageTone(payload.ok ? "success" : "error");
    setMessage(
      payload.ok
        ? action === "policies"
          ? "Seller policies synced from eBay sandbox."
          : "Inventory location checked and saved."
        : payload.code === "SELLING_POLICY_NOT_OPTED_IN"
          ? "Your sandbox seller is not opted into Selling Policy Management. Click Enable seller policies, wait if needed, then sync again."
        : `${payload.error ?? "Action failed."}${payload.recommendation ? ` ${payload.recommendation}` : ""}`
    );

    if (payload.ok) {
      router.refresh();
    }
  }

  async function enableSellerPolicies() {
    setBusy("optIn");
    setMessage("");

    const response = await fetch("/api/ebay/programs/opt-in-selling-policies", { method: "POST" });
    const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string; recommendation?: string };

    setBusy(null);
    setMessageTone(payload.ok ? "success" : "error");
    setMessage(
      payload.ok
        ? payload.message ??
            "Selling Policy Management opt-in requested. eBay may take some time to activate it. Try Sync seller policies again."
        : `${payload.error ?? "Selling Policy Management opt-in failed."}${
            payload.recommendation ? ` ${payload.recommendation}` : ""
          }`
    );

    if (payload.ok) {
      await refreshPrograms();
    }
  }

  async function createDefaultSellerPolicies() {
    setBusy("createDefaults");
    setMessage("");

    const response = await fetch("/api/ebay/policies/create-defaults", { method: "POST" });
    const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string; recommendation?: string };

    setBusy(null);
    setMessageTone(payload.ok ? "success" : "error");
    setMessage(
      payload.ok
        ? payload.message ?? "Default sandbox seller policies created and synced."
        : `${payload.error ?? "Default seller policy creation failed."}${
            payload.recommendation ? ` ${payload.recommendation}` : ""
          }`
    );

    if (payload.ok) {
      router.refresh();
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setMessage("");

    const response = await fetch("/api/ebay/disconnect", { method: "POST" });
    const payload = (await response.json()) as { ok?: boolean; error?: string };

    setBusy(null);
    setMessageTone(payload.ok ? "success" : "error");
    setMessage(payload.ok ? "eBay sandbox disconnected." : payload.error ?? "Disconnect failed.");

    if (payload.ok) {
      router.refresh();
    }
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink-950 dark:text-white">eBay sandbox connection</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            OAuth tokens are encrypted server-side. Production publishing is locked; sandbox publishing only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => window.location.assign("/api/ebay/oauth")}
            disabled={Boolean(oauthDisabledReason)}
          >
            <KeyRound size={16} /> {connected ? "Reconnect sandbox" : "Connect sandbox"}
          </Button>
          {connected ? (
            <Button variant="secondary" onClick={disconnect} disabled={busy !== null}>
              <LogOut size={16} /> {busy === "disconnect" ? "Disconnecting..." : "Disconnect sandbox"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <ReadinessItem icon={<ShieldCheck size={16} />} label="Connection" value={connected ? "Connected" : accountStatus} />
        <ReadinessItem icon={<KeyRound size={16} />} label="Sandbox account" value={ebayUserId ?? "Not available"} />
        <ReadinessItem icon={<Building2 size={16} />} label="Marketplace" value={marketplace} />
        <ReadinessItem icon={<KeyRound size={16} />} label="Refresh token" value={hasRefreshToken ? "Stored" : "Missing"} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <ReadinessItem icon={<KeyRound size={16} />} label="Token expires" value={formatDateTime(tokenExpiresAt)} />
        <ReadinessItem icon={<Building2 size={16} />} label="Payment policy" value={paymentPolicy} />
        <ReadinessItem icon={<Building2 size={16} />} label="Return policy" value={returnPolicy} />
        <ReadinessItem icon={<Building2 size={16} />} label="Fulfillment policy" value={fulfillmentPolicy} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <ReadinessItem icon={<MapPin size={16} />} label="Inventory location" value={inventoryLocation} />
        <ReadinessItem
          icon={<ShieldCheck size={16} />}
          label="Business policies"
          value={getProgramStatusValue(programStatus, programLoading)}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={enableSellerPolicies}
          disabled={!connected || busy !== null || programLoading || Boolean(programStatus?.sellingPolicyManagement?.active)}
        >
          <ShieldCheck size={16} /> {busy === "optIn" ? "Requesting..." : "Enable seller policies"}
        </Button>
        {canCreateDefaultPolicies ? (
          <Button
            variant="secondary"
            onClick={createDefaultSellerPolicies}
            disabled={busy !== null || programLoading}
          >
            <Building2 size={16} /> {busy === "createDefaults" ? "Creating..." : "Create default seller policies"}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => postAction("/api/ebay/policies/sync", "policies")}
          disabled={!connected || busy !== null}
        >
          <RefreshCcw size={16} /> {busy === "policies" ? "Syncing..." : "Sync seller policies"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => postAction("/api/ebay/location", "location")}
          disabled={!connected || busy !== null}
        >
          <MapPin size={16} /> {busy === "location" ? "Checking..." : "Setup location"}
        </Button>
      </div>

      {warningMessage ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {warningMessage}
          {oauthDisabledReason ? <p className="mt-1 font-medium">{oauthDisabledReason}</p> : null}
        </div>
      ) : null}

      {message ? <div className={getMessageClassName(messageTone)}>{message}</div> : null}
    </section>
  );
}

function getProgramStatusValue(status: ProgramStatus | null, loading: boolean) {
  if (loading) {
    return "Checking...";
  }

  if (!status) {
    return "Unknown";
  }

  if (!status.ok) {
    return "Check failed";
  }

  return status.sellingPolicyManagement?.active ? "Active" : "Not opted in";
}

function getProgramStatusMessage(status: ProgramStatus) {
  if (!status.ok) {
    return status.error ?? "Could not check seller policy status.";
  }

  return status.sellingPolicyManagement?.active
    ? "Selling Policy Management is active."
    : "Selling Policy Management is not active yet. Click Enable seller policies, wait if needed, then sync again.";
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
      <p className="mt-2 break-words text-sm font-medium text-ink-900 dark:text-white">{value ?? "Missing"}</p>
    </div>
  );
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

function getMessageClassName(tone: "success" | "error") {
  const base = "mt-4 rounded-md border p-3 text-sm";

  if (tone === "error") {
    return `${base} border-coral-200 bg-coral-50 text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200`;
  }

  return `${base} border-mint-200 bg-mint-50 text-mint-900 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100`;
}

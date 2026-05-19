"use client";

import { useState } from "react";
import { Copy, ExternalLink, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ManualOAuthUrl {
  authorizeUrl: string;
  state: string;
  stateId?: string;
  runame: string;
  expectedCallbackUrl: string;
}

interface EbayOAuthDebugPanelProps {
  debug: {
    environment: string;
    authorizationBaseUrl: string;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasRuname: boolean;
    runame: string | null;
    redirectUriFromEnv: string | null;
    redirectUriActuallyUsed: string | null;
    redirectUriMode: "runame" | "url";
    scopes: string[];
    sampleAuthorizeUrlWithoutState: string;
  };
  manual: ManualOAuthUrl | null;
  error?: string | null;
}

export function EbayOAuthDebugPanel({ debug, manual, error }: EbayOAuthDebugPanelProps) {
  const [manualUrl, setManualUrl] = useState(manual);
  const [message, setMessage] = useState(error ?? "");
  const [loading, setLoading] = useState(false);

  async function copyAuthorizeUrl() {
    if (!manualUrl?.authorizeUrl) {
      setMessage("No OAuth URL is available yet.");
      return;
    }

    await navigator.clipboard.writeText(manualUrl.authorizeUrl);
    setMessage("OAuth URL copied.");
  }

  function openAuthorizeUrl() {
    if (!manualUrl?.authorizeUrl) {
      setMessage("No OAuth URL is available yet.");
      return;
    }

    window.open(manualUrl.authorizeUrl, "_blank", "noopener,noreferrer");
  }

  async function refreshAuthorizeUrl() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/ebay/oauth/manual-url");
    const payload = (await response.json()) as Partial<ManualOAuthUrl> & { error?: string };

    setLoading(false);

    if (!response.ok || !payload.authorizeUrl || !payload.state || !payload.runame || !payload.expectedCallbackUrl) {
      setMessage(payload.error ?? "Could not create a manual OAuth URL.");
      return;
    }

    setManualUrl({
      authorizeUrl: payload.authorizeUrl,
      state: payload.state,
      stateId: payload.stateId,
      runame: payload.runame,
      expectedCallbackUrl: payload.expectedCallbackUrl
    });
    setMessage("New OAuth URL generated.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
        If eBay shows &quot;Authorization successfully completed. It&apos;s now safe to close the browser window/tab&quot; and the
        app remains disconnected, eBay did not call the callback URL. Create a new RuName in eBay Developer and make
        sure Auth accepted URL is exactly {manualUrl?.expectedCallbackUrl ?? debug.redirectUriFromEnv}.
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink-950 dark:text-white">Manual OAuth URL</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              This creates a real Supabase OAuth state row and returns the exact eBay authorize URL without redirecting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refreshAuthorizeUrl} disabled={loading}>
              <RefreshCcw size={16} /> {loading ? "Generating..." : "Generate new URL"}
            </Button>
            <Button variant="secondary" onClick={copyAuthorizeUrl} disabled={!manualUrl?.authorizeUrl}>
              <Copy size={16} /> Copy OAuth URL
            </Button>
            <Button onClick={openAuthorizeUrl} disabled={!manualUrl?.authorizeUrl}>
              <ExternalLink size={16} /> Open OAuth URL
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DebugItem label="State ID" value={manualUrl?.stateId ?? "Unavailable"} />
          <DebugItem label="State value" value={manualUrl?.state ?? "Unavailable"} />
          <DebugItem label="Runame" value={manualUrl?.runame ?? debug.runame ?? "Missing"} />
          <DebugItem label="Expected callback URL" value={manualUrl?.expectedCallbackUrl ?? debug.redirectUriFromEnv ?? "Missing"} />
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">Generated authorization URL</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-ink-950 p-3 text-xs text-white">
            {manualUrl?.authorizeUrl ?? "No URL generated."}
          </pre>
        </div>

        {message ? (
          <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200">
            {message}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <h2 className="font-semibold text-ink-950 dark:text-white">OAuth Runtime</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <DebugItem label="Environment" value={debug.environment} />
          <DebugItem label="Authorization base URL" value={debug.authorizationBaseUrl} />
          <DebugItem label="Has client ID" value={String(debug.hasClientId)} />
          <DebugItem label="Has client secret" value={String(debug.hasClientSecret)} />
          <DebugItem label="Has RuName" value={String(debug.hasRuname)} />
          <DebugItem label="RuName" value={debug.runame ?? "Missing"} />
          <DebugItem label="Redirect URI from env" value={debug.redirectUriFromEnv ?? "Missing"} />
          <DebugItem label="Redirect URI actually used" value={debug.redirectUriActuallyUsed ?? "Missing"} />
          <DebugItem label="Redirect URI mode" value={debug.redirectUriMode} />
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">Scopes</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-700 dark:text-ink-200">
            {debug.scopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">Sample authorize URL without state</p>
          <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-ink-950 p-3 text-xs text-white">
            {debug.sampleAuthorizeUrlWithoutState}
          </pre>
        </div>
      </section>
    </div>
  );
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-ink-50 p-3 dark:bg-white/[0.04]">
      <p className="text-xs font-semibold uppercase text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-ink-950 dark:text-white">{value}</p>
    </div>
  );
}

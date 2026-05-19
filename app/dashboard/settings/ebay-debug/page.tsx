import Link from "next/link";
import { EbayOAuthDebugPanel } from "@/components/ebay/EbayOAuthDebugPanel";
import { getEbayConfig } from "@/lib/ebay/client";
import { buildEbayOAuthUrl, getEbayOAuthDebugInfo, getExpectedEbayCallbackUrl } from "@/lib/ebay/oauth";
import { createEbayOAuthState } from "@/lib/ebay/oauth-state";
import { requireUser } from "@/lib/supabase/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EbayDebugPage() {
  const user = await requireUser();
  const debug = getEbayOAuthDebugInfo();
  const diagnostics = await createDiagnosticsUrl(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Settings / eBay debug</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink-950 dark:text-white">eBay OAuth diagnostics</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-500 dark:text-ink-400">
            Generate and inspect the exact sandbox authorization URL, state row, RuName, and expected callback URL.
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className="inline-flex h-10 items-center justify-center rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50 dark:border-white/10 dark:bg-white/5 dark:text-ink-100"
        >
          Back to settings
        </Link>
      </div>

      <EbayOAuthDebugPanel debug={debug} manual={diagnostics.manual} error={diagnostics.error} />
    </div>
  );
}

async function createDiagnosticsUrl(userId: string) {
  try {
    const config = getEbayConfig();

    if (!config.runame) {
      return {
        manual: null,
        error: "EBAY_RUNAME is missing. Add it in Vercel before creating a manual OAuth URL."
      };
    }

    const serviceSupabase = createSupabaseServiceClient();
    const oauthState = await createEbayOAuthState({
      supabase: serviceSupabase,
      userId
    });

    return {
      manual: {
        authorizeUrl: buildEbayOAuthUrl(oauthState.state),
        state: oauthState.state,
        stateId: oauthState.id,
        runame: config.runame,
        expectedCallbackUrl: getExpectedEbayCallbackUrl()
      },
      error: null
    };
  } catch (error) {
    return {
      manual: null,
      error: error instanceof Error ? error.message : "Could not create eBay OAuth diagnostics URL."
    };
  }
}

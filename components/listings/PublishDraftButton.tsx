"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ListingDraftStatus } from "@/lib/types";

export function PublishDraftButton({
  draftId,
  status,
  ebayConnected,
  disabled,
  disabledReason
}: {
  draftId?: string;
  status: ListingDraftStatus;
  ebayConnected: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function publish() {
    if (disabledReason) {
      setMessage(disabledReason);
      return;
    }

    if (status !== "approved") {
      setMessage("Approve this draft before publishing.");
      return;
    }

    if (!ebayConnected) {
      setMessage("Connect eBay sandbox first in Settings.");
      return;
    }

    if (!draftId) {
      setMessage("This draft is not saved in Supabase yet.");
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch(`/api/listings/${draftId}/publish`, {
      method: "POST"
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { listingId: string; offerId: string; sku: string };
      error?: string;
      code?: string;
      recommendation?: string;
    };

    setLoading(false);

    if (payload.ok && payload.result) {
      setMessage(
        `Sandbox listing published. Item ${payload.result.listingId}, offer ${payload.result.offerId}, SKU ${payload.result.sku}.`
      );
      router.refresh();
      return;
    }

    const isDisconnected =
      payload.code === "TOKEN_EXPIRED" && /not connected|token|connect/i.test(payload.error ?? "");

    setMessage(
      isDisconnected
        ? "Connect eBay sandbox first in Settings."
        : `${payload.code ? `${payload.code}: ` : ""}${payload.error ?? "Publish failed."} ${
            payload.recommendation ?? ""
          }`
    );
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button variant="ghost" onClick={publish} disabled={disabled || loading}>
        <Send size={16} /> {loading ? "Publishing..." : "Publish sandbox"}
      </Button>
      {message || disabledReason ? (
        <p className="max-w-lg text-xs text-ink-500 dark:text-ink-400">{message || disabledReason}</p>
      ) : null}
    </div>
  );
}

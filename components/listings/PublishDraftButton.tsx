"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PublishDraftButton({ draftId, disabled }: { draftId?: string; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function publish() {
    if (!draftId) {
      setMessage("This demo draft is not saved in Supabase yet.");
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
      return;
    }

    setMessage(`${payload.code ? `${payload.code}: ` : ""}${payload.error ?? "Publish failed."} ${payload.recommendation ?? ""}`);
  }

  return (
    <div className="space-y-2">
      <Button variant="ghost" onClick={publish} disabled={disabled || loading}>
        <Send size={16} /> {loading ? "Publishing..." : "Publish sandbox"}
      </Button>
      {message ? <p className="max-w-lg text-xs text-ink-500 dark:text-ink-400">{message}</p> : null}
    </div>
  );
}

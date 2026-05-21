"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Tags } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Feedback = {
  text: string;
  tone: "success" | "error" | "info";
};

const BULK_ACTION_TIMEOUT_MS = 25_000;

export function BulkListingActions() {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function runAction(action: "resolve_categories" | "generate_specifics") {
    setActiveAction(action);
    setFeedback(null);

    try {
      const endpoint =
        action === "resolve_categories"
          ? "/api/listings/resolve-categories"
          : "/api/listings/generate-missing-specifics";
      const body = JSON.stringify({ limit: 10 });
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };

      setFeedback({
        text: payload.message ?? payload.error ?? "Action completed.",
        tone: response.ok && payload.ok !== false ? "success" : "error"
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-950 dark:text-white">Bulk readiness actions</h3>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Run bounded sandbox-safe checks for recent drafts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => runAction("resolve_categories")}
            disabled={activeAction !== null}
            title="Resolve missing eBay categories"
          >
            <Tags size={16} /> {activeAction === "resolve_categories" ? "Resolving..." : "Resolve missing categories"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => runAction("generate_specifics")}
            disabled={activeAction !== null}
            title="Generate required item specifics"
          >
            <ListChecks size={16} /> {activeAction === "generate_specifics" ? "Generating..." : "Generate missing specifics"}
          </Button>
        </div>
      </div>
      {feedback ? (
        <div className={getFeedbackClassName(feedback.tone)}>
          {feedback.text}
        </div>
      ) : null}
    </section>
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BULK_ACTION_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getClientErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  ) {
    return "Request timed out. Try again; the button is safe to reuse.";
  }

  return error instanceof Error ? error.message : "Request failed. Try again.";
}

function getFeedbackClassName(tone: Feedback["tone"]) {
  const base = "mt-3 rounded-md border p-3 text-sm";

  if (tone === "success") {
    return `${base} border-mint-200 bg-mint-50 text-mint-900 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100`;
  }

  if (tone === "error") {
    return `${base} border-coral-200 bg-coral-50 text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200`;
  }

  return `${base} border-ink-200 bg-ink-50 text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200`;
}

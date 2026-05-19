"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, FileText, Save, X } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PublishDraftButton } from "@/components/listings/PublishDraftButton";
import { Button } from "@/components/ui/Button";
import type { ListingDraft } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

type Feedback = {
  text: string;
  tone: "success" | "error" | "info";
};

export function ListingDraftCard({
  draft,
  ebayConnected
}: {
  draft: ListingDraft;
  ebayConnected: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [form, setForm] = useState(() => ({
    ebayTitle: draft.ebayTitle,
    ebayDescription: draft.ebayDescription,
    price: String(draft.price),
    quantity: String(draft.quantity),
    ebayCategoryId: draft.ebayCategoryId ?? "",
    itemSpecifics: JSON.stringify(draft.itemSpecifics ?? {}, null, 2),
    optimizedImageUrls: (draft.optimizedImageUrls ?? []).join("\n")
  }));
  const tone = getStatusTone(draft.status);
  const canApprove = draft.status === "draft";
  const hasAnalysisContext =
    draft.estimatedProfit != null ||
    draft.marginPercentage != null ||
    draft.riskScore != null ||
    draft.finalScore != null;
  const readiness = draft.readiness;
  const publishDisabledReason = getPublishDisabledReason(draft, ebayConnected);

  async function approveDraft() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/listings/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", draftId: draft.id })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

    setLoading(false);
    setFeedback({
      text: payload.ok ? payload.message ?? "Draft approved." : payload.error ?? "Approve failed.",
      tone: payload.ok ? "success" : "error"
    });

    if (payload.ok) {
      router.refresh();
    }
  }

  async function saveRevision() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    let itemSpecifics: Record<string, string | string[]>;

    try {
      itemSpecifics = JSON.parse(form.itemSpecifics) as Record<string, string | string[]>;
    } catch {
      setFeedback({ text: "Item specifics must be valid JSON.", tone: "error" });
      return;
    }

    const optimizedImageUrls = form.optimizedImageUrls
      .split(/\n|,/)
      .map((url) => url.trim())
      .filter(Boolean);

    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/listings/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "revise",
        draftId: draft.id,
        ebayTitle: form.ebayTitle,
        ebayDescription: form.ebayDescription,
        price: Number(form.price),
        quantity: Number(form.quantity),
        ebayCategoryId: form.ebayCategoryId || null,
        itemSpecifics,
        optimizedImageUrls
      })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

    setLoading(false);
    setFeedback({
      text: payload.ok ? payload.message ?? "Draft revised." : payload.error ?? "Save failed.",
      tone: payload.ok ? "success" : "error"
    });

    if (payload.ok) {
      setRevising(false);
      router.refresh();
    }
  }

  const descriptionPreview = useMemo(
    () => stripHtml(draft.ebayDescription).slice(0, 180),
    [draft.ebayDescription]
  );

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200">
            <FileText size={18} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-ink-400 dark:text-ink-500">
              Supplier product
            </p>
            <h3 className="mt-1 font-semibold text-ink-950 dark:text-white">
              {draft.supplierProductTitle ?? draft.ebayTitle}
            </h3>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              SKU {draft.supplierSku ?? "not set"}
            </p>
            <div className="mt-3 border-l-2 border-mint-400 pl-3">
              <p className="text-xs font-medium uppercase text-ink-400 dark:text-ink-500">eBay title</p>
              <p className="mt-1 text-sm font-semibold text-ink-900 dark:text-white">{draft.ebayTitle}</p>
            </div>
            <p className="mt-2 max-w-xl text-sm text-ink-500 dark:text-ink-400">{descriptionPreview}</p>
          </div>
        </div>
        <StatusBadge status={draft.status} tone={tone} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Price" value={formatCurrency(draft.price)} />
        <Metric label="Quantity" value={String(draft.quantity)} />
        <Metric
          label="Estimated profit"
          value={draft.estimatedProfit == null ? "Not analyzed" : formatCurrency(draft.estimatedProfit)}
        />
        <Metric
          label="Margin"
          value={draft.marginPercentage == null ? "Not analyzed" : `${draft.marginPercentage.toFixed(1)}%`}
        />
        <Metric
          label="Readiness"
          value={readiness ? `${readiness.score}/100 ${readiness.ready ? "Ready" : "Needs work"}` : "Not checked"}
        />
      </div>

      {hasAnalysisContext ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Risk score" value={draft.riskScore == null ? "Not analyzed" : `${draft.riskScore}/100`} />
          <Metric label="Final score" value={draft.finalScore == null ? "Not analyzed" : `${draft.finalScore}/100`} />
          <Metric label="Publish eligibility" value={publishDisabledReason ? "Blocked" : "Eligible"} />
        </div>
      ) : null}

      {readiness && (!readiness.ready || readiness.warnings.length > 0) ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">Publish readiness</p>
          {readiness.missing.length ? (
            <p className="mt-1">Missing: {readiness.missing.slice(0, 6).join(", ")}</p>
          ) : null}
          {readiness.warnings.length ? (
            <p className="mt-1">Warnings: {readiness.warnings.slice(0, 3).join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      {draft.analysisNotes ? (
        <div className="mt-4 rounded-md border border-mint-200 bg-mint-50 p-3 text-sm text-mint-900 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100">
          <span className="font-medium">Analysis notes:</span> {draft.analysisNotes}
        </div>
      ) : null}

      {draft.rejectionReasons?.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">Rejection / analysis flags</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {draft.rejectionReasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={approveDraft} disabled={!canApprove || loading}>
          <BadgeCheck size={16} /> {loading ? "Working..." : "Approve"}
        </Button>
        <Button variant="secondary" onClick={() => setRevising(true)}>
          <CircleAlert size={16} /> Revise
        </Button>
        <PublishDraftButton
          draftId={draft.id}
          status={draft.status}
          ebayConnected={ebayConnected}
          disabled={Boolean(publishDisabledReason)}
          disabledReason={publishDisabledReason}
        />
      </div>

      {feedback ? (
        <div className={getFeedbackClassName(feedback.tone)}>
          {feedback.text}
        </div>
      ) : null}

      {draft.errorMessage ? (
        <div className="mt-4 rounded-md border border-coral-200 bg-coral-50 p-3 text-sm text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200">
          {draft.ebayErrorCode ? `${draft.ebayErrorCode}: ` : ""}
          {draft.errorMessage}
        </div>
      ) : null}

      {revising ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-ink-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-ink-950">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-ink-950 dark:text-white">Revise listing draft</h3>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                  Update the sandbox-ready listing fields before approval or publish.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setRevising(false)}>
                <X size={16} /> Close
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                eBay title
                <input
                  value={form.ebayTitle}
                  onChange={(event) => setForm((current) => ({ ...current, ebayTitle: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                />
              </label>

              <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                eBay description
                <textarea
                  value={form.ebayDescription}
                  onChange={(event) => setForm((current) => ({ ...current, ebayDescription: event.target.value }))}
                  rows={6}
                  className="mt-2 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.quantity}
                    onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  eBay category ID
                  <input
                    value={form.ebayCategoryId}
                    onChange={(event) => setForm((current) => ({ ...current, ebayCategoryId: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
              </div>

              <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                Item specifics JSON
                <textarea
                  value={form.itemSpecifics}
                  onChange={(event) => setForm((current) => ({ ...current, itemSpecifics: event.target.value }))}
                  rows={7}
                  className="mt-2 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                />
              </label>

              <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                Optimized image URLs
                <textarea
                  value={form.optimizedImageUrls}
                  onChange={(event) => setForm((current) => ({ ...current, optimizedImageUrls: event.target.value }))}
                  rows={4}
                  placeholder="One image URL per line"
                  className="mt-2 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setRevising(false)}>
                Cancel
              </Button>
              <Button onClick={saveRevision} disabled={loading}>
                <Save size={16} /> {loading ? "Saving..." : "Save revision"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getStatusTone(status: ListingDraft["status"]) {
  if (status === "approved" || status === "published") {
    return "success" as const;
  }

  if (status === "failed" || status === "rejected") {
    return "danger" as const;
  }

  return "warning" as const;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-ink-400 dark:text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-950 dark:text-white">{value}</p>
    </div>
  );
}

function getFeedbackClassName(tone: Feedback["tone"]) {
  const base = "mt-4 rounded-md border p-3 text-sm";

  if (tone === "success") {
    return `${base} border-mint-200 bg-mint-50 text-mint-900 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100`;
  }

  if (tone === "error") {
    return `${base} border-coral-200 bg-coral-50 text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200`;
  }

  return `${base} border-ink-200 bg-ink-50 text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getPublishDisabledReason(draft: ListingDraft, ebayConnected: boolean) {
  if (draft.status !== "approved") {
    return "Approve this draft before publishing.";
  }

  if (!ebayConnected) {
    return "Connect eBay sandbox first in Settings.";
  }

  if (draft.readiness && !draft.readiness.ready) {
    return `Fix readiness issues: ${draft.readiness.missing.slice(0, 4).join(", ")}.`;
  }

  return "";
}

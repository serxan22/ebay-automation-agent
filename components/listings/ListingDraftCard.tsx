"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, FileText, Images, ListChecks, Save, Tags, WandSparkles, X } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PublishDraftButton } from "@/components/listings/PublishDraftButton";
import { Button } from "@/components/ui/Button";
import type { ListingDraft } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

type Feedback = {
  text: string;
  tone: "success" | "error" | "info";
};

const CLIENT_LISTING_ACTION_TIMEOUT_MS = 20_000;

export function ListingDraftCard({
  draft,
  ebayConnected
}: {
  draft: ListingDraft;
  ebayConnected: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [form, setForm] = useState(() => ({
    ebayTitle: draft.ebayTitle,
    ebayDescription: draft.ebayDescription,
    price: String(draft.price),
    quantity: String(draft.quantity),
    ebayCategoryId: draft.ebayCategoryId ?? "",
    ebayCategoryName: draft.ebayCategoryName ?? "",
    ebayCategoryPath: draft.ebayCategoryPath ?? "",
    categoryTreeId: draft.categoryTreeId ?? "",
    categoryConfidence: draft.categoryConfidence == null ? "" : String(draft.categoryConfidence),
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
  const nextAction = getNextAction(draft, ebayConnected);

  async function approveDraft() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    setActiveAction("approve");
    setFeedback(null);

    try {
      const response = await fetchWithTimeout("/api/listings/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", draftId: draft.id })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      setFeedback({
        text: payload.ok ? payload.message ?? "Draft approved." : payload.error ?? "Approve failed.",
        tone: payload.ok ? "success" : "error"
      });

      if (payload.ok) {
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
    }
  }

  async function regenerateListingCopy() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    setActiveAction("regenerate_copy");
    setFeedback(null);

    try {
      const response = await fetchWithTimeout("/api/listings/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_copy", draftId: draft.id })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      setFeedback({
        text: payload.ok ? payload.message ?? "Listing copy regenerated." : payload.error ?? "Regenerate failed.",
        tone: payload.ok ? "success" : "error"
      });

      if (payload.ok) {
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
    }
  }

  async function resolveCategory() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    await runDraftPostAction({
      actionKey: "resolve_category",
      endpoint: `/api/listings/${draft.id}/resolve-category`,
      successFallback: "Category resolved."
    });
  }

  async function generateSpecifics() {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    await runDraftPostAction({
      actionKey: "generate_specifics",
      endpoint: `/api/listings/${draft.id}/generate-item-specifics`,
      successFallback: "Item specifics generated."
    });
  }

  async function validateImages() {
    await runDraftPatchAction({
      actionKey: "validate_images",
      body: { action: "validate_images", draftId: draft.id },
      successFallback: "Images validated."
    });
  }

  async function optimizeImages() {
    await runDraftPatchAction({
      actionKey: "optimize_images",
      body: { action: "optimize_images", draftId: draft.id },
      successFallback: "Images optimized."
    });
  }

  async function runDraftPostAction({
    actionKey,
    endpoint,
    successFallback
  }: {
    actionKey: string;
    endpoint: string;
    successFallback: string;
  }) {
    setActiveAction(actionKey);
    setFeedback(null);

    try {
      const response = await fetchWithTimeout(endpoint, { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string; recommendation?: string };
      const ok = response.ok && payload.ok !== false;

      setFeedback({
        text: ok
          ? payload.message ?? successFallback
          : [payload.error ?? payload.message ?? "Action failed.", payload.recommendation].filter(Boolean).join(" "),
        tone: ok ? "success" : "error"
      });

      if (ok) {
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
    }
  }

  async function runDraftPatchAction({
    actionKey,
    body,
    successFallback
  }: {
    actionKey: string;
    body: Record<string, unknown>;
    successFallback: string;
  }) {
    if (!draft.id) {
      setFeedback({ text: "This draft is not saved in Supabase yet.", tone: "error" });
      return;
    }

    setActiveAction(actionKey);
    setFeedback(null);

    try {
      const response = await fetchWithTimeout("/api/listings/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      const ok = response.ok && payload.ok !== false;

      setFeedback({
        text: ok ? payload.message ?? successFallback : payload.error ?? payload.message ?? "Action failed.",
        tone: ok ? "success" : "error"
      });

      if (ok) {
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
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

    setActiveAction("revise");
    setFeedback(null);

    try {
      const response = await fetchWithTimeout("/api/listings/drafts", {
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
          ebayCategoryName: form.ebayCategoryName || null,
          ebayCategoryPath: form.ebayCategoryPath || null,
          categoryTreeId: form.categoryTreeId || null,
          categoryConfidence: form.categoryConfidence ? Number(form.categoryConfidence) : null,
          itemSpecifics,
          optimizedImageUrls
        })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      setFeedback({
        text: payload.ok ? payload.message ?? "Draft revised." : payload.error ?? "Save failed.",
        tone: payload.ok ? "success" : "error"
      });

      if (payload.ok) {
        setRevising(false);
        router.refresh();
      }
    } catch (error) {
      setFeedback({ text: getClientErrorMessage(error), tone: "error" });
    } finally {
      setActiveAction(null);
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
        <Metric label="Supplier cost" value={draft.supplierCost == null ? "Unknown" : formatCurrency(draft.supplierCost)} />
        <Metric label="Est. fees" value={draft.estimatedEbayFees == null ? "Not analyzed" : formatCurrency(draft.estimatedEbayFees)} />
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
          label="Listing quality"
          value={
            draft.listingQualityScore == null
              ? readiness
                ? `${readiness.score}/100 ${readiness.ready ? "Ready" : "Needs work"}`
                : "Not checked"
              : `${draft.listingQualityScore}/100`
          }
        />
        <Metric label="Category" value={draft.ebayCategoryId ? `${draft.ebayCategoryId}` : "Missing"} />
        <Metric label="Image status" value={formatImageStatus(draft.imageValidationStatus)} />
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
            <p className="mt-1">Missing: {readiness.missing.slice(0, 8).join(", ")}</p>
          ) : null}
          {readiness.warnings.length ? (
            <p className="mt-1">Warnings: {readiness.warnings.slice(0, 4).join(", ")}</p>
          ) : null}
          <p className="mt-2 font-medium">Next action: {nextAction}</p>
        </div>
      ) : null}

      {draft.ebayCategoryName || draft.ebayCategoryPath || draft.requiredItemSpecifics?.length || draft.missingItemSpecifics?.length ? (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200">
          {draft.ebayCategoryName ? <p><span className="font-medium">Category:</span> {draft.ebayCategoryName}</p> : null}
          {draft.ebayCategoryPath ? <p className="mt-1"><span className="font-medium">Path:</span> {draft.ebayCategoryPath}</p> : null}
          {draft.categoryConfidence != null ? <p className="mt-1"><span className="font-medium">Confidence:</span> {(draft.categoryConfidence * 100).toFixed(0)}%</p> : null}
          {draft.requiredItemSpecifics?.length ? (
            <p className="mt-1"><span className="font-medium">Required specifics:</span> {draft.requiredItemSpecifics.join(", ")}</p>
          ) : null}
          {draft.missingItemSpecifics?.length ? (
            <p className="mt-1 text-amber-700 dark:text-amber-100">
              <span className="font-medium">Missing specifics:</span> {draft.missingItemSpecifics.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {draft.imageValidationWarnings?.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">Image checks</p>
          <p className="mt-1">{draft.imageValidationWarnings.slice(0, 4).join(" ")}</p>
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
        <Button variant="secondary" onClick={resolveCategory} disabled={activeAction === "resolve_category" || draft.status === "published"}>
          <Tags size={16} /> {activeAction === "resolve_category" ? "Resolving..." : "Resolve category"}
        </Button>
        <Button variant="secondary" onClick={generateSpecifics} disabled={activeAction === "generate_specifics" || !draft.ebayCategoryId || draft.status === "published"}>
          <ListChecks size={16} /> {activeAction === "generate_specifics" ? "Generating..." : "Generate item specifics"}
        </Button>
        <Button variant="secondary" onClick={validateImages} disabled={activeAction === "validate_images" || draft.status === "published"}>
          <Images size={16} /> {activeAction === "validate_images" ? "Checking..." : "Validate images"}
        </Button>
        <Button variant="secondary" onClick={optimizeImages} disabled={activeAction === "optimize_images" || draft.status === "published"}>
          <Images size={16} /> {activeAction === "optimize_images" ? "Optimizing..." : "Optimize images"}
        </Button>
        <Button variant="secondary" onClick={approveDraft} disabled={!canApprove || activeAction === "approve"}>
          <BadgeCheck size={16} /> {activeAction === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button variant="secondary" onClick={() => setRevising(true)}>
          <CircleAlert size={16} /> Revise
        </Button>
        <Button variant="secondary" onClick={regenerateListingCopy} disabled={activeAction === "regenerate_copy" || draft.status === "published"}>
          <WandSparkles size={16} /> {activeAction === "regenerate_copy" ? "Regenerating..." : "Regenerate listing copy"}
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
          {draft.ebayErrorJson ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">Raw details</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-white/70 p-2 text-xs dark:bg-ink-950/70">
                {JSON.stringify(draft.ebayErrorJson, null, 2)}
              </pre>
            </details>
          ) : null}
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

              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  eBay category name
                  <input
                    value={form.ebayCategoryName}
                    onChange={(event) => setForm((current) => ({ ...current, ebayCategoryName: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200 md:col-span-2">
                  eBay category path
                  <input
                    value={form.ebayCategoryPath}
                    onChange={(event) => setForm((current) => ({ ...current, ebayCategoryPath: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  Category tree ID
                  <input
                    value={form.categoryTreeId}
                    onChange={(event) => setForm((current) => ({ ...current, categoryTreeId: event.target.value }))}
                    className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
                  Category confidence
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={form.categoryConfidence}
                    onChange={(event) => setForm((current) => ({ ...current, categoryConfidence: event.target.value }))}
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
              <Button onClick={saveRevision} disabled={activeAction === "revise"}>
                <Save size={16} /> {activeAction === "revise" ? "Saving..." : "Save revision"}
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

function formatImageStatus(status?: string | null) {
  if (status === "valid") return "Image valid";
  if (status === "missing") return "Missing image";
  if (status === "external") return "External image";
  if (status === "optimized") return "Optimized image";
  if (status === "invalid") return "Broken image";
  return "Not checked";
}

function getNextAction(draft: ListingDraft, ebayConnected: boolean) {
  const missing = draft.readiness?.missing ?? [];

  if (missing.some((item) => /category/i.test(item))) {
    return "Resolve category";
  }

  if (missing.some((item) => /specific/i.test(item)) || (draft.ebayCategoryId && !draft.requiredItemSpecifics?.length)) {
    return "Generate item specifics";
  }

  if (missing.some((item) => /image/i.test(item)) || !draft.imageValidationStatus) {
    return "Validate images";
  }

  if (draft.status !== "approved") {
    return "Approve";
  }

  if (!ebayConnected) {
    return "Connect eBay sandbox";
  }

  if (draft.readiness?.ready) {
    return "Publish sandbox";
  }

  return missing[0] ?? "Review warnings";
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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_LISTING_ACTION_TIMEOUT_MS);

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

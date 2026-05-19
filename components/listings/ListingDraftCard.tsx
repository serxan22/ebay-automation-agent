"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, FileText, Save, X } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PublishDraftButton } from "@/components/listings/PublishDraftButton";
import { Button } from "@/components/ui/Button";
import type { ListingDraft } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

export function ListingDraftCard({
  draft,
  ebayConnected
}: {
  draft: ListingDraft;
  ebayConnected: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [form, setForm] = useState(() => ({
    ebayTitle: draft.ebayTitle,
    ebayDescription: draft.ebayDescription,
    price: String(draft.price),
    quantity: String(draft.quantity),
    ebayCategoryId: draft.ebayCategoryId ?? "",
    itemSpecifics: JSON.stringify(draft.itemSpecifics ?? {}, null, 2)
  }));
  const tone = getStatusTone(draft.status);
  const canApprove = draft.status === "draft";

  async function approveDraft() {
    if (!draft.id) {
      setMessage("This draft is not saved in Supabase yet.");
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/listings/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", draftId: draft.id })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

    setLoading(false);
    setMessage(payload.ok ? payload.message ?? "Draft approved." : payload.error ?? "Approve failed.");

    if (payload.ok) {
      router.refresh();
    }
  }

  async function saveRevision() {
    if (!draft.id) {
      setMessage("This draft is not saved in Supabase yet.");
      return;
    }

    let itemSpecifics: Record<string, string | string[]>;

    try {
      itemSpecifics = JSON.parse(form.itemSpecifics) as Record<string, string | string[]>;
    } catch {
      setMessage("Item specifics must be valid JSON.");
      return;
    }

    setLoading(true);
    setMessage("");

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
        itemSpecifics
      })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };

    setLoading(false);
    setMessage(payload.ok ? payload.message ?? "Draft revised." : payload.error ?? "Save failed.");

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
            <h3 className="font-semibold text-ink-950 dark:text-white">{draft.ebayTitle}</h3>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {formatCurrency(draft.price)} - Qty {draft.quantity} - {draft.condition}
            </p>
            <p className="mt-2 max-w-xl text-sm text-ink-500 dark:text-ink-400">{descriptionPreview}</p>
          </div>
        </div>
        <StatusBadge status={draft.status} tone={tone} />
      </div>

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
          disabled={draft.status !== "approved"}
        />
      </div>

      {message ? (
        <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-200">
          {message}
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

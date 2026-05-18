import { BadgeCheck, CircleAlert, FileText, Send } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { ListingDraft } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

export function ListingDraftCard({ draft }: { draft: ListingDraft }) {
  const tone = draft.status === "draft" ? "warning" : draft.status === "approved" ? "success" : "neutral";

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
          </div>
        </div>
        <StatusBadge status={draft.status} tone={tone} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary">
          <BadgeCheck size={16} /> Approve
        </Button>
        <Button variant="secondary">
          <CircleAlert size={16} /> Revise
        </Button>
        <Button variant="ghost">
          <Send size={16} /> Publish later
        </Button>
      </div>
    </div>
  );
}

import { Download, Send } from "lucide-react";
import { ReportCard } from "@/components/reports/ReportCard";
import { Button } from "@/components/ui/Button";
import { demoReports } from "@/lib/demo-data";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">Reports</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Daily, weekly, product research, risk, listing, and sales report templates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Download size={16} /> Download
          </Button>
          <Button variant="secondary">
            <Send size={16} /> Send to Telegram
          </Button>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        {demoReports.map((report) => (
          <ReportCard key={report.title} {...report} />
        ))}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="font-semibold text-ink-950 dark:text-white">Weekly report outline</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["Best categories", "Supplier performance", "Failed listing patterns", "Automation health score", "Estimated profit", "Improvement suggestions"].map((item) => (
            <div key={item} className="rounded-md bg-ink-50 p-3 text-sm text-ink-700 dark:bg-white/[0.04] dark:text-ink-200">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

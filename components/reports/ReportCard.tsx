export function ReportCard({
  title,
  type,
  content,
  metric
}: {
  title: string;
  type: string;
  content: string;
  metric: string;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-mint-700 dark:text-mint-300">{type}</p>
          <h3 className="mt-2 font-semibold text-ink-950 dark:text-white">{title}</h3>
        </div>
        <p className="text-sm font-semibold text-ink-900 dark:text-white">{metric}</p>
      </div>
      <p className="mt-4 text-sm text-ink-600 dark:text-ink-300">{content}</p>
    </div>
  );
}

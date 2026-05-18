import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-5">
        <h2 className="font-semibold text-ink-950 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

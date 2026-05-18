"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
      <div className="max-w-lg rounded-lg border border-coral-300 bg-white p-6 shadow-soft dark:border-coral-500/30 dark:bg-white/[0.04]">
        <div className="flex items-center gap-3 text-coral-700 dark:text-coral-300">
          <AlertTriangle />
          <h1 className="text-lg font-semibold">Something needs attention</h1>
        </div>
        <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{error.message}</p>
        <Button className="mt-5" onClick={reset}>
          Retry
        </Button>
      </div>
    </main>
  );
}

import { ShieldCheck } from "lucide-react";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export default function LoginPage() {
  const configured = hasSupabaseServerEnv();

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
      <section className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex size-12 items-center justify-center rounded-md bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-300">
          <ShieldCheck />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">Sign in</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Supabase Auth is ready for email magic links and OAuth providers.
        </p>
        <div className="mt-5 rounded-lg border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-300">
          {configured
            ? "Supabase environment variables are configured."
            : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign in."}
        </div>
      </section>
    </main>
  );
}

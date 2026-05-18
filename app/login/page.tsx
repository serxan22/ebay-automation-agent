import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getCurrentUser } from "@/lib/supabase/auth";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export default async function LoginPage() {
  const configured = hasSupabaseServerEnv();
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
      <section className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex size-12 items-center justify-center rounded-md bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-300">
          <ShieldCheck />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">Sign in</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          Use Supabase email/password auth to access the automation dashboard.
        </p>
        {!configured ? (
          <div className="mt-5 rounded-lg border border-coral-200 bg-coral-50 p-4 text-sm text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign in.
          </div>
        ) : null}
        <AuthForm configured={configured} />
      </section>
    </main>
  );
}

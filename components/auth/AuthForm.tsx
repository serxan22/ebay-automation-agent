"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const validation = validate(email, password, mode);
    if (validation) {
      setMessageTone("error");
      setMessage(validation);
      return;
    }

    if (!configured || !hasSupabaseBrowserEnv()) {
      setMessageTone("error");
      setMessage("Supabase environment variables are missing. Add them to .env.local first.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          setMessageTone("error");
          setMessage(mapAuthError(error.message, "login"));
          setLoading(false);
          return;
        }

        router.push("/dashboard");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        setMessageTone("error");
        setMessage(mapAuthError(error.message, "signup"));
        setLoading(false);
        return;
      }

      if (!data.session) {
        setMessageTone("success");
        setMessage("Account created. Check your email to confirm your address, then sign in.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid grid-cols-2 rounded-md bg-ink-100 p-1 dark:bg-white/10">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded px-3 py-2 text-sm font-medium transition ${
            mode === "login"
              ? "bg-white text-ink-950 shadow-sm dark:bg-ink-950 dark:text-white"
              : "text-ink-500 dark:text-ink-300"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded px-3 py-2 text-sm font-medium transition ${
            mode === "signup"
              ? "bg-white text-ink-950 shadow-sm dark:bg-ink-950 dark:text-white"
              : "text-ink-500 dark:text-ink-300"
          }`}
        >
          Sign up
        </button>
      </div>

      <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-mint-500 dark:border-white/10 dark:bg-ink-950 dark:text-white"
          placeholder="seller@example.com"
        />
      </label>

      <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">
        Password
        <div className="mt-2 flex h-11 items-center rounded-md border border-ink-200 bg-white focus-within:border-mint-500 dark:border-white/10 dark:bg-ink-950">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-ink-900 outline-none dark:text-white"
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="flex size-10 items-center justify-center text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-white"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      {message ? (
        <div
          className={`rounded-md border p-3 text-sm ${
            messageTone === "success"
              ? "border-mint-200 bg-mint-50 text-mint-900 dark:border-mint-500/20 dark:bg-mint-500/10 dark:text-mint-100"
              : "border-coral-200 bg-coral-50 text-coral-800 dark:border-coral-500/20 dark:bg-coral-500/10 dark:text-coral-200"
          }`}
        >
          {message}
        </div>
      ) : null}

      <Button className="w-full" disabled={loading || !configured}>
        {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
        {loading ? "Working..." : mode === "login" ? "Login" : "Create account"}
      </Button>
    </form>
  );
}

function validate(email: string, password: string, mode: Mode) {
  if (!email.trim()) {
    return "Email is required.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }

  if (!password) {
    return "Password is required.";
  }

  if (mode === "signup" && password.length < 8) {
    return "Password is too weak. Use at least 8 characters.";
  }

  return "";
}

function mapAuthError(message: string, mode: Mode) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Wrong email or password. Check your credentials and try again.";
  }

  if (normalized.includes("email not confirmed") || normalized.includes("not confirmed")) {
    return "Your email is not confirmed yet. Open the confirmation email from Supabase, then sign in.";
  }

  if (normalized.includes("already registered") || normalized.includes("already exists") || normalized.includes("user already")) {
    return "An account already exists for this email. Switch to Login.";
  }

  if (normalized.includes("weak") || normalized.includes("password should") || normalized.includes("password must")) {
    return "Password is too weak. Use at least 8 characters and avoid common passwords.";
  }

  if (normalized.includes("signup disabled")) {
    return "Signups are disabled in Supabase Auth settings.";
  }

  if (mode === "signup" && normalized.includes("rate")) {
    return "Too many signup attempts. Wait a moment and try again.";
  }

  return message;
}

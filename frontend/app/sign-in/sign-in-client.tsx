"use client";

import { Eye, EyeOff, LogIn, Mail, Phone, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setMessage("");

    const response = await fetch(
      mode === "signin" ? "/api/account/session" : "/api/account/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: form.get("email"),
          name: form.get("name"),
          phone: form.get("phone"),
          password: form.get("password"),
        }),
      },
    );
    const data = (await response.json()) as { error?: string };
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error || "Unable to continue. Please try again.");
      return;
    }

    window.dispatchEvent(new Event("paag-session-change"));
    setMessage(
      mode === "signin"
        ? "Signed in. Your account and orders are ready."
        : "Account created. Welcome to PAAG.",
    );
    window.setTimeout(() => {
      router.push(nextPath);
      router.refresh();
    }, 500);
  }

  return (
    <section className="mx-auto grid min-w-0 max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8 lg:py-12">
      <div className="surface order-2 p-5 sm:p-6 lg:order-1">
        <p className="eyebrow">Member access</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl lg:text-5xl">
          Sign in for faster checkout and order tracking.
        </h1>
        <p className="mt-5 leading-7 text-[var(--muted)]">
          Save delivery details, track PAAG orders, manage returns, keep a
          wishlist and check out faster on your next purchase.
        </p>
        <div className="mt-8 grid gap-3 text-sm text-[var(--muted)]">
          <p className="flex items-center gap-2">
            <Mail size={17} className="text-[var(--gold)]" /> Email-based sign in
          </p>
          <p className="flex items-center gap-2">
            <Phone size={17} className="text-[var(--gold)]" /> Phone number for delivery updates
          </p>
          <p className="flex items-center gap-2">
            <UserPlus size={17} className="text-[var(--gold)]" /> Create an account in one step
          </p>
        </div>
      </div>

      <form className="surface order-1 h-fit p-5 sm:p-6 lg:order-2" onSubmit={submit}>
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-1 min-[420px]:grid-cols-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              mode === "signin" ? "bg-[var(--gold)] text-black" : "text-[var(--muted)]"
            }`}
            type="button"
            onClick={() => setMode("signin")}
          >
            Sign In
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              mode === "create" ? "bg-[var(--gold)] text-black" : "text-[var(--muted)]"
            }`}
            type="button"
            onClick={() => setMode("create")}
          >
            Create Account
          </button>
        </div>

        {mode === "create" ? (
          <label className="mt-5 grid gap-2 text-sm">
            Full name
            <input className="field" name="name" placeholder="Your name" />
          </label>
        ) : null}

        <label className="mt-5 grid gap-2 text-sm">
          Email
          <input className="field" name="email" placeholder="you@example.com" required type="email" />
        </label>

        <label className="mt-4 grid gap-2 text-sm">
          Phone
          <input className="field" name="phone" placeholder="Delivery updates" />
        </label>

        <label className="mt-4 grid gap-2 text-sm">
          Password
          <span className="relative block">
            <input
              className="field w-full pr-11"
              name="password"
              placeholder="Password"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted)]"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>

        <button className="btn-primary mt-6 w-full justify-center" disabled={loading} type="submit">
          <LogIn size={17} />
          {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        {message ? (
          <p className="surface-soft mt-4 p-3 text-sm text-[var(--gold-soft)]">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

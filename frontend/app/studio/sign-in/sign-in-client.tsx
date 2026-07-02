"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function StudioSignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nextPath = searchParams.get("next") || "/studio";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").toLowerCase();
    const password = String(form.get("password") || "");

    const response = await fetch("/api/studio/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "The admin email or password is incorrect.");
      return;
    }

    router.replace(nextPath.startsWith("/studio") ? nextPath : "/studio");
  }

  return (
    <form className="mx-auto w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6" onSubmit={submit}>
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#241c12] text-[var(--gold)]">
        <LockKeyhole size={22} />
      </div>
      <h1 className="mt-5 font-serif text-4xl font-semibold">PAAG Studio</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        Sign in with your admin credentials to manage catalogue, orders and fulfilment.
      </p>
      <label className="mt-6 grid gap-2 text-sm">
        Admin email
        <input
          autoComplete="username"
          className="field"
          name="email"
          placeholder="studio@paag.in"
          required
          type="email"
        />
      </label>
      <label className="mt-4 grid gap-2 text-sm">
        Password
        <input
          autoComplete="current-password"
          className="field"
          name="password"
          placeholder="Enter admin password"
          required
          type="password"
        />
      </label>
      {error ? (
        <p className="mt-4 rounded-md border border-[#5a2b24] bg-[#2a1512] p-3 text-sm text-[#ffb39d]">
          {error}
        </p>
      ) : null}
      <button className="btn-primary mt-5 w-full justify-center" disabled={loading} type="submit">
        {loading ? "Signing in..." : "Sign in to Studio"}
      </button>
      <p className="mt-4 text-xs leading-5 text-[var(--muted-dim)]">
        Access is restricted to authorised PAAG administrators.
      </p>
    </form>
  );
}

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { SignInClient } from "./sign-in-client";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <main className="min-w-0 overflow-x-clip">
      <SiteHeader />
      <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-12 text-[var(--muted)]">Loading sign in...</div>}>
        <SignInClient />
      </Suspense>
      <SiteFooter />
    </main>
  );
}

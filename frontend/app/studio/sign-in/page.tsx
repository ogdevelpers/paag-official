import { Suspense } from "react";
import { StudioSignInClient } from "./sign-in-client";

export default function StudioSignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading sign in...</p>}>
        <StudioSignInClient />
      </Suspense>
    </main>
  );
}

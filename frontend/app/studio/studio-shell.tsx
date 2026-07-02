"use client";

import { BarChart3, Boxes, LogOut, Package, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      const response = await fetch("/api/studio/session", { credentials: "same-origin" });
      if (!active) return;

      const data = (await response.json().catch(() => null)) as { authenticated?: boolean } | null;
      if (!response.ok || !data?.authenticated) {
        const next = encodeURIComponent(pathname || "/studio");
        router.replace(`/studio/sign-in?next=${next}`);
        return;
      }

      setReady(true);
    }

    void verifySession();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!ready) return null;

  const links = [
    ["Overview", "/studio", BarChart3],
    ["Products", "/studio/products", Boxes],
    ["Orders", "/studio/orders", Package],
  ];

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <header className="nav-glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3" href="/studio">
            <img className="h-11 w-11 rounded-full ring-1 ring-[var(--gold)]" src="/brand/paag-logo-clean.png" alt="PAAG" />
            <span>
              <span className="block font-serif text-xl font-semibold text-[var(--gold-soft)]">PAAG Studio</span>
              <span className="block text-xs text-[var(--muted)]">Operations workspace</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link className="btn-secondary hidden sm:inline-flex" href="/">
              <ShoppingBag size={16} /> Storefront
            </Link>
            <button
              className="icon-button"
              title="Sign out"
              type="button"
              onClick={async () => {
                await fetch("/api/studio/session", {
                  method: "DELETE",
                  credentials: "same-origin",
                });
                router.replace("/studio/sign-in");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[230px_1fr] lg:px-8">
        <aside className="surface h-fit p-3 lg:sticky lg:top-28">
          {links.map(([label, href, Icon]) => (
            <Link
              className={`mb-1 flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold ${
                pathname === href
                  ? "bg-[var(--gold)] text-black"
                  : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              }`}
              href={href as string}
              key={href as string}
            >
              <Icon size={17} /> {label as string}
            </Link>
          ))}
          <Link className="mt-3 flex items-center gap-3 rounded-md border border-[var(--line)] px-3 py-3 text-sm font-semibold text-[var(--gold-soft)] transition hover:border-[var(--line-strong)] hover:bg-[var(--panel-2)]" href="/studio/products">
            <Plus size={17} /> Add product
          </Link>
        </aside>
        <section>{children}</section>
      </div>
    </main>
  );
}

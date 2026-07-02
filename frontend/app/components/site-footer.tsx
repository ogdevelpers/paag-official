import Link from "next/link";
import { getFooterCollections } from "@/lib/domain/navigation";
import { TRUST_SIGNALS } from "@/lib/domain/trust-signals";

const footerCollections = getFooterCollections();

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--panel-2)]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <img
              alt="PAAG"
              className="h-11 w-11 rounded-full object-cover ring-1 ring-[var(--line-strong)]"
              src="/brand/paag-logo-clean.png"
            />
            <div>
              <p className="font-serif text-xl font-semibold">PAAG</p>
              <p className="text-xs text-[var(--muted)]">By Sakshi Gupta · She is special</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--muted)]">
            Premium co-ord sets for modern Indian women — matching tops and bottoms with virtual
            try-on and secure checkout.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
            {TRUST_SIGNALS.map((signal) => (
              <span key={signal.title}>{signal.title}</span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Collections</p>
          <div className="mt-4 grid gap-2.5 text-sm text-[var(--muted)]">
            {footerCollections.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Useful links</p>
          <div className="mt-4 grid gap-2.5 text-sm text-[var(--muted)]">
            <Link href="/account">Track your order</Link>
            <Link href="/account">Return & exchange</Link>
            <Link href="/try-on">PAAG Lens try-on</Link>
            <Link href="/sign-in">Contact us</Link>
            <Link href="/shop?discount=15&sort=discount">Sale</Link>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Newsletter</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            New drops, exclusive offers, and styling notes — straight to your inbox.
          </p>
          <form action="/shop" className="mt-4 flex flex-col gap-2">
            <input
              aria-label="Email for updates"
              className="field"
              name="q"
              placeholder="Your email"
              type="email"
            />
            <button className="btn-primary justify-center" type="submit">
              Subscribe
            </button>
          </form>
          <p className="mt-4 text-xs text-[var(--muted-dim)]">UPI · Cards · Netbanking · COD</p>
        </div>
      </div>

      <div className="border-t border-[var(--line)] py-5 text-center text-xs text-[var(--muted-dim)]">
        <p>© {new Date().getFullYear()} PAAG by Sakshi Gupta. All rights reserved.</p>
      </div>
    </footer>
  );
}

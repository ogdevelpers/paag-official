"use client";

import { ChevronDown, Heart, LogOut, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { mainNav } from "@/lib/domain/navigation";
import { hydrateCartFromServer, readCart } from "./cart-store";
import { clearSession, fetchSession, type ShopperSession } from "./session-store";
import { hydrateWishlistFromServer, readWishlist } from "./wishlist-store";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [session, setSession] = useState<ShopperSession | null>(null);

  useEffect(() => {
    function syncCart() {
      setCartCount(readCart().reduce((sum, line) => sum + line.quantity, 0));
    }

    syncCart();
    window.addEventListener("paag-cart-change", syncCart);
    window.addEventListener("storage", syncCart);
    window.addEventListener("paag-session-change", syncCart);
    return () => {
      window.removeEventListener("paag-cart-change", syncCart);
      window.removeEventListener("storage", syncCart);
      window.removeEventListener("paag-session-change", syncCart);
    };
  }, []);

  useEffect(() => {
    function syncWishlist() {
      setWishlistCount(readWishlist().length);
    }

    syncWishlist();
    window.addEventListener("paag-wishlist-change", syncWishlist);
    window.addEventListener("storage", syncWishlist);
    window.addEventListener("paag-session-change", syncWishlist);
    return () => {
      window.removeEventListener("paag-wishlist-change", syncWishlist);
      window.removeEventListener("storage", syncWishlist);
      window.removeEventListener("paag-session-change", syncWishlist);
    };
  }, []);

  useEffect(() => {
    function syncSession() {
      void fetchSession().then((nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          void hydrateCartFromServer().then(() => {
            setCartCount(readCart().reduce((sum, line) => sum + line.quantity, 0));
          });
          void hydrateWishlistFromServer().then(() => {
            setWishlistCount(readWishlist().length);
          });
        }
      });
    }

    syncSession();
    window.addEventListener("paag-session-change", syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("paag-session-change", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 nav-glass">
      <div className="announcement-bar px-3 py-2 text-center sm:px-4">
        <span className="mx-auto inline-block max-w-5xl text-balance">
          SS&apos;26 co-ord edit · Free shipping above ₹5,000
        </span>
      </div>

      <div className="mx-auto flex max-w-7xl min-w-0 items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <button
          aria-label="Open menu"
          className="icon-button lg:hidden"
          type="button"
          onClick={() => setOpen(true)}
        >
          <Menu size={18} />
        </button>

        <Link className="flex shrink-0 items-center gap-2.5" href="/">
          <img
            alt="PAAG by Sakshi Gupta"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--line-strong)]"
            src="/brand/paag-logo-clean.png"
          />
          <span className="hidden leading-none sm:block">
            <span className="block font-serif text-xl font-semibold tracking-wide">PAAG</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.24em] text-[var(--muted)]">
              She is special
            </span>
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 xl:flex">
          {mainNav.map((item) =>
            item.children ? (
              <div className="nav-dropdown group relative" key={item.label}>
                <Link
                  className={`nav-link flex items-center gap-1 ${item.highlight ? "text-[var(--sale-red)]" : ""}`}
                  href={item.href}
                >
                  {item.label}
                  <ChevronDown className="opacity-60 transition group-hover:rotate-180" size={14} />
                </Link>
                <div className="nav-dropdown-panel">
                  {item.children.map((child) => (
                    <Link className="nav-dropdown-link" href={child.href} key={child.href}>
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                className={`nav-link ${item.highlight ? "text-[var(--sale-red)]" : ""}`}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ),
          )}
          <Link className="nav-link" href="/try-on">
            Try On
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <form action="/shop" className="hidden items-center lg:flex">
            <label className="sr-only" htmlFor="header-search">
              Search products
            </label>
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-1">
              <Search className="text-[var(--muted-dim)]" size={16} />
              <input
                className="w-28 bg-transparent text-sm outline-none placeholder:text-[var(--muted-dim)] xl:w-36"
                id="header-search"
                name="q"
                placeholder="Search"
              />
            </div>
          </form>
          <Link aria-label="Search" className="icon-button lg:hidden" href="/shop">
            <Search size={18} />
          </Link>
          {session ? (
            <Link
              aria-label="Account"
              className="hidden h-9 items-center gap-1.5 px-2 text-sm font-medium sm:inline-flex"
              href="/account"
            >
              <User size={16} />
              <span className="hidden md:inline">{session.name.split(" ")[0]}</span>
            </Link>
          ) : (
            <Link
              aria-label="Sign in"
              className="hidden h-9 items-center gap-1.5 px-2 text-sm font-medium sm:inline-flex"
              href="/sign-in"
            >
              <User size={16} />
              Login
            </Link>
          )}
          <Link aria-label="Wishlist" className="icon-button relative hidden sm:inline-flex" href="/wishlist">
            <Heart size={18} />
            {wishlistCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[9px] font-bold text-white">
                {wishlistCount}
              </span>
            ) : null}
          </Link>
          <Link aria-label="Shopping bag" className="icon-button relative" href="/cart">
            <ShoppingBag size={18} />
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[9px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            type="button"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute inset-y-0 left-0 w-[min(100%,20rem)] overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-serif text-2xl font-semibold">Menu</p>
              <button className="icon-button" type="button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form action="/shop" className="mb-4 flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <Search size={16} className="text-[var(--muted-dim)]" />
              <input className="w-full bg-transparent text-sm outline-none" name="q" placeholder="Search" />
            </form>
            <div className="grid gap-0.5">
              {mainNav.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center">
                    <Link
                      className={`flex-1 rounded-lg px-3 py-3 text-sm font-medium hover:bg-[var(--panel-2)] ${item.highlight ? "text-[var(--sale-red)]" : ""}`}
                      href={item.href}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                    {item.children ? (
                      <button
                        aria-label={`Expand ${item.label}`}
                        className="icon-button h-9 w-9"
                        type="button"
                        onClick={() => setExpanded(expanded === item.label ? null : item.label)}
                      >
                        <ChevronDown
                          className={`transition ${expanded === item.label ? "rotate-180" : ""}`}
                          size={16}
                        />
                      </button>
                    ) : null}
                  </div>
                  {item.children && expanded === item.label ? (
                    <div className="mb-2 ml-3 grid gap-0.5 border-l border-[var(--line)] pl-3">
                      {item.children.map((child) => (
                        <Link
                          className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                          href={child.href}
                          key={child.href}
                          onClick={() => setOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <Link
                className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-[var(--panel-2)]"
                href="/try-on"
                onClick={() => setOpen(false)}
              >
                Try On
              </Link>
              <Link
                className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-[var(--panel-2)]"
                href="/wishlist"
                onClick={() => setOpen(false)}
              >
                Wishlist {wishlistCount ? `(${wishlistCount})` : ""}
              </Link>
              {session ? (
                <>
                  <Link
                    className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-[var(--panel-2)]"
                    href="/account"
                    onClick={() => setOpen(false)}
                  >
                    Hi, {session.name.split(" ")[0]}
                  </Link>
                  <button
                    className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-[var(--panel-2)]"
                    type="button"
                    onClick={() => {
                      void clearSession().then(() => setSession(null));
                      setOpen(false);
                    }}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <Link
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-[var(--panel-2)]"
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                >
                  Login / Create account
                </Link>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

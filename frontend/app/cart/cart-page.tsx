"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { currency } from "@/lib/domain";
import type { CartLine } from "@/lib/domain";
import { hydrateCartFromServer, readCart, writeCart } from "../components/cart-store";
import { fetchSession } from "../components/session-store";

export function CartPageClient() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [mounted, setMounted] = useState(false);
  const [studioMode, setStudioMode] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    function syncCart() {
      setLines(readCart());
      setMounted(true);
    }

    function hydrateCart() {
      void fetchSession()
        .then(() => hydrateCartFromServer())
        .then(() => syncCart());
    }

    async function syncStudioSession() {
      const response = await fetch("/api/studio/session", { credentials: "same-origin" });
      setStudioMode(response.ok);
    }

    syncCart();
    hydrateCart();
    void syncStudioSession();
    window.addEventListener("paag-cart-change", syncCart);
    window.addEventListener("paag-session-change", hydrateCart);
    window.addEventListener("storage", syncCart);
    return () => {
      window.removeEventListener("paag-cart-change", syncCart);
      window.removeEventListener("paag-session-change", hydrateCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  function updateLine(index: number, quantity: number) {
    const next = lines
      .map((line, lineIndex) =>
        lineIndex === index ? { ...line, quantity: Math.max(0, quantity) } : line,
      )
      .filter((line) => line.quantity > 0);
    setLines(next);
    writeCart(next);
  }

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [lines],
  );
  const delivery = subtotal >= 5000 || subtotal === 0 ? 0 : 149;

  return (
    <section className="mx-auto grid min-w-0 max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,380px)] lg:px-8 lg:py-12">
      <div>
        <p className="eyebrow">Your bag</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">Shopping bag</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Review items before secure checkout.</p>
        <div className="mt-8 grid gap-4">
          {mounted && lines.length ? (
            lines.map((line, index) => (
              <div className="surface-soft grid gap-4 rounded-2xl p-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto]" key={`${line.productId}-${line.size}`}>
                <img alt={line.name} className="h-28 w-full rounded-xl object-cover sm:w-28" src={line.image} />
                <div>
                  <Link className="text-lg font-semibold" href={`/product/${line.slug}`}>
                    {line.name}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--muted)]">Size {line.size}</p>
                  <p className="mt-3 font-semibold">{currency.format(line.price)}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <button className="icon-button" type="button" onClick={() => updateLine(index, line.quantity - 1)}>
                      <Minus size={15} />
                    </button>
                    <span className="flex h-9 min-w-10 items-center justify-center rounded-md bg-[var(--panel-2)] text-sm font-semibold">
                      {line.quantity}
                    </span>
                    <button className="icon-button" type="button" onClick={() => updateLine(index, line.quantity + 1)}>
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
                <button className="icon-button text-[#ffb39d]" title="Remove" type="button" onClick={() => updateLine(index, 0)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : mounted && studioMode ? (
            <div className="surface p-8 text-center">
              <p className="text-lg font-semibold">PAAG Studio is active.</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Shopping bag is for storefront purchases. Use Studio to review
                orders and inventory.
              </p>
              <Link className="btn-primary mt-5 inline-flex" href="/studio">
                Go to Studio
              </Link>
            </div>
          ) : mounted ? (
            <div className="surface p-8 text-center">
              <p className="text-lg font-semibold">Your bag is empty.</p>
              <Link className="btn-primary mt-5 inline-flex" href="/shop">
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="surface p-8 text-center text-[var(--muted)]">
              Loading bag...
            </div>
          )}
        </div>
      </div>

      <aside className="surface h-fit rounded-2xl p-5 lg:sticky lg:top-28">
        <h2 className="font-serif text-2xl font-semibold">Order summary</h2>
        <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Subtotal</span>
            <span>{currency.format(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Delivery</span>
            <span>{delivery ? currency.format(delivery) : "Free"}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{currency.format(subtotal + delivery)}</span>
          </div>
        </div>
        {mounted && lines.length ? (
          <Link className="btn-primary mt-6 w-full justify-center" href="/checkout">
            Proceed to checkout
          </Link>
        ) : (
          <button
            className="btn-primary mt-6 w-full justify-center"
            disabled={!mounted}
            type="button"
            onClick={() => setMessage("Add at least one item to your bag before checkout.")}
          >
            Proceed to checkout
          </button>
        )}
        {message ? <p className="mt-3 text-center text-sm text-[var(--gold-soft)]">{message}</p> : null}
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          Free shipping above ₹5,000 · 7-day exchange
        </p>
      </aside>
    </section>
  );
}

"use client";

import { Heart, ShoppingBag, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "../../components/product-image";
import { currency, getSizeStock } from "@/lib/domain";
import type { Product } from "@/lib/domain";
import { addProduct } from "../../components/cart-store";
import { isWishlisted, toggleWishlist } from "../../components/wishlist-store";

export function ProductDetail({ product }: { product: Product }) {
  const [size, setSize] = useState(product.sizes[0]);
  const [image, setImage] = useState(product.images[0]);
  const [saved, setSaved] = useState(false);
  const [bagMessage, setBagMessage] = useState("");

  const selectedSizeStock = getSizeStock(product, size);

  function handleAddToBag() {
    const result = addProduct(product, size);
    if (!result.ok) {
      setBagMessage(result.error || "Unable to add this size to your bag.");
      return;
    }

    setBagMessage("Added to bag.");
  }

  useEffect(() => {
    function syncWishlist() {
      setSaved(isWishlisted(product.id));
    }

    syncWishlist();
    window.addEventListener("paag-wishlist-change", syncWishlist);
    window.addEventListener("storage", syncWishlist);
    return () => {
      window.removeEventListener("paag-wishlist-change", syncWishlist);
      window.removeEventListener("storage", syncWishlist);
    };
  }, [product.id]);

  return (
    <>
      <section className="mx-auto grid min-w-0 max-w-7xl gap-8 px-4 py-8 pb-28 sm:px-6 sm:pb-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-10">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[5rem_1fr]">
          <div className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col lg:overflow-visible">
            {product.images.map((item) => (
              <button
                className={`h-20 w-16 shrink-0 overflow-hidden rounded-xl border lg:h-16 lg:w-full ${
                  image === item ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/20" : "border-[var(--line)]"
                }`}
                key={item}
                type="button"
                onClick={() => setImage(item)}
              >
                <img alt={product.name} className="h-full w-full object-cover" src={item} />
              </button>
            ))}
          </div>
          <div className="order-1 overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel-2)] lg:order-2">
            {image ? (
              <img alt={product.name} className="aspect-[3/4] w-full object-cover" src={image} />
            ) : (
              <ProductImage alt={product.name} className="aspect-[3/4] w-full object-cover" product={product} />
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-wrap items-center gap-2">
            {product.badge ? <span className="chip chip-active">{product.badge}</span> : null}
            <span className="chip">
              <Star fill="currentColor" size={12} className="text-[var(--gold-soft)]" />
              {product.rating} · {product.reviews} reviews
            </span>
          </div>

          <h1 className="text-balance mt-4 font-serif text-3xl font-semibold sm:text-4xl lg:text-5xl">{product.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {product.color} · {product.fabric} · {product.fit}
          </p>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <span className="text-3xl font-semibold">{currency.format(product.price)}</span>
            {product.mrp > product.price ? (
              <>
                <span className="text-lg text-[var(--muted-dim)] line-through">{currency.format(product.mrp)}</span>
                <span className="rounded-full bg-[var(--panel-2)] px-3 py-1 text-sm font-semibold text-[var(--gold-soft)]">
                  {product.discount}% off
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-[var(--sage)]">Inclusive of taxes · Free shipping above ₹5,000</p>

          <div className="surface-soft mt-6 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Select size</p>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gold-soft)]">
                {selectedSizeStock > 10
                  ? "In stock"
                  : selectedSizeStock > 0
                    ? `${selectedSizeStock} left in ${size}`
                    : "Out of stock"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.sizes.map((item) => (
                <button
                  className={`min-w-12 rounded-full border px-4 py-2.5 text-sm font-semibold ${
                    size === item
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--cream)]"
                      : "border-[var(--line)] bg-[var(--panel)]"
                  }`}
                  key={item}
                  type="button"
                  onClick={() => {
                    setSize(item);
                    setBagMessage("");
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {bagMessage ? (
            <p className={`mt-4 text-sm ${bagMessage.includes("Added") ? "text-[var(--sage)]" : "text-[#ffb39d]"}`}>
              {bagMessage}
            </p>
          ) : null}

          <div className="mt-6 hidden gap-3 sm:grid sm:grid-cols-[1fr_auto_auto]">
            <button
              className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedSizeStock <= 0}
              type="button"
              onClick={handleAddToBag}
            >
              <ShoppingBag size={18} /> Add to bag
            </button>
            <Link className="btn-secondary justify-center" href={`/try-on?product=${product.slug}`}>
              <Sparkles size={18} /> Try on
            </Link>
            <button
              className="btn-secondary justify-center"
              type="button"
              onClick={() => setSaved(toggleWishlist(product))}
            >
              <Heart fill={saved ? "currentColor" : "none"} size={18} />
              {saved ? "Saved" : "Wishlist"}
            </button>
          </div>

          <details className="surface-soft mt-6 p-4" open>
            <summary className="cursor-pointer font-semibold">Product details</summary>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{product.description}</p>
          </details>

          <p className="mt-5 text-sm leading-7 text-[var(--muted)]">
            Delivery in 3–5 business days · 7-day exchange on eligible styles · Free shipping above
            ₹5,000 · Secure checkout with UPI, cards and COD.
          </p>
        </div>
      </section>

      <div className="mobile-atc-bar fixed inset-x-0 bottom-0 z-30 p-4 sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{product.name}</p>
            <p className="text-sm text-[var(--muted)]">{currency.format(product.price)} · Size {size}</p>
          </div>
          <button
            className="btn-primary shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedSizeStock <= 0}
            type="button"
            onClick={handleAddToBag}
          >
            Add to bag
          </button>
        </div>
      </div>
    </>
  );
}

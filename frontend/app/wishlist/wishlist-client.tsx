"use client";

import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "../components/product-image";
import { useEffect, useMemo, useState } from "react";
import { currency } from "@/lib/domain";
import type { Product } from "@/lib/domain";
import { addProduct } from "../components/cart-store";
import {
  hydrateWishlistFromServer,
  readWishlist,
  writeWishlist,
} from "../components/wishlist-store";
import { fetchSession } from "../components/session-store";

export function WishlistClient({ products }: { products: Product[] }) {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    function syncWishlist() {
      setSavedIds(readWishlist());
    }

    function hydrateWishlist() {
      void fetchSession()
        .then(() => hydrateWishlistFromServer())
        .then(() => syncWishlist());
    }

    syncWishlist();
    hydrateWishlist();
    window.addEventListener("paag-wishlist-change", syncWishlist);
    window.addEventListener("paag-session-change", hydrateWishlist);
    window.addEventListener("storage", syncWishlist);
    return () => {
      window.removeEventListener("paag-wishlist-change", syncWishlist);
      window.removeEventListener("paag-session-change", hydrateWishlist);
      window.removeEventListener("storage", syncWishlist);
    };
  }, []);

  const savedProducts = useMemo(
    () => savedIds.map((id) => products.find((product) => product.id === id)).filter(Boolean) as Product[],
    [products, savedIds],
  );

  function remove(productId: string) {
    writeWishlist(savedIds.filter((id) => id !== productId));
  }

  return (
    <section className="mx-auto min-w-0 max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="eyebrow">Saved wardrobe</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl lg:text-5xl">Wishlist</h1>
          <p className="mt-4 max-w-2xl text-[var(--muted)]">
            Keep PAAG pieces aside, compare styles and move them to your bag when
            you are ready.
          </p>
        </div>
        <Link className="btn-secondary w-fit" href="/shop">
          Continue shopping
        </Link>
      </div>

      {savedProducts.length ? (
        <div className="mt-8 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {savedProducts.map((product) => (
            <article
              className="grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]"
              key={product.id}
            >
              <Link className="aspect-[4/5] overflow-hidden" href={`/product/${product.slug}`}>
                <ProductImage
                  alt={product.name}
                  className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  product={product}
                />
              </Link>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
                      {product.badge}
                    </p>
                    <Link href={`/product/${product.slug}`}>
                      <h2 className="mt-1 text-lg font-semibold">{product.name}</h2>
                    </Link>
                  </div>
                  <button
                    aria-label={`Remove ${product.name} from wishlist`}
                    className="icon-button text-[#ffb39d]"
                    title="Remove"
                    type="button"
                    onClick={() => remove(product.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {product.color} · {product.fabric}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="font-semibold">{currency.format(product.price)}</p>
                  <button
                    className="btn-primary px-3 py-2"
                    type="button"
                    onClick={() => addProduct(product, product.sizes[0])}
                  >
                    <ShoppingBag size={16} /> Add
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
          <Heart className="mx-auto text-[var(--gold)]" size={28} />
          <h2 className="mt-4 text-2xl font-semibold">No saved styles yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Tap the heart icon on any PAAG product to save it here.
          </p>
          <Link className="btn-primary mt-5" href="/shop">
            Browse styles
          </Link>
        </div>
      )}
    </section>
  );
}

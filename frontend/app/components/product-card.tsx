"use client";

import { Heart, ShoppingBag, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { useEffect, useState } from "react";
import { currency } from "@/lib/domain";
import type { Product } from "@/lib/domain";
import { addProduct } from "./cart-store";
import { isWishlisted, toggleWishlist } from "./wishlist-store";

type ProductCardProps = {
  product: Product;
  showDiscountBadge?: boolean;
  variant?: "grid" | "compact";
};

export function ProductCard({
  product,
  showDiscountBadge = true,
  variant = "grid",
}: ProductCardProps) {
  const [saved, setSaved] = useState(false);

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

  if (variant === "compact") {
    return (
      <article className="product-card-compact group min-w-0">
        <div className="relative">
          <Link className="block aspect-[3/4] overflow-hidden bg-[var(--panel-2)]" href={`/product/${product.slug}`}>
            <ProductImage
              alt={product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              product={product}
            />
          </Link>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
            {product.badge ? (
              <span className="rounded-full bg-white/95 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em]">
                {product.badge}
              </span>
            ) : (
              <span />
            )}
            {showDiscountBadge && product.discount ? (
              <span className="rounded-full bg-[var(--ink)] px-2 py-0.5 text-[0.6rem] font-bold text-[var(--cream)]">
                {product.discount}% off
              </span>
            ) : null}
          </div>
          <button
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`icon-button absolute bottom-2 right-2 h-9 w-9 bg-white/95 ${saved ? "border-[var(--gold)] text-[var(--gold-soft)]" : ""}`}
            type="button"
            onClick={() => setSaved(toggleWishlist(product))}
          >
            <Heart fill={saved ? "currentColor" : "none"} size={15} />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <Link href={`/product/${product.slug}`}>
            <h3 className="line-clamp-2 font-serif text-base leading-snug">{product.name}</h3>
          </Link>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold">{currency.format(product.price)}</span>
            {product.mrp > product.price ? (
              <span className="text-xs text-[var(--muted-dim)] line-through">
                {currency.format(product.mrp)}
              </span>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="product-card group min-w-0">
      <div className="relative">
        <Link className="block aspect-[3/4] overflow-hidden bg-[var(--panel-2)]" href={`/product/${product.slug}`}>
          <ProductImage
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            product={product}
          />
        </Link>
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {product.badge ? (
            <span className="rounded-full bg-[var(--panel)]/95 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--text)] shadow-sm">
              {product.badge}
            </span>
          ) : (
            <span />
          )}
          {showDiscountBadge && product.discount ? (
            <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[0.65rem] font-bold text-[var(--cream)]">
              {product.discount}% off
            </span>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 gap-2 p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            className="btn-primary flex-1 justify-center py-2.5 text-xs"
            type="button"
            onClick={() => addProduct(product, product.sizes[0])}
          >
            <ShoppingBag size={14} /> Quick add
          </button>
          <Link
            aria-label={`Try on ${product.name}`}
            className="icon-button bg-[var(--panel)]"
            href={`/try-on?product=${product.slug}`}
          >
            <Sparkles size={16} />
          </Link>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted-dim)]">
              {product.category}
            </p>
            <Link href={`/product/${product.slug}`}>
              <h3 className="mt-1 line-clamp-2 font-serif text-lg leading-snug">{product.name}</h3>
            </Link>
          </div>
          <button
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`icon-button shrink-0 ${saved ? "border-[var(--gold)] text-[var(--gold-soft)]" : ""}`}
            type="button"
            onClick={() => setSaved(toggleWishlist(product))}
          >
            <Heart fill={saved ? "currentColor" : "none"} size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-2)] px-2 py-1">
            <Star fill="currentColor" size={11} className="text-[var(--gold-soft)]" />
            {product.rating}
          </span>
          <span>{product.color}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold">{currency.format(product.price)}</span>
          {product.mrp > product.price ? (
            <span className="text-sm text-[var(--muted-dim)] line-through">
              {currency.format(product.mrp)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

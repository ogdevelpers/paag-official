"use client";

import type { Product } from "@/lib/domain";
import { isServerSyncEnabled } from "./session-store";

const key = "paag-wishlist";

function uniqueProductIds(productIds: string[]) {
  return Array.from(new Set(productIds.filter(Boolean)));
}

function dispatchWishlistChange() {
  window.dispatchEvent(new Event("paag-wishlist-change"));
}

function wishlistSignature(productIds: string[]) {
  return uniqueProductIds(productIds).sort().join("|");
}

async function persistWishlist(productIds: string[]) {
  if (!isServerSyncEnabled()) return;

  try {
    const response = await fetch("/api/account/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ productIds: uniqueProductIds(productIds) }),
    });

    if (!response.ok) return;

    const data = (await response.json()) as { productIds?: string[] };
    if (data.productIds && wishlistSignature(data.productIds) !== wishlistSignature(readWishlist())) {
      writeWishlist(data.productIds, { persist: false });
    }
  } catch {
    // Guest wishlists remain local when the account API is unavailable.
  }
}

export function readWishlist(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? (JSON.parse(stored) as string[]) : [];
    return uniqueProductIds(parsed);
  } catch {
    return [];
  }
}

export function writeWishlist(productIds: string[], options: { persist?: boolean } = {}) {
  if (typeof window === "undefined") return;

  const uniqueIds = uniqueProductIds(productIds);
  window.localStorage.setItem(key, JSON.stringify(uniqueIds));
  dispatchWishlistChange();

  if (options.persist !== false) {
    void persistWishlist(uniqueIds);
  }
}

export function isWishlisted(productId: string) {
  return readWishlist().includes(productId);
}

export function toggleWishlist(product: Product) {
  const current = readWishlist();
  const next = current.includes(product.id)
    ? current.filter((item) => item !== product.id)
    : [product.id, ...current];

  writeWishlist(next);
  return next.includes(product.id);
}

export async function hydrateWishlistFromServer() {
  if (!isServerSyncEnabled()) return readWishlist();

  try {
    const response = await fetch("/api/account/wishlist", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) return readWishlist();

    const data = (await response.json()) as { productIds?: string[] };
    const serverIds = uniqueProductIds(data.productIds || []);
    const localIds = readWishlist();
    const nextIds =
      wishlistSignature(serverIds) === wishlistSignature(localIds)
        ? serverIds
        : uniqueProductIds([...serverIds, ...localIds]);

    writeWishlist(nextIds, { persist: false });

    if (wishlistSignature(nextIds) !== wishlistSignature(serverIds)) {
      await persistWishlist(nextIds);
    }

    return nextIds;
  } catch {
    return readWishlist();
  }
}

"use client";

import type { CartLine, Product } from "@/lib/domain";
import { getSizeStock } from "@/lib/domain";
import { isServerSyncEnabled } from "./session-store";

const key = "paag-cart";

function dispatchCartChange() {
  window.dispatchEvent(new Event("paag-cart-change"));
}

function cartSignature(lines: CartLine[]) {
  return JSON.stringify(
    lines
      .map((line) => ({
        productId: line.productId,
        size: line.size,
        quantity: line.quantity,
      }))
      .sort((a, b) => `${a.productId}-${a.size}`.localeCompare(`${b.productId}-${b.size}`)),
  );
}

function mergeCartLines(left: CartLine[], right: CartLine[]) {
  const merged = new Map<string, CartLine>();

  for (const line of [...left, ...right]) {
    const keyValue = `${line.productId}-${line.size}`;
    const existing = merged.get(keyValue);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + line.quantity, 10);
    } else {
      merged.set(keyValue, { ...line, quantity: Math.min(Math.max(line.quantity, 1), 10) });
    }
  }

  return Array.from(merged.values());
}

async function persistCart(lines: CartLine[]) {
  if (!isServerSyncEnabled()) return;

  try {
    const response = await fetch("/api/account/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ lines }),
    });

    if (!response.ok) return;

    const data = (await response.json()) as { lines?: CartLine[] };
    if (data.lines && cartSignature(data.lines) !== cartSignature(readCart())) {
      writeCart(data.lines, { persist: false });
    }
  } catch {
    // Guest carts remain local when the account API is unavailable.
  }
}

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[], options: { persist?: boolean } = {}) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(lines));
  dispatchCartChange();

  if (options.persist !== false) {
    void persistCart(lines);
  }
}

export function clearCart() {
  writeCart([]);
}

export function addProduct(
  product: Product,
  size: string,
  quantity = 1,
): { ok: boolean; error?: string } {
  const available = getSizeStock(product, size);
  if (available <= 0) {
    return { ok: false, error: `${product.name} is out of stock in size ${size}.` };
  }

  const lines = readCart();
  const existing = lines.find(
    (line) => line.productId === product.id && line.size === size,
  );
  const nextQuantity = (existing?.quantity || 0) + quantity;

  if (nextQuantity > available) {
    return {
      ok: false,
      error: `Only ${available} left in size ${size} for ${product.name}.`,
    };
  }

  if (existing) {
    existing.quantity = Math.min(nextQuantity, 10);
  } else {
    lines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0],
      size,
      price: product.price,
      quantity: Math.min(Math.max(quantity, 1), 10),
    });
  }

  writeCart(lines);
  return { ok: true };
}

export async function hydrateCartFromServer() {
  if (!isServerSyncEnabled()) return readCart();

  try {
    const response = await fetch("/api/account/cart", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) return readCart();

    const data = (await response.json()) as { lines?: CartLine[] };
    const serverLines = data.lines || [];
    const localLines = readCart();
    const nextLines =
      cartSignature(serverLines) === cartSignature(localLines)
        ? serverLines
        : mergeCartLines(serverLines, localLines);

    writeCart(nextLines, { persist: false });

    if (cartSignature(nextLines) !== cartSignature(serverLines)) {
      await persistCart(nextLines);
    }

    return nextLines;
  } catch {
    return readCart();
  }
}

"use client";

import type { Order } from "@/lib/domain";

const key = "paag-order-confirmation";

export function saveOrderConfirmation(order: Order) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, JSON.stringify(order));
}

export function readOrderConfirmation(): Order | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.sessionStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Order) : null;
  } catch {
    return null;
  }
}

export function clearOrderConfirmation() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
}

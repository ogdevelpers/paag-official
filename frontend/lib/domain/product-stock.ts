import type { Product } from "./types";

export type SizeStock = Record<string, number>;

export function getTotalStockFromMap(sizeStock: SizeStock) {
  return Object.values(sizeStock).reduce((sum, quantity) => sum + quantity, 0);
}

export function parseSizeStock(raw: unknown, sizes: string[], legacyStock = 0): SizeStock {
  const parsed: SizeStock = {};

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const quantity = Number(value);
      if (Number.isFinite(quantity) && quantity >= 0) {
        parsed[key] = Math.min(Math.round(quantity), 10_000);
      }
    }
  }

  for (const size of sizes) {
    if (parsed[size] === undefined) {
      parsed[size] = 0;
    }
  }

  for (const key of Object.keys(parsed)) {
    if (!sizes.includes(key)) {
      delete parsed[key];
    }
  }

  if (getTotalStockFromMap(parsed) === 0 && legacyStock > 0 && sizes.length) {
    parsed[sizes[0]] = Math.min(Math.round(legacyStock), 10_000);
  }

  return parsed;
}

export function getTotalStock(product: Pick<Product, "sizeStock" | "stock">) {
  const total = getTotalStockFromMap(product.sizeStock || {});
  return total > 0 ? total : product.stock;
}

export function getSizeStock(product: Pick<Product, "sizeStock" | "stock" | "sizes">, size: string) {
  const fromMap = product.sizeStock?.[size];
  if (fromMap !== undefined) return fromMap;
  if (product.stock > 0 && product.sizes[0] === size) return product.stock;
  return 0;
}

export function hasSizeStock(product: Product, size: string, quantity: number) {
  if (!product.sizes.includes(size)) return false;
  return getSizeStock(product, size) >= quantity;
}

export function formatSizeStockSummary(product: Product) {
  return product.sizes
    .map((size) => `${size}: ${getSizeStock(product, size)}`)
    .join(" · ");
}

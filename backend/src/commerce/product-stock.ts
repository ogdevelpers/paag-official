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

export function normalizeSizeStock(
  sizes: string[],
  sizeStock: SizeStock | undefined,
  legacyStock = 0,
): SizeStock {
  return parseSizeStock(sizeStock, sizes, legacyStock);
}

export function getSizeStock(sizeStock: SizeStock, size: string) {
  return sizeStock[size] ?? 0;
}

export function getProductSizeStock(product: {
  sizeStock: SizeStock;
  sizes: string[];
  stock: number;
}) {
  return parseSizeStock(product.sizeStock, product.sizes, product.stock);
}

export function getProductTotalStock(product: {
  sizeStock: SizeStock;
  sizes: string[];
  stock: number;
}) {
  return getTotalStockFromMap(getProductSizeStock(product));
}

export function getProductSizeStockCount(
  product: { sizeStock: SizeStock; sizes: string[]; stock: number },
  size: string,
) {
  return getSizeStock(getProductSizeStock(product), size);
}

export function hasSizeStock(
  product: { sizes: string[]; sizeStock: SizeStock },
  size: string,
  quantity: number,
) {
  if (!product.sizes.includes(size)) return false;
  return getSizeStock(product.sizeStock, size) >= quantity;
}

export function applySizeStockDelta(sizeStock: SizeStock, size: string, delta: number): SizeStock {
  const next = { ...sizeStock };
  next[size] = Math.max(0, Math.min(10_000, (next[size] ?? 0) + delta));
  return next;
}

export function buildSizeStockFromPayload(
  sizes: string[],
  payload: Record<string, unknown>,
  legacyStock = 0,
): SizeStock {
  if (payload.sizeStock && typeof payload.sizeStock === "object" && !Array.isArray(payload.sizeStock)) {
    return parseSizeStock(payload.sizeStock, sizes, legacyStock);
  }

  const fromFields: SizeStock = {};
  for (const size of sizes) {
    const quantity = Number(payload[`sizeStock.${size}`] ?? 0);
    fromFields[size] = Number.isFinite(quantity)
      ? Math.max(0, Math.min(10_000, Math.round(quantity)))
      : 0;
  }

  if (getTotalStockFromMap(fromFields) > 0) {
    return parseSizeStock(fromFields, sizes);
  }

  return parseSizeStock({}, sizes, legacyStock);
}

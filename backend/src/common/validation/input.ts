import type { Order, Product } from "../../domain";
import {
  buildSizeStockFromPayload,
  getTotalStockFromMap,
} from "../../commerce/product-stock";

const validStatuses: Order["status"][] = [
  "Placed",
  "Packed",
  "Shipped",
  "Delivered",
  "Returned",
  "Failed",
];

const defaultSizes = ["XS", "S", "M", "L", "XL", "XXL"];

function text(value: unknown, fallback = "", maxLength = 160) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function optionalImageUrl(value: unknown) {
  const raw = text(value, "", 500);
  if (!raw) return null;

  if (raw.startsWith("/api/media/") || raw.startsWith("/brand/")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseStringList(value: unknown, maxItems = 12, maxLength = 80): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  const items: string[] = [];

  for (const entry of rawValues) {
    const item = text(entry, "", maxLength).toLowerCase();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    items.push(item);
    if (items.length >= maxItems) break;
  }

  return items;
}

function parseSizes(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  const items: string[] = [];

  for (const entry of rawValues) {
    const item = text(entry, "", 12);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= 8) break;
  }

  return items;
}

function parseCreatedAt(value: unknown) {
  const raw = text(value, "", 40);
  if (!raw) return undefined;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function parseOptionalDiscount(value: unknown, price: number, mrp: number) {
  if (value === undefined || value === null || value === "") {
    return mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  }

  return numberInRange(value, 0, 0, 95);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function parseImages(payload: Record<string, unknown>) {
  if (Array.isArray(payload.images)) {
    return payload.images.map(optionalImageUrl).filter((url): url is string => Boolean(url));
  }

  const single = optionalImageUrl(payload.image);
  return single ? [single] : [];
}

export function parseProductPayload(payload: Record<string, unknown>) {
  const id = text(payload.id, "", 80);
  const name = text(payload.name, "", 120);
  const color = text(payload.color, "", 80);
  const price = numberInRange(payload.price, 0, 1, 200000);
  const mrp = numberInRange(payload.mrp, price, price, 300000);
  const images = parseImages(payload);

  if (!id) {
    return { error: "Product id is required." };
  }

  if (!name) {
    return { error: "Product name is required." };
  }

  if (!color) {
    return { error: "Product color is required." };
  }

  if (!price) {
    return { error: "A valid selling price is required." };
  }

  if (!images.length) {
    return { error: "Upload at least one product image." };
  }

  const sizes = parseSizes(payload.sizes);
  const tags = parseStringList(payload.tags, 12, 40);
  const discount = parseOptionalDiscount(payload.discount, price, mrp);
  const legacyStock = numberInRange(payload.stock, 0, 0, 10000);
  const sizeStock = buildSizeStockFromPayload(
    sizes.length ? sizes : defaultSizes,
    payload,
    legacyStock,
  );
  const stock = getTotalStockFromMap(sizeStock);

  const product: Partial<Product> = {
    id,
    slug: text(payload.slug, "", 80) || slugify(name),
    name,
    category: text(payload.category, "Co-ords", 80),
    price,
    mrp,
    discount,
    images,
    color,
    fabric: text(payload.fabric, "", 120),
    fit: text(payload.fit, "", 80),
    sizeStock,
    stock,
    badge: text(payload.badge, "", 80),
    description: text(payload.description, "", 2000),
    sizes: sizes.length ? sizes : defaultSizes,
    tags,
    rating: Math.round(numberInRange(payload.rating, 0, 0, 5) * 10) / 10,
    reviews: numberInRange(payload.reviews, 0, 0, 100000),
    status: payload.status === "draft" ? "draft" : "live",
    createdAt: parseCreatedAt(payload.createdAt),
  };

  return { product };
}

export function parseOrderStatus(value: unknown) {
  return validStatuses.includes(value as Order["status"]) ? (value as Order["status"]) : null;
}

export function cleanCheckoutText(value: unknown, maxLength = 160) {
  return text(value, "", maxLength);
}

export function parseAddressPayload(payload: Record<string, unknown>) {
  const label = text(payload.label, "Home", 40);
  const name = text(payload.name, "", 120);
  const phone = text(payload.phone, "", 30);
  const address = text(payload.address, "", 400);
  const city = text(payload.city, "", 100);

  if (!name) {
    return { error: "Recipient name is required." };
  }

  if (!phone) {
    return { error: "Phone number is required." };
  }

  if (!address) {
    return { error: "Address is required." };
  }

  if (!city) {
    return { error: "City is required." };
  }

  return {
    address: { label, name, phone, address, city },
  };
}

import type { Product } from "../domain";
import { getTotalStockFromMap, normalizeSizeStock } from "./product-stock";

export function createProductSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function normalizeProductInput(input: Partial<Product>): Product {
  const now = new Date().toISOString();
  const name = input.name?.trim() || "Untitled PAAG Piece";
  const slug = input.slug || createProductSlug(name);
  const price = Number(input.price || 0);
  const mrp = Number(input.mrp || input.price || 0);
  const images = input.images?.filter(Boolean) || [];

  if (!images.length) {
    throw new Error("At least one product image is required.");
  }

  const sizes = input.sizes?.length ? input.sizes : ["XS", "S", "M", "L", "XL"];
  const sizeStock = normalizeSizeStock(sizes, input.sizeStock, Number(input.stock ?? 0));

  return {
    id: input.id?.trim() || `prd-${Date.now()}`,
    slug,
    name,
    category: input.category || "Co-ords",
    price,
    mrp,
    discount:
      input.discount !== undefined
        ? Number(input.discount)
        : mrp > price
          ? Math.round((1 - price / mrp) * 100)
          : 0,
    images,
    color: input.color || "",
    sizes,
    sizeStock,
    stock: getTotalStockFromMap(sizeStock),
    badge: input.badge || "",
    fabric: input.fabric || "",
    fit: input.fit || "",
    rating: Number(input.rating || 0),
    reviews: Number(input.reviews || 0),
    description: input.description || "",
    tags: input.tags?.length ? input.tags : [],
    status: input.status || "live",
    createdAt: input.createdAt || now,
  };
}

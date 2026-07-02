import { headers } from "next/headers";
import type { Product } from "@/lib/domain";

async function apiBase() {
  const headerList = await headers();
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
}

export async function listCatalogProducts(): Promise<Product[]> {
  const response = await fetch(`${await apiBase()}/api/products`, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { products?: Product[] };
  return data.products ?? [];
}

export async function getProductDetail(slug: string) {
  const response = await fetch(`${await apiBase()}/api/products/${slug}`, { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as { product?: Product };
  if (!data.product) return null;

  const products = await listCatalogProducts();
  const recommendations = products.filter((item) => item.slug !== slug).slice(0, 4);
  return { product: data.product, recommendations };
}

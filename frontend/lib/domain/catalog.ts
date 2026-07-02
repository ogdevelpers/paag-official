import type { Product } from "./types";
import { getSizeStock, getTotalStock } from "./product-stock";
import { getAllCategoryLabels, getLiveCategoryLabels } from "./store-config";

export const categories = getAllCategoryLabels();

export const liveCategories = getLiveCategoryLabels();

export const sizes = ["XS", "S", "M", "L", "XL", "XXL", "Free"];

export const NEW_IN_WINDOW_DAYS = 30;
export const SALE_DISCOUNT_THRESHOLD = 15;

export function isNewInProduct(product: Product, now = Date.now()) {
  const windowStart = now - NEW_IN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return (
    product.badge === "New" ||
    product.tags.includes("new-drop") ||
    new Date(product.createdAt).getTime() >= windowStart
  );
}

export function getHomeNewArrivals(products: Product[], limit = 12) {
  return products
    .filter((product) => isNewInProduct(product) && product.discount < SALE_DISCOUNT_THRESHOLD)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function filterCatalogProducts(
  products: Product[],
  filters: {
    availability: string;
    category: string;
    discount: string;
    maxPrice: number;
    minPrice: number;
    query: string;
    size: string;
    sort: string;
    style?: string;
  },
) {
  return products
    .filter((product) => {
      const matchesQuery =
        !filters.query ||
        [
          product.name,
          product.category,
          product.color,
          product.fabric,
          product.fit,
          product.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.query);
      const matchesCategory =
        filters.category === "All"
          ? getLiveCategoryLabels().includes(product.category)
          : filters.category === "New In"
            ? isNewInProduct(product)
            : product.category === filters.category;
      const style = filters.style?.toLowerCase() || "";
      const matchesStyle =
        !style ||
        product.fit.toLowerCase().includes(style) ||
        product.tags.some((tag) => tag.toLowerCase().includes(style)) ||
        product.fabric.toLowerCase().includes(style) ||
        (style === "festive" && product.tags.some((tag) => ["festive", "wedding", "sangeet"].includes(tag))) ||
        (style === "daily" && product.tags.some((tag) => ["daily", "comfort", "casual"].includes(tag))) ||
        (style === "work" && product.tags.some((tag) => ["work", "office"].includes(tag))) ||
        (style === "casual" && product.tags.some((tag) => ["casual", "day-out"].includes(tag))) ||
        (style === "embroidered" && product.name.toLowerCase().includes("embroidered")) ||
        (style === "printed" && product.name.toLowerCase().includes("printed")) ||
        (style === "solid" && product.tags.includes("solid"));
      const matchesSize = filters.size === "All" || product.sizes.includes(filters.size);
      const matchesMinPrice = !filters.minPrice || product.price >= filters.minPrice;
      const matchesMaxPrice = !filters.maxPrice || product.price <= filters.maxPrice;
      const matchesAvailability =
        filters.availability !== "in-stock" ||
        (filters.size !== "All"
          ? getSizeStock(product, filters.size) > 0
          : getTotalStock(product) > 0);
      const matchesDiscount =
        filters.discount === "all" || product.discount >= Number(filters.discount);
      return (
        matchesQuery &&
        matchesCategory &&
        matchesStyle &&
        matchesSize &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesAvailability &&
        matchesDiscount
      );
    })
    .sort((a, b) => {
      if (filters.sort === "price-low") return a.price - b.price;
      if (filters.sort === "price-high") return b.price - a.price;
      if (filters.sort === "new") return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "discount") return b.discount - a.discount;
      if (filters.sort === "reviews") return b.reviews - a.reviews;
      return b.rating - a.rating;
    });
}

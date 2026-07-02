"use client";

import { useEffect, useState } from "react";
import type { Metrics, Order, Product } from "@/lib/domain";
import { getTotalStock } from "@/lib/domain";

export function useStudioData() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [productsResponse, ordersResponse] = await Promise.all([
      fetch("/api/products?scope=studio", { credentials: "same-origin" }),
      fetch("/api/orders", { credentials: "same-origin" }),
    ]);

    if (productsResponse.status === 401 || ordersResponse.status === 401) {
      setProducts([]);
      setOrders([]);
      setMetrics({ revenue: 0, orders: 0, liveProducts: 0, lowStock: 0 });
      setLoading(false);
      return;
    }

    const productsData = (await productsResponse.json()) as { products?: Product[] };
    const ordersData = (await ordersResponse.json()) as {
      orders?: Order[];
      metrics?: Metrics;
    };

    setProducts(productsData.products || []);
    setOrders(ordersData.orders || []);
    setMetrics(ordersData.metrics || {
      revenue: 0,
      orders: 0,
      liveProducts: (productsData.products || []).filter(
        (product: Product) => product.status === "live",
      ).length,
      lowStock: (productsData.products || []).filter(
        (product: Product) => getTotalStock(product) <= 10,
      ).length,
    });
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, []);

  return { loading, metrics, orders, products, refresh };
}

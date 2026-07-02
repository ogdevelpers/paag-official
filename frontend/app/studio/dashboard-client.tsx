"use client";

import { BarChart3, Boxes, Package, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "../components/product-image";
import { currency, formatDate, formatSizeStockSummary, getTotalStock } from "@/lib/domain";
import { StudioShell } from "./studio-shell";
import { useStudioData } from "./studio-data";

export function StudioDashboard() {
  const { loading, metrics, orders, products } = useStudioData();

  return (
    <StudioShell>
      <div>
        <p className="eyebrow">Overview</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold">Store performance</h1>
      </div>
      {loading ? (
        <p className="mt-8 text-[var(--muted)]">Loading workspace...</p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {(
              [
                ["Revenue", currency.format(metrics?.revenue || 0), TrendingUp],
                ["Orders", String(metrics?.orders || 0), Package],
                ["Live styles", String(metrics?.liveProducts || 0), Boxes],
                ["Low stock", String(metrics?.lowStock || 0), BarChart3],
              ] satisfies [string, string, LucideIcon][]
            ).map(([label, value, Icon]) => (
              <div className="surface-soft p-5" key={label}>
                <Icon className="text-[var(--gold)]" size={20} />
                <p className="mt-5 text-2xl font-semibold">{value}</p>
                <p className="text-sm text-[var(--muted)]">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Recent orders</h2>
                <Link className="text-sm font-semibold text-[var(--gold-soft)]" href="/studio/orders">
                  View all
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {orders.slice(0, 4).map((order) => (
                  <div className="rounded-md bg-[var(--panel-2)] p-4" key={order.id}>
                    <div className="flex justify-between gap-4">
                      <p className="font-semibold">{order.id}</p>
                      <p className="font-semibold">{currency.format(order.total)}</p>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {order.customerName} · {order.status} · {order.paymentStatus} · {formatDate(order.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section className="surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Low stock watch</h2>
                <Link className="text-sm font-semibold text-[var(--gold-soft)]" href="/studio/products">
                  Manage
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {products
                  .filter((product) => getTotalStock(product) <= 10)
                  .map((product) => (
                    <div className="flex items-center gap-3 rounded-md bg-[var(--panel-2)] p-3" key={product.id}>
                      <ProductImage
                        alt={product.name}
                        className="h-14 w-12 rounded-md object-cover"
                        product={product}
                      />
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {getTotalStock(product)} total · {formatSizeStockSummary(product)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </>
      )}
    </StudioShell>
  );
}

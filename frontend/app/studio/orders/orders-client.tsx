"use client";

import { currency, formatDate } from "@/lib/domain";
import type { Order } from "@/lib/domain";
import { StudioShell } from "../studio-shell";
import { useStudioData } from "../studio-data";

const statuses: Order["status"][] = ["Placed", "Packed", "Shipped", "Delivered", "Returned", "Failed"];

export function OrdersClient() {
  const { loading, orders, refresh } = useStudioData();

  async function update(id: string, status: Order["status"]) {
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ status }),
    });
    refresh();
  }

  return (
    <StudioShell>
      <div>
        <p className="eyebrow">Fulfilment</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold">Orders</h1>
      </div>
      <section className="mt-8 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading orders...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Buyer</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr className="border-t border-[var(--line)] align-top" key={order.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{order.id}</p>
                      <p className="text-xs text-[var(--muted)]">{formatDate(order.createdAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{order.customerName}</p>
                      <p className="text-xs text-[var(--muted)]">{order.email}</p>
                      <p className="text-xs text-[var(--muted)]">{order.city}</p>
                    </td>
                    <td className="px-5 py-4">
                      {order.lines.map((line) => (
                        <p key={`${line.productId}-${line.size}`}>
                          {line.name} · {line.size} x {line.quantity}
                        </p>
                      ))}
                    </td>
                    <td className="px-5 py-4 font-semibold">{currency.format(order.total)}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{order.paymentStatus}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {order.paymentMode}
                        {order.paymentProvider ? ` · ${order.paymentProvider}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <select className="field" value={order.status} onChange={(event) => update(order.id, event.target.value as Order["status"])}>
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </StudioShell>
  );
}

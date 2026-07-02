"use client";

import { CheckCircle2, Package, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { currency, formatDate } from "@/lib/domain";
import type { Order } from "@/lib/domain";
import { readOrderConfirmation } from "../../components/order-confirmation-store";

function paymentStatusLabel(order: Order) {
  if (order.paymentMode === "Cash on Delivery") {
    return "Pay on delivery";
  }

  if (order.paymentStatus === "paid") {
    return "Paid";
  }

  if (order.paymentStatus === "pending") {
    return "Payment pending";
  }

  return order.paymentStatus;
}

export function OrderSuccessClient() {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const confirmed = readOrderConfirmation();
    if (!confirmed) {
      router.replace("/shop");
      return;
    }

    setOrder(confirmed);
    setMounted(true);
  }, [router]);

  if (!mounted || !order) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-[var(--muted)] sm:px-6 lg:px-8">
        Loading order confirmation...
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="surface p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#edf8ef] text-[#2f7a45]">
            <CheckCircle2 size={34} />
          </span>
          <p className="eyebrow mt-6">Order confirmed</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">Order placed successfully</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--muted)]">
            Thank you for shopping with PAAG. We&apos;ve received your order and will start processing it
            shortly.
          </p>
        </div>

        <div className="mt-8 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-dim)]">Order number</p>
            <p className="mt-2 font-serif text-2xl font-semibold">{order.id}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-dim)]">Placed on</p>
            <p className="mt-2 font-semibold">{formatDate(order.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-dim)]">Payment</p>
            <p className="mt-2 font-semibold">{order.paymentMode}</p>
            <p className="text-sm text-[var(--muted)]">{paymentStatusLabel(order)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-dim)]">Order status</p>
            <p className="mt-2 font-semibold">{order.status}</p>
            <p className="text-sm text-[var(--muted)]">Estimated delivery in 3–5 business days</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Truck size={16} className="text-[var(--gold)]" />
              Delivery address
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {order.customerName}
              <br />
              {order.address}
              <br />
              {order.city}
              <br />
              {order.phone}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Package size={16} className="text-[var(--gold)]" />
              Contact
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {order.email}
              <br />
              Confirmation sent to this email.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--line)] pt-6">
          <h2 className="font-serif text-2xl font-semibold">Items ordered</h2>
          <div className="mt-4 grid gap-4">
            {order.lines.map((line) => (
              <div className="grid grid-cols-[60px_1fr_auto] gap-3" key={`${line.productId}-${line.size}`}>
                {line.image ? (
                  <img alt={line.name} className="h-16 w-14 rounded-md object-cover" src={line.image} />
                ) : (
                  <div className="h-16 w-14 rounded-md bg-[var(--panel-2)]" />
                )}
                <div>
                  <p className="text-sm font-semibold">{line.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Size {line.size} · Qty {line.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">{currency.format(line.price * line.quantity)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-[var(--line)] pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Subtotal</span>
            <span>{currency.format(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Delivery</span>
            <span>{order.delivery ? currency.format(order.delivery) : "Free"}</span>
          </div>
          {order.discount ? (
            <div className="flex justify-between text-[var(--gold-soft)]">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
              <span>-{currency.format(order.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-semibold">
            <span>Total paid</span>
            <span>{currency.format(order.total)}</span>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link className="btn-primary flex-1 justify-center" href="/shop">
            Continue shopping
          </Link>
          <Link className="btn-secondary flex-1 justify-center" href="/account">
            View my orders
          </Link>
        </div>
      </div>
    </section>
  );
}

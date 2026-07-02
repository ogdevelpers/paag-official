"use client";

import { CreditCard, X } from "lucide-react";
import { currency } from "@/lib/domain";
import type { Order } from "@/lib/domain";
import type { PaymentInit } from "@/lib/payments/order-payment";
import { paymentProviderLabel } from "@/lib/payments/order-payment";

type OnlinePaymentModalProps = {
  loading: boolean;
  mode: string;
  onCancel: () => void;
  onPay: () => void;
  order: Order;
  payment: PaymentInit;
};

export function OnlinePaymentModal({
  loading,
  mode,
  onCancel,
  onPay,
  order,
  payment,
}: OnlinePaymentModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div aria-modal="true" className="surface w-full max-w-md p-5" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[#241c12] text-[var(--gold)]">
              <CreditCard size={20} />
            </span>
            <div>
              <p className="text-sm text-[var(--muted)]">PAAG payment gateway</p>
              <h2 className="text-2xl font-semibold">{mode} payment</h2>
            </div>
          </div>
          <button
            aria-label="Close payment"
            className="icon-button"
            disabled={loading}
            title="Close"
            type="button"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-4">
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-[var(--muted)]">Order</span>
            <span className="font-semibold">{order.id}</span>
          </div>
          <div className="mt-3 flex justify-between gap-4 text-sm">
            <span className="text-[var(--muted)]">Amount</span>
            <span className="font-semibold">{currency.format(order.total)}</span>
          </div>
          <div className="mt-3 flex justify-between gap-4 text-sm">
            <span className="text-[var(--muted)]">Gateway</span>
            <span className="font-semibold">{paymentProviderLabel(payment.provider)}</span>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          Complete this step to confirm your order payment.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="btn-secondary justify-center" disabled={loading} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary justify-center" disabled={loading} type="button" onClick={onPay}>
            {loading ? "Processing..." : "Pay now"}
          </button>
        </div>
      </div>
    </div>
  );
}

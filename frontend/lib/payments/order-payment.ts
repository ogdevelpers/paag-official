import type { Order } from "@/lib/domain";

export const PAYMENT_RETRY_WINDOW_MS = 30 * 60 * 1000;

export type PaymentInit = {
  provider: "razorpay" | "mock" | "cashfree";
  providerOrderId: string;
  paymentSessionId?: string;
  keyId?: string;
  amount: number;
  currency: string;
  mode?: "sandbox" | "production";
};

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  theme: { color: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal: { ondismiss: () => void };
};

type CashfreeCheckoutResult = {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: {
    paymentMessage?: string;
    orderId?: string;
    paymentId?: string;
  };
};

type CashfreeCheckout = (options: {
  paymentSessionId: string;
  redirectTarget?: "_self" | "_blank" | "_modal" | "_top";
}) => Promise<CashfreeCheckoutResult>;

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
    Cashfree?: (options: { mode: "sandbox" | "production" }) => { checkout: CashfreeCheckout };
  }
}

export function isOnlinePaymentMode(paymentMode: string) {
  const normalized = paymentMode.trim().toLowerCase();
  return normalized === "card" || normalized === "upi";
}

export function getPaymentRetryDeadline(order: Order) {
  return new Date(order.createdAt).getTime() + PAYMENT_RETRY_WINDOW_MS;
}

export function isWithinPaymentRetryWindow(order: Order, now = Date.now()) {
  const createdAt = new Date(order.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return now - createdAt <= PAYMENT_RETRY_WINDOW_MS;
}

export function getPaymentRetryMinutesLeft(order: Order, now = Date.now()) {
  return Math.max(0, Math.ceil((getPaymentRetryDeadline(order) - now) / 60_000));
}

export function isOutOfStockPaymentError(message: string) {
  return /out of stock/i.test(message);
}

export function canRetryOnlinePayment(order: Order, now = Date.now()) {
  if (!isWithinPaymentRetryWindow(order, now)) return false;
  if (order.paymentMode === "Cash on Delivery") return false;
  if (order.paymentStatus === "paid") return false;
  return order.paymentStatus === "failed" || order.paymentStatus === "pending";
}

export function orderStatusLabel(order: Order) {
  if (order.status === "Failed" || order.paymentStatus === "failed") {
    return "Failed";
  }

  return order.status;
}

export function paymentProviderLabel(provider: PaymentInit["provider"]) {
  if (provider === "mock") return "Local test gateway";
  if (provider === "cashfree") return "Cashfree";
  return "Razorpay";
}

export function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function loadCashfreeScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Cashfree) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Cashfree));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function markOrderPaymentFailed(orderId: string) {
  const response = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}/fail`, {
    method: "POST",
    credentials: "same-origin",
  });
  const data = (await response.json()) as { order?: Order; error?: string };

  if (!response.ok || !data.order) {
    throw new Error(data.error || "Unable to mark payment as failed.");
  }

  return data.order;
}

export async function retryOrderPayment(orderId: string) {
  const response = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}/retry`, {
    method: "POST",
    credentials: "same-origin",
  });
  const data = (await response.json()) as {
    order?: Order;
    payment?: PaymentInit;
    error?: string;
  };

  if (!response.ok || !data.order || !data.payment) {
    throw new Error(data.error || "Unable to retry payment.");
  }

  return { order: data.order, payment: data.payment };
}

export async function verifyOrderPayment(paymentPayload: Record<string, string>) {
  const response = await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(paymentPayload),
  });
  const data = (await response.json()) as { order?: Order; error?: string };

  if (!response.ok || !data.order) {
    throw new Error(data.error || "Payment verification failed.");
  }

  return data.order;
}

async function completeCashfreePayment(input: {
  order: Order;
  payment: PaymentInit;
  onDismiss?: () => void | Promise<void>;
}) {
  const scriptLoaded = await loadCashfreeScript();
  if (!scriptLoaded || !window.Cashfree || !input.payment.paymentSessionId) {
    throw new Error("Cashfree checkout could not load. Try again in a moment.");
  }

  const cashfree = window.Cashfree({
    mode: input.payment.mode === "production" ? "production" : "sandbox",
  });

  const result = await cashfree.checkout({
    paymentSessionId: input.payment.paymentSessionId,
    redirectTarget: "_modal",
  });

  if (result.error) {
    await Promise.resolve(input.onDismiss?.());
    throw new Error(result.error.message || "Payment was not completed.");
  }

  const providerOrderId = result.paymentDetails?.orderId || input.payment.providerOrderId;
  const paymentId = result.paymentDetails?.paymentId || providerOrderId;

  const order = await verifyOrderPayment({
    provider: "cashfree",
    providerOrderId,
    paymentId,
  });

  return { kind: "paid" as const, order };
}

async function completeRazorpayPayment(input: {
  order: Order;
  payment: PaymentInit;
  customerName: string;
  email: string;
  phone: string;
  onDismiss?: () => void | Promise<void>;
}) {
  const scriptLoaded = await loadRazorpayScript();
  if (!scriptLoaded || !window.Razorpay || !input.payment.keyId) {
    throw new Error("Payment gateway could not load. Try again in a moment.");
  }

  const Razorpay = window.Razorpay;
  return new Promise<{ kind: "paid"; order: Order }>((resolve, reject) => {
    const checkout = new Razorpay({
      key: input.payment.keyId!,
      amount: input.payment.amount,
      currency: input.payment.currency,
      name: "PAAG by Sakshi Gupta",
      description: `Order ${input.order.id}`,
      order_id: input.payment.providerOrderId,
      prefill: {
        name: input.customerName,
        email: input.email,
        contact: input.phone,
      },
      theme: { color: "#c8a95f" },
      handler: (paymentResponse) => {
        void verifyOrderPayment(paymentResponse)
          .then((order) => resolve({ kind: "paid", order }))
          .catch(reject);
      },
      modal: {
        ondismiss: () => {
          void Promise.resolve(input.onDismiss?.()).finally(() => {
            reject(new Error("Payment window was closed before completion."));
          });
        },
      },
    });
    checkout.open();
  });
}

export async function completeOnlinePayment(input: {
  order: Order;
  payment: PaymentInit;
  customerName: string;
  email: string;
  phone: string;
  onDismiss?: () => void | Promise<void>;
}) {
  if (input.payment.provider === "mock") {
    return { kind: "mock" as const, order: input.order, payment: input.payment };
  }

  if (input.payment.provider === "cashfree") {
    return completeCashfreePayment(input);
  }

  return completeRazorpayPayment(input);
}

export async function payMockOrder(payment: PaymentInit) {
  return verifyOrderPayment({
    provider: "mock",
    providerOrderId: payment.providerOrderId,
    paymentId: `pay_mock_${Date.now()}`,
  });
}

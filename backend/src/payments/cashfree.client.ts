import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import type { Order } from "../domain";

const API_VERSION = "2023-08-01";

export type CashfreeEnvironment = "sandbox" | "production";

export type CashfreeCreateOrderResponse = {
  order_id: string;
  payment_session_id?: string;
  order_status?: string;
  order_amount?: number;
  cf_order_id?: string | number;
};

export type CashfreeOrderResponse = {
  order_id: string;
  order_status?: string;
  order_amount?: number;
  cf_order_id?: string | number;
  payment_session_id?: string;
};

export type CashfreePaymentEntity = {
  cf_payment_id?: string | number;
  payment_status?: string;
  payment_amount?: number;
};

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

export function cashfreeConfig(): {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
  webhookSecret: string;
  baseUrl: string;
} {
  const appId = envValue("CASHFREE_APP_ID");
  const secretKey = envValue("CASHFREE_SECRET_KEY");
  const environment = (envValue("CASHFREE_ENVIRONMENT") || "sandbox").toLowerCase() as CashfreeEnvironment;
  const webhookSecret = envValue("CASHFREE_WEBHOOK_SECRET") || secretKey;

  return {
    appId,
    secretKey,
    environment: environment === "production" ? "production" : "sandbox",
    webhookSecret,
    baseUrl:
      environment === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg",
  };
}

function isPlaceholderCredential(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("replace-with") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-")
  );
}

export function hasCashfreeCredentials() {
  const config = cashfreeConfig();
  return Boolean(
    config.appId &&
      config.secretKey &&
      !isPlaceholderCredential(config.appId) &&
      !isPlaceholderCredential(config.secretKey),
  );
}

export function buildCashfreeOrderId(paagOrderId: string, attemptKey: string) {
  const base = paagOrderId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const suffix = attemptKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12);
  return `${base}_${suffix}`.slice(0, 45);
}

function sanitizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return "9999999999";
}

function publicWebhookUrl() {
  const configured =
    envValue("CASHFREE_NOTIFY_URL") ||
    envValue("API_PUBLIC_URL") ||
    envValue("FRONTEND_URL");
  if (!configured) return undefined;
  return `${configured.replace(/\/$/, "")}/api/payments/webhook/cashfree`;
}

function publicReturnUrl() {
  const configured = envValue("FRONTEND_URL");
  if (!configured) return undefined;
  return `${configured.replace(/\/$/, "")}/checkout/success?cf_order_id={order_id}`;
}

async function cashfreeRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const config = cashfreeConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": config.appId,
      "x-client-secret": config.secretKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : "Cashfree rejected the payment request.";
    throw new Error(message);
  }

  return parsed as T;
}

export async function createCashfreeOrder(input: {
  order: Order;
  cashfreeOrderId: string;
  customerId?: string;
}) {
  const { order, cashfreeOrderId, customerId } = input;
  const notifyUrl = publicWebhookUrl();
  const returnUrl = publicReturnUrl();

  const payload = {
    order_id: cashfreeOrderId,
    order_amount: order.total,
    order_currency: "INR",
    order_note: `PAAG order ${order.id}`.slice(0, 250),
    customer_details: {
      customer_id: (customerId || order.customerId || order.email).slice(0, 50),
      customer_name: order.customerName.slice(0, 100),
      customer_email: order.email.slice(0, 100),
      customer_phone: sanitizePhone(order.phone),
    },
    order_meta: {
      ...(returnUrl ? { return_url: returnUrl } : {}),
      ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    },
    order_tags: {
      paag_order_id: order.id,
    },
  };

  return cashfreeRequest<CashfreeCreateOrderResponse>("/orders", {
    method: "POST",
    body: payload,
  });
}

export async function fetchCashfreeOrder(orderId: string) {
  return cashfreeRequest<CashfreeOrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
}

export async function fetchCashfreePayments(orderId: string) {
  return cashfreeRequest<{ payments?: CashfreePaymentEntity[] }>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
  );
}

export function verifyCashfreeWebhookSignature(input: {
  signature: string;
  rawBody: string;
  timestamp: string;
}) {
  const secret = cashfreeConfig().webhookSecret;
  if (!secret || !input.signature || !input.timestamp) {
    throw new Error("Cashfree webhook verification is not configured.");
  }

  const body = input.timestamp + input.rawBody;
  const generated = createHmac("sha256", secret).update(body).digest("base64");
  const left = Buffer.from(generated);
  const right = Buffer.from(input.signature);
  if (left.length !== right.length || !cryptoTimingSafeEqual(left, right)) {
    throw new Error("Invalid Cashfree webhook signature.");
  }
}

export async function resolveCashfreePaymentId(orderId: string) {
  const payments = await fetchCashfreePayments(orderId);
  const successful =
    payments.payments?.find((payment) => payment.payment_status === "SUCCESS") ||
    payments.payments?.[0];
  return successful?.cf_payment_id ? String(successful.cf_payment_id) : orderId;
}

export function isCashfreeOrderPaid(status?: string) {
  return String(status || "").toUpperCase() === "PAID";
}

import { Inject, Injectable } from "@nestjs/common";
import type { CartLine, Order, PaymentIntent } from "../domain";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";
import { OrderService } from "../orders/order.service";
import {
  buildCashfreeOrderId,
  cashfreeConfig,
  createCashfreeOrder,
  fetchCashfreeOrder,
  hasCashfreeCredentials,
  isCashfreeOrderPaid,
  resolveCashfreePaymentId,
  verifyCashfreeWebhookSignature,
} from "./cashfree.client";

type PaymentProvider = "cashfree" | "razorpay" | "mock";

type CheckoutPayload = {
  customerName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  addressId?: string;
  saveAddress?: boolean;
  addressLabel?: string;
  paymentMode?: string;
  couponCode?: string;
  lines?: CartLine[];
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
};

type ProviderOrderResult = {
  provider: PaymentProvider;
  providerOrderId: string;
  paymentSessionId?: string;
  amount: number;
  currency: string;
  receipt: string;
  mode?: "sandbox" | "production";
  keyId?: string;
};

type PaymentCheckoutResponse = {
  order?: Order;
  payment?: {
    provider: PaymentProvider;
    providerOrderId: string;
    paymentSessionId?: string;
    keyId?: string;
    amount: number;
    currency: string;
    mode?: "sandbox" | "production";
  };
  error?: string;
  status: number;
};

function envValue(name: string) {
  return process.env[name] || "";
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

function razorpayConfig() {
  return {
    keyId: envValue("RAZORPAY_KEY_ID"),
    keySecret: envValue("RAZORPAY_KEY_SECRET"),
    webhookSecret: envValue("RAZORPAY_WEBHOOK_SECRET"),
  };
}

function hasRazorpayCredentials() {
  const config = razorpayConfig();
  return Boolean(
    config.keyId &&
      config.keySecret &&
      !isPlaceholderCredential(config.keyId) &&
      !isPlaceholderCredential(config.keySecret),
  );
}

function shouldUseMockGateway() {
  return envValue("PAAG_PAYMENT_MODE") === "mock" || process.env.NODE_ENV !== "production";
}

function resolvePaymentProvider(): PaymentProvider | null {
  const explicit = envValue("PAAG_PAYMENT_PROVIDER").toLowerCase();

  if (explicit === "mock") return "mock";
  if (explicit === "cashfree" && hasCashfreeCredentials()) return "cashfree";
  if (explicit === "razorpay" && hasRazorpayCredentials()) return "razorpay";

  if (envValue("PAAG_PAYMENT_MODE") === "mock") return "mock";

  if (hasCashfreeCredentials()) return "cashfree";
  if (hasRazorpayCredentials()) return "razorpay";
  if (shouldUseMockGateway()) return "mock";
  return null;
}

function base64(value: string) {
  return Buffer.from(value).toString("base64");
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function isOnlinePayment(paymentMode?: string) {
  const normalized = String(paymentMode || "").trim().toLowerCase();
  return normalized === "card" || normalized === "upi";
}

function canAccessOrder(order: Order, customer: { id: string; email: string }) {
  if (order.customerId && order.customerId !== customer.id) {
    return false;
  }

  return order.email.trim().toLowerCase() === customer.email.trim().toLowerCase();
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
    private readonly orderService: OrderService,
  ) {}

  private async createRazorpayOrder(order: Order) {
    const config = razorpayConfig();
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64(`${config.keyId}:${config.keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: order.total * 100,
        currency: "INR",
        receipt: order.id.slice(0, 40),
        notes: {
          paagOrderId: order.id,
          customerEmail: order.email,
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Payment gateway rejected the order.");
    }

    return (await response.json()) as RazorpayOrderResponse;
  }

  private async createMockOrder(order: Order): Promise<RazorpayOrderResponse> {
    return {
      id: `order_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`,
      amount: order.total * 100,
      currency: "INR",
      receipt: order.id.slice(0, 40),
    };
  }

  private async createProviderOrder(
    provider: PaymentProvider,
    order: Order,
    customerId?: string,
  ): Promise<ProviderOrderResult> {
    if (provider === "cashfree") {
      const attemptKey = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const cashfreeOrderId = buildCashfreeOrderId(order.id, attemptKey);
      const response = await createCashfreeOrder({
        order,
        cashfreeOrderId,
        customerId,
      });

      if (!response.payment_session_id) {
        throw new Error("Cashfree did not return a payment session.");
      }

      const config = cashfreeConfig();
      return {
        provider,
        providerOrderId: response.order_id || cashfreeOrderId,
        paymentSessionId: response.payment_session_id,
        amount: order.total * 100,
        currency: "INR",
        receipt: order.id.slice(0, 40),
        mode: config.environment,
        keyId: config.appId,
      };
    }

    if (provider === "razorpay") {
      const response = await this.createRazorpayOrder(order);
      return {
        provider,
        providerOrderId: response.id,
        amount: response.amount,
        currency: response.currency || "INR",
        receipt: response.receipt,
        keyId: razorpayConfig().keyId,
      };
    }

    const response = await this.createMockOrder(order);
    return {
      provider,
      providerOrderId: response.id,
      amount: response.amount,
      currency: response.currency || "INR",
      receipt: response.receipt,
    };
  }

  private retryWindowError() {
    return {
      error: "The 30-minute payment retry window has expired.",
      status: 400,
    };
  }

  private async ensureOrderCanBePaid(order: Order) {
    if (!this.orderService.isWithinPaymentRetryWindow(order)) {
      return this.retryWindowError();
    }

    const stockCheck = await this.orderService.validateOrderStockForPayment(order);
    if ("error" in stockCheck && stockCheck.error) {
      return { error: stockCheck.error, status: stockCheck.status };
    }

    return null;
  }

  private async releaseOrderStockIfHeld(order: Order) {
    if (order.paymentStatus === "paid" || order.paymentStatus === "failed") {
      return;
    }

    await this.repository.adjustOrderStock(order.lines, "release");
  }

  private async markProviderOrderFailed(order: Order, provider: PaymentProvider) {
    await this.repository.adjustOrderStock(order.lines, "release");
    await this.repository.updateOrderPayment({
      id: order.id,
      paymentStatus: "failed",
      paymentProvider: provider,
      status: "Failed",
    });
  }

  private async markPaymentPaid(intent: PaymentIntent, paymentId: string) {
    const order = await this.repository.getOrder(intent.orderId);
    if (!order) {
      return { error: "Order not found.", status: 404 };
    }

    if (order.paymentStatus === "paid" && intent.status === "paid") {
      return { order, status: 200 };
    }

    await this.repository.updatePaymentIntent({
      id: intent.id,
      providerPaymentId: paymentId,
      status: "paid",
    });

    const paidOrder = await this.repository.updateOrderPayment({
      id: intent.orderId,
      paymentStatus: "paid",
      paymentProvider: intent.provider,
      paymentReference: paymentId,
      status: "Placed",
    });

    return { order: paidOrder, status: 200 };
  }

  private async markPaymentFailed(intent: PaymentIntent, paymentId: string, releaseStock: boolean) {
    const order = await this.repository.getOrder(intent.orderId);
    if (!order) return;

    if (order.paymentStatus === "paid") return;

    await this.repository.updatePaymentIntent({
      id: intent.id,
      providerPaymentId: paymentId || undefined,
      status: "failed",
    });

    const shouldReleaseStock = releaseStock && order.paymentStatus !== "failed";
    if (shouldReleaseStock) {
      await this.repository.adjustOrderStock(order.lines, "release");
    }

    await this.repository.updateOrderPayment({
      id: intent.orderId,
      paymentStatus: "failed",
      paymentProvider: intent.provider,
      paymentReference: paymentId || order.paymentReference,
      status: "Failed",
    });
  }

  private paymentResponse(order: Order, providerOrder: ProviderOrderResult): PaymentCheckoutResponse {
    return {
      order,
      payment: {
        provider: providerOrder.provider,
        providerOrderId: providerOrder.providerOrderId,
        paymentSessionId: providerOrder.paymentSessionId,
        keyId: providerOrder.keyId,
        amount: providerOrder.amount,
        currency: providerOrder.currency,
        mode: providerOrder.mode,
      },
      status: 200,
    };
  }

  async createPaymentCheckout(
    payload: CheckoutPayload,
    customer: { id: string; email: string },
  ): Promise<PaymentCheckoutResponse> {
    if (!isOnlinePayment(payload.paymentMode)) {
      return { error: "Use the standard order endpoint for this payment mode.", status: 400 };
    }

    const provider = resolvePaymentProvider();
    if (!provider) {
      return { error: "Payment gateway is not configured.", status: 500 };
    }

    const result = await this.orderService.placeCheckoutOrder(payload, customer, {
      paymentStatus: "pending",
      paymentProvider: provider,
    });

    if (result.error || !result.order) {
      return { error: result.error || "Unable to place order.", status: result.status };
    }

    try {
      const providerOrder = await this.createProviderOrder(provider, result.order, customer.id);

      await this.repository.createPaymentIntent({
        orderId: result.order.id,
        customerId: result.order.customerId,
        provider,
        providerOrderId: providerOrder.providerOrderId,
        amount: result.order.total,
        currency: providerOrder.currency || "INR",
        status: "created",
        receipt: providerOrder.receipt,
      });

      await this.repository.updateOrderPayment({
        id: result.order.id,
        paymentStatus: "pending",
        paymentProvider: provider,
        paymentReference: providerOrder.providerOrderId,
      });

      return { ...this.paymentResponse(result.order, providerOrder), status: 201 };
    } catch (error) {
      await this.markProviderOrderFailed(result.order, provider);
      return {
        error: error instanceof Error ? error.message : "Unable to initialize payment.",
        status: 502,
      };
    }
  }

  async markOrderPaymentFailed(orderId: string, customer: { id: string; email: string }) {
    const order = await this.repository.getOrder(orderId);
    if (!order || !canAccessOrder(order, customer)) {
      return { error: "Order not found.", status: 404 };
    }

    if (order.paymentMode === "Cash on Delivery") {
      return { error: "Cash on delivery orders do not require online payment.", status: 400 };
    }

    if (order.paymentStatus === "paid") {
      return { error: "Order is already paid.", status: 400 };
    }

    if (!this.orderService.isWithinPaymentRetryWindow(order)) {
      return this.retryWindowError();
    }

    const shouldReleaseStock = order.paymentStatus !== "failed";
    if (shouldReleaseStock) {
      await this.repository.adjustOrderStock(order.lines, "release");
    }

    const updated = await this.repository.updateOrderPayment({
      id: order.id,
      paymentStatus: "failed",
      status: "Failed",
    });

    return { order: updated, status: 200 };
  }

  async retryOrderPayment(orderId: string, customer: { id: string; email: string }) {
    const order = await this.repository.getOrder(orderId);
    if (!order || !canAccessOrder(order, customer)) {
      return { error: "Order not found.", status: 404 };
    }

    if (!isOnlinePayment(order.paymentMode)) {
      return { error: "This order does not support online payment retry.", status: 400 };
    }

    if (order.paymentStatus === "paid") {
      return { error: "Order is already paid.", status: 400 };
    }

    const paymentGuard = await this.ensureOrderCanBePaid(order);
    if (paymentGuard) {
      return paymentGuard;
    }

    const wasFailed = order.paymentStatus === "failed";
    const provider = resolvePaymentProvider();
    if (!provider) {
      return { error: "Payment gateway is not configured.", status: 500 };
    }

    if (order.paymentStatus === "failed") {
      await this.repository.adjustOrderStock(order.lines, "reserve");
    }

    try {
      const providerOrder = await this.createProviderOrder(provider, order, customer.id);

      await this.repository.createPaymentIntent({
        orderId: order.id,
        customerId: order.customerId,
        provider,
        providerOrderId: providerOrder.providerOrderId,
        amount: order.total,
        currency: providerOrder.currency || "INR",
        status: "created",
        receipt: providerOrder.receipt,
      });

      const updated = await this.repository.updateOrderPayment({
        id: order.id,
        paymentStatus: "pending",
        paymentProvider: provider,
        paymentReference: providerOrder.providerOrderId,
        status: "Placed",
      });

      return {
        ...this.paymentResponse(updated!, providerOrder),
        status: 200,
      };
    } catch (error) {
      if (wasFailed) {
        await this.repository.adjustOrderStock(order.lines, "release");
      }

      await this.repository.updateOrderPayment({
        id: order.id,
        paymentStatus: "failed",
        paymentProvider: provider,
        status: "Failed",
      });

      return {
        error: error instanceof Error ? error.message : "Unable to retry payment.",
        status: 502,
      };
    }
  }

  async verifyPaymentCheckout(
    payload: {
      provider?: string;
      providerOrderId?: string;
      paymentId?: string;
      signature?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    },
    customer: { id: string; email: string },
  ) {
    const providerOrderId = payload.providerOrderId || payload.razorpay_order_id || "";
    const paymentId = payload.paymentId || payload.razorpay_payment_id || "";
    const signature = payload.signature || payload.razorpay_signature || "";

    if (!providerOrderId) {
      return { error: "Payment response is incomplete.", status: 400 };
    }

    const intent = await this.repository.getPaymentIntentByProviderOrderId(providerOrderId);
    if (!intent) {
      return { error: "Payment order was not found.", status: 404 };
    }

    if (intent.customerId && intent.customerId !== customer.id) {
      return { error: "Payment order does not belong to this account.", status: 403 };
    }

    const order = await this.repository.getOrder(intent.orderId);
    if (!order) {
      return { error: "Order not found.", status: 404 };
    }

    if (order.paymentStatus === "paid" && intent.status === "paid") {
      return { order, status: 200 };
    }

    const paymentGuard = await this.ensureOrderCanBePaid(order);
    if (paymentGuard) {
      return paymentGuard;
    }

    if (intent.provider === "mock") {
      if (!paymentId) {
        return { error: "Payment response is incomplete.", status: 400 };
      }
      return this.markPaymentPaid(intent, paymentId);
    }

    if (intent.provider === "razorpay") {
      if (!paymentId || !signature) {
        return { error: "Payment response is incomplete.", status: 400 };
      }

      const secret = razorpayConfig().keySecret;
      if (!secret) {
        return { error: "Payment verification is not configured.", status: 500 };
      }

      const expectedSignature = await hmacSha256Hex(secret, `${providerOrderId}|${paymentId}`);
      if (!timingSafeEqual(expectedSignature, signature)) {
        await this.markPaymentFailed(intent, paymentId, true);
        return { error: "Payment verification failed.", status: 400 };
      }

      return this.markPaymentPaid(intent, paymentId);
    }

    if (intent.provider === "cashfree") {
      try {
        const remoteOrder = await fetchCashfreeOrder(providerOrderId);
        if (!isCashfreeOrderPaid(remoteOrder.order_status)) {
          return { error: "Payment is not completed yet.", status: 400 };
        }

        if (
          remoteOrder.order_amount !== undefined &&
          Math.round(remoteOrder.order_amount) !== intent.amount
        ) {
          await this.markPaymentFailed(intent, paymentId, true);
          return { error: "Payment amount mismatch.", status: 400 };
        }

        const resolvedPaymentId = paymentId || (await resolveCashfreePaymentId(providerOrderId));
        return this.markPaymentPaid(intent, resolvedPaymentId);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unable to verify Cashfree payment.",
          status: 502,
        };
      }
    }

    return { error: "Unsupported payment provider.", status: 400 };
  }

  private readNestedPaymentEntity(payload: unknown) {
    const root = payload as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
          };
        };
      };
    };

    return {
      event: root.event || "unknown",
      paymentId: root.payload?.payment?.entity?.id || "",
      providerOrderId: root.payload?.payment?.entity?.order_id || "",
    };
  }

  private readCashfreeWebhookEntity(payload: unknown) {
    const root = payload as {
      type?: string;
      event_time?: string;
      data?: {
        order?: {
          order_id?: string;
          order_amount?: number;
          order_status?: string;
        };
        payment?: {
          cf_payment_id?: string | number;
          payment_status?: string;
          payment_amount?: number;
        };
      };
    };

    return {
      event: root.type || "unknown",
      providerOrderId: root.data?.order?.order_id || "",
      paymentId: root.data?.payment?.cf_payment_id ? String(root.data.payment.cf_payment_id) : "",
      orderStatus: root.data?.order?.order_status || root.data?.payment?.payment_status || "",
      orderAmount: root.data?.order?.order_amount,
      eventTime: root.event_time || "",
    };
  }

  async handleRazorpayWebhook(input: {
    rawBody: string;
    signature: string;
    eventId: string;
  }) {
    const secret = razorpayConfig().webhookSecret;
    if (!secret) {
      return { error: "Webhook secret is not configured.", status: 500 };
    }

    const expectedSignature = await hmacSha256Hex(secret, input.rawBody);
    if (!timingSafeEqual(expectedSignature, input.signature)) {
      return { error: "Invalid webhook signature.", status: 400 };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return { error: "Invalid webhook payload.", status: 400 };
    }

    const entity = this.readNestedPaymentEntity(parsed);
    const eventId = input.eventId || `${entity.event}:${entity.providerOrderId}:${entity.paymentId}`;
    const recorded = await this.repository.recordWebhookEvent({
      id: `razorpay:${eventId}`,
      provider: "razorpay",
      eventId,
      eventType: entity.event,
    });

    if (!recorded) {
      return { ok: true, duplicate: true, status: 200 };
    }

    if (!entity.providerOrderId) {
      return { ok: true, status: 200 };
    }

    const intent = await this.repository.getPaymentIntentByProviderOrderId(entity.providerOrderId);
    if (!intent) {
      return { ok: true, status: 200 };
    }

    if (entity.event === "payment.captured" || entity.event === "order.paid") {
      await this.markPaymentPaid(intent, entity.paymentId || entity.providerOrderId);
    }

    if (entity.event === "payment.failed") {
      await this.markPaymentFailed(intent, entity.paymentId, true);
    }

    return { ok: true, status: 200 };
  }

  async handleCashfreeWebhook(input: {
    rawBody: string;
    signature: string;
    timestamp: string;
    eventId: string;
  }) {
    try {
      verifyCashfreeWebhookSignature({
        signature: input.signature,
        rawBody: input.rawBody,
        timestamp: input.timestamp,
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid webhook signature.",
        status: 400,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return { error: "Invalid webhook payload.", status: 400 };
    }

    const entity = this.readCashfreeWebhookEntity(parsed);
    const eventId =
      input.eventId ||
      `${entity.event}:${entity.providerOrderId}:${entity.paymentId || entity.eventTime}`;
    const recorded = await this.repository.recordWebhookEvent({
      id: `cashfree:${eventId}`,
      provider: "cashfree",
      eventId,
      eventType: entity.event,
    });

    if (!recorded) {
      return { ok: true, duplicate: true, status: 200 };
    }

    if (!entity.providerOrderId) {
      return { ok: true, status: 200 };
    }

    const intent = await this.repository.getPaymentIntentByProviderOrderId(entity.providerOrderId);
    if (!intent) {
      return { ok: true, status: 200 };
    }

    if (
      entity.event === "PAYMENT_SUCCESS_WEBHOOK" ||
      isCashfreeOrderPaid(entity.orderStatus) ||
      String(entity.orderStatus).toUpperCase() === "SUCCESS"
    ) {
      if (
        entity.orderAmount !== undefined &&
        Math.round(entity.orderAmount) !== intent.amount
      ) {
        return { ok: true, status: 200 };
      }

      await this.markPaymentPaid(
        intent,
        entity.paymentId || (await resolveCashfreePaymentId(entity.providerOrderId)),
      );
    }

    if (
      entity.event === "PAYMENT_FAILED_WEBHOOK" ||
      entity.event === "PAYMENT_USER_DROPPED_WEBHOOK" ||
      String(entity.orderStatus).toUpperCase() === "FAILED"
    ) {
      await this.markPaymentFailed(intent, entity.paymentId, true);
    }

    return { ok: true, status: 200 };
  }
}

import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { CartLine } from "../domain";
import type { Request } from "express";
import { httpError } from "../common/http/http-error";
import { requireCustomerSession } from "../common/auth/customer-session";
import { PaymentService } from "./payment.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("checkout")
  async checkout(
    @Req() req: Request,
    @Body()
    payload: {
      customerName?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      paymentMode?: string;
      couponCode?: string;
      lines?: CartLine[];
    },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.paymentService.createPaymentCheckout(payload, {
      id: session.customerId,
      email: session.email,
    });
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order, payment: result.payment };
  }

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Req() req: Request,
    @Body()
    payload: {
      provider?: string;
      providerOrderId?: string;
      paymentId?: string;
      signature?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.paymentService.verifyPaymentCheckout(payload, {
      id: session.customerId,
      email: session.email,
    });
    if ("error" in result) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order };
  }

  @Post("orders/:orderId/fail")
  @HttpCode(200)
  async markFailed(@Req() req: Request, @Param("orderId") orderId: string) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.paymentService.markOrderPaymentFailed(orderId, {
      id: session.customerId,
      email: session.email,
    });
    if ("error" in result) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order };
  }

  @Post("orders/:orderId/retry")
  @HttpCode(200)
  async retry(@Req() req: Request, @Param("orderId") orderId: string) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.paymentService.retryOrderPayment(orderId, {
      id: session.customerId,
      email: session.email,
    });
    if ("error" in result) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order, payment: result.payment };
  }

  @Post("webhook/cashfree")
  @HttpCode(200)
  async cashfreeWebhook(@Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") || "";
    const signature = req.headers["x-webhook-signature"]?.toString() || "";
    const timestamp = req.headers["x-webhook-timestamp"]?.toString() || "";
    const eventId = req.headers["x-idempotency-key"]?.toString() || "";

    const result = await this.paymentService.handleCashfreeWebhook({
      rawBody,
      signature,
      timestamp,
      eventId,
    });
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { ok: result.ok, duplicate: result.duplicate || false };
  }

  @Post("webhook/razorpay")
  @HttpCode(200)
  async razorpayWebhook(@Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") || "";
    const signature = req.headers["x-razorpay-signature"]?.toString() || "";
    const eventId = req.headers["x-razorpay-event-id"]?.toString() || "";

    const result = await this.paymentService.handleRazorpayWebhook({
      rawBody,
      signature,
      eventId,
    });
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { ok: result.ok, duplicate: result.duplicate || false };
  }
}

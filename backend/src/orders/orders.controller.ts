import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { CartLine } from "../domain";
import type { Request } from "express";
import { httpError } from "../common/http/http-error";
import { requireCustomerSession } from "../common/auth/customer-session";
import { requireStudioRequest } from "../common/auth/studio-session";
import { OrderService } from "./order.service";
import { StudioService } from "../studio/studio.service";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orderService: OrderService,
    private readonly studioService: StudioService,
  ) {}

  @Get()
  async listOrders(@Req() req: Request) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    return this.studioService.getStudioOrderDashboard();
  }

  @Post()
  async createOrder(
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
      addressId?: string;
      saveAddress?: boolean;
      addressLabel?: string;
    },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.orderService.placeCheckoutOrder(payload, {
      id: session.customerId,
      email: session.email,
    });
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order };
  }

  @Post("validate")
  async validateOrder(
    @Req() req: Request,
    @Body() payload: { lines?: CartLine[] },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.orderService.validateCartLines(payload.lines ?? []);
    if (result.error) {
      return { ok: false, error: result.error };
    }

    return { ok: true, lines: result.lines };
  }

  @Patch(":id")
  async updateOrder(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() payload: { status?: string },
  ) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const result = await this.studioService.updateStudioOrderStatus(id, payload.status);
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { order: result.order };
  }
}

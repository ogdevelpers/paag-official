import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { httpError } from "../common/http/http-error";
import {
  clearCustomerSessionCookie,
  createCustomerSessionCookie,
  readCustomerSession,
  rejectCrossOriginMutation,
  requireCustomerSession,
} from "../common/auth/customer-session";
import { AccountService } from "./account.service";
import { AddressService } from "./address.service";
import { ShoppingService } from "./shopping.service";
import { VerificationService } from "./verification.service";

@Controller("account")
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly addressService: AddressService,
    private readonly shoppingService: ShoppingService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post("register")
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() payload: { email?: string; name?: string; password?: string; phone?: string },
  ) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const result = await this.accountService.registerCustomer(payload);
    if (result.error || !result.customer) {
      httpError(result.status, { error: result.error });
    }

    res.status(201);
    res.setHeader(
      "Set-Cookie",
      await createCustomerSessionCookie(req, {
        ...result.customer,
        passwordHash: "",
      }),
    );
    return { authenticated: true, customer: result.customer };
  }

  @Get("session")
  async getSession(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await readCustomerSession(req);
    if (!session) {
      return { authenticated: false };
    }

    const customer = await this.accountService.getCustomerProfile(session.customerId);
    if (!customer) {
      res.setHeader("Set-Cookie", clearCustomerSessionCookie(req));
      return { authenticated: false };
    }

    return { authenticated: true, customer };
  }

  @Post("session")
  async signIn(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() payload: { email?: string; password?: string },
  ) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const result = await this.accountService.authenticateCustomer(payload);
    if (result.error || !result.customer) {
      httpError(result.status, { error: result.error });
    }

    res.setHeader(
      "Set-Cookie",
      await createCustomerSessionCookie(req, {
        ...result.customer,
        passwordHash: "",
      }),
    );
    return { authenticated: true, customer: result.customer };
  }

  @Delete("session")
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    res.setHeader("Set-Cookie", clearCustomerSessionCookie(req));
    return { authenticated: false };
  }

  @Get("cart")
  async getCart(@Req() req: Request) {
    const session = await readCustomerSession(req);
    if (!session) {
      return { lines: [] };
    }

    const lines = await this.shoppingService.getCustomerCart(session.customerId);
    return { lines };
  }

  @Put("cart")
  async replaceCart(
    @Req() req: Request,
    @Body() payload: { lines?: unknown[] },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const lines = await this.shoppingService.replaceCustomerCart(
      session.customerId,
      (payload.lines || []) as Parameters<ShoppingService["replaceCustomerCart"]>[1],
    );
    return { lines };
  }

  @Delete("cart")
  @HttpCode(200)
  async clearCart(@Req() req: Request) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    await this.shoppingService.replaceCustomerCart(session.customerId, []);
    return { lines: [] };
  }

  @Get("wishlist")
  async getWishlist(@Req() req: Request) {
    const session = await readCustomerSession(req);
    if (!session) {
      return { productIds: [] };
    }

    const productIds = await this.shoppingService.getCustomerWishlist(session.customerId);
    return { productIds };
  }

  @Put("wishlist")
  async replaceWishlist(
    @Req() req: Request,
    @Body() payload: { productIds?: string[] },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const productIds = await this.shoppingService.replaceCustomerWishlist(
      session.customerId,
      payload.productIds || [],
    );
    return { productIds };
  }

  @Get("orders")
  async getOrders(@Req() req: Request) {
    const { error, session } = await requireCustomerSession(req);
    if (error) {
      httpError(error.status, error.body as Record<string, unknown>);
    }
    if (!session) {
      httpError(401, { error: "Sign in required" });
    }

    const orders = await this.accountService.getCustomerOrders(session.customerId, session.email);
    return { orders };
  }

  @Get("addresses")
  async listAddresses(@Req() req: Request) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const addresses = await this.addressService.listCustomerAddresses(session.customerId);
    return { addresses };
  }

  @Post("addresses")
  async createAddress(
    @Req() req: Request,
    @Body()
    payload: {
      label?: string;
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      isDefault?: boolean;
    },
  ) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.addressService.createCustomerAddress(session.customerId, payload);
    if (result.error || !result.address) {
      httpError(result.status, { error: result.error });
    }

    return { address: result.address };
  }

  @Put("addresses/:id")
  async updateAddress(
    @Req() req: Request,
    @Param("id") id: string,
    @Body()
    payload: {
      label?: string;
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      isDefault?: boolean;
    },
  ) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.addressService.updateCustomerAddress(
      session.customerId,
      id,
      payload,
    );
    if (result.error || !result.address) {
      httpError(result.status, { error: result.error });
    }

    return { address: result.address };
  }

  @Delete("addresses/:id")
  @HttpCode(200)
  async deleteAddress(@Req() req: Request, @Param("id") id: string) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.addressService.deleteCustomerAddress(session.customerId, id);
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { ok: true };
  }

  @Post("addresses/:id/default")
  async setDefaultAddress(@Req() req: Request, @Param("id") id: string) {
    const originError = rejectCrossOriginMutation(req);
    if (originError) {
      httpError(originError.status, originError.body as Record<string, unknown>);
    }

    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.addressService.setDefaultCustomerAddress(session.customerId, id);
    if (result.error || !result.address) {
      httpError(result.status, { error: result.error });
    }

    return { address: result.address };
  }

  @Post("verification/request")
  async requestVerification(
    @Req() req: Request,
    @Body() payload: { channel?: string },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.verificationService.requestCustomerVerification(
      session.customerId,
      payload.channel,
    );
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return {
      destination: result.destination,
      devCode: result.devCode,
    };
  }

  @Post("verification/confirm")
  async confirmVerification(
    @Req() req: Request,
    @Body() payload: { channel?: string; code?: string },
  ) {
    const { error, session } = await requireCustomerSession(req);
    if (error || !session) {
      httpError(error?.status || 401, error?.body || { error: "Sign in required" });
    }

    const result = await this.verificationService.confirmCustomerVerification(
      session.customerId,
      payload.channel,
      payload.code,
    );
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { customer: result.customer };
  }
}

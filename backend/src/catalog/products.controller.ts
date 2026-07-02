import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { httpError } from "../common/http/http-error";
import { isStudioRequest, requireStudioRequest } from "../common/auth/studio-session";
import { CatalogService } from "./catalog.service";
import { StudioService } from "../studio/studio.service";

@Controller("products")
export class ProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly studioService: StudioService,
  ) {}

  @Get()
  async listProducts(@Req() req: Request, @Query("scope") scope?: string) {
    const includeAll = scope === "studio";
    const products =
      includeAll && (await isStudioRequest(req))
        ? await this.catalogService.listStudioProducts()
        : await this.catalogService.listCatalogProducts();

    return { products };
  }

  @Post()
  async createProduct(@Req() req: Request, @Body() payload: Record<string, unknown>) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const result = await this.studioService.createStudioProduct(payload);
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { product: result.product };
  }

  @Patch(":slug")
  async updateProduct(
    @Req() req: Request,
    @Param("slug") slug: string,
    @Body() payload: Record<string, unknown>,
  ) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const result = await this.studioService.updateStudioProduct(slug, payload);
    if (result.error) {
      httpError(result.status, { error: result.error });
    }

    return { product: result.product };
  }

  @Get(":slug")
  async getProduct(@Param("slug") slug: string) {
    const product = await this.catalogService.getCatalogProduct(slug);
    if (!product) {
      httpError(404, { error: "Product not found" });
    }

    return { product };
  }

  @Delete(":slug")
  async deleteProduct(@Req() req: Request, @Param("slug") slug: string) {
    const unauthorized = await requireStudioRequest(req);
    if (unauthorized) {
      httpError(unauthorized.status, unauthorized.body as Record<string, unknown>);
    }

    const deleted = await this.studioService.deleteStudioProduct(slug);
    if (!deleted) {
      httpError(404, { error: "Product not found" });
    }

    return { ok: true };
  }
}

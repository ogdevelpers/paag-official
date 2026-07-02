import { Inject, Injectable } from "@nestjs/common";
import type { Order } from "../domain";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";
import { parseOrderStatus, parseProductPayload } from "../common/validation/input";

@Injectable()
export class StudioService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  async getStudioOrderDashboard() {
    const [orders, metrics] = await Promise.all([
      this.repository.listOrders(),
      this.repository.getMetrics(),
    ]);

    return { orders, metrics };
  }

  async createStudioProduct(payload: Record<string, unknown>) {
    const parsed = parseProductPayload(payload);
    if (parsed.error || !parsed.product) {
      return { error: parsed.error || "Invalid product payload.", status: 400 };
    }

    try {
      const product = await this.repository.upsertProduct(parsed.product);
      return { product, status: 201 };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save product.";
      return { error: message, status: 400 };
    }
  }

  async updateStudioProduct(originalSlug: string, payload: Record<string, unknown>) {
    const parsed = parseProductPayload(payload);
    if (parsed.error || !parsed.product) {
      return { error: parsed.error || "Invalid product payload.", status: 400 };
    }

    const existing = await this.repository.getProduct(originalSlug);
    if (!existing) {
      return { error: "Product not found", status: 404 };
    }

    if (parsed.product.id !== existing.id) {
      return { error: "Product id cannot be changed.", status: 400 };
    }

    try {
      const product = await this.repository.updateProduct(originalSlug, parsed.product);
      if (!product) {
        return { error: "Product not found", status: 404 };
      }

      return { product, status: 200 };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update product.";
      return { error: message, status: 400 };
    }
  }

  async deleteStudioProduct(slug: string) {
    return this.repository.deleteProduct(slug);
  }

  async updateStudioOrderStatus(id: string, payloadStatus: unknown) {
    const status = parseOrderStatus(payloadStatus);
    if (!status) {
      return { error: "A valid order status is required.", status: 400 };
    }

    const order = await this.repository.updateOrderStatus(id, status);
    if (!order) {
      return { error: "Order not found", status: 404 };
    }

    return { order, status: 200 };
  }

  async findStudioOrder(id: string): Promise<Order | null> {
    return this.repository.getOrder(id);
  }
}

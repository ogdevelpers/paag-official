import { Inject, Injectable } from "@nestjs/common";
import type { CartLine } from "../domain";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";
import { getSizeStock } from "../commerce/product-stock";

function cleanString(value: unknown, maxLength = 180) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.round(quantity), 1), 10);
}

@Injectable()
export class ShoppingService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  private async canonicalCartLines(inputLines: CartLine[]) {
    const liveProducts = await this.repository.listProducts();
    const prepared = new Map<string, CartLine>();

    for (const rawLine of inputLines.slice(0, 50)) {
      const slug = cleanString(rawLine.slug, 120);
      const productId = cleanString(rawLine.productId, 120);
      const product = liveProducts.find(
        (item) => item.slug === slug || item.id === productId,
      );

      if (!product) continue;

      const size = cleanString(rawLine.size, 20);
      if (!product.sizes.includes(size)) continue;

      const quantity = cleanQuantity(rawLine.quantity);
      const key = `${product.id}-${size}`;
      const existing = prepared.get(key);
      const sizeStock = getSizeStock(product.sizeStock, size);
      const nextQuantity = Math.min((existing?.quantity || 0) + quantity, 10, sizeStock);

      if (nextQuantity <= 0) continue;

      prepared.set(key, {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0],
        size,
        price: product.price,
        quantity: nextQuantity,
      });
    }

    return Array.from(prepared.values());
  }

  async getCustomerCart(customerId: string) {
    return this.repository.getCartLines(customerId);
  }

  async replaceCustomerCart(customerId: string, lines: CartLine[]) {
    const canonicalLines = await this.canonicalCartLines(Array.isArray(lines) ? lines : []);
    return this.repository.replaceCartLines(customerId, canonicalLines);
  }

  async getCustomerWishlist(customerId: string) {
    return this.repository.getWishlistProductIds(customerId);
  }

  async replaceCustomerWishlist(customerId: string, productIds: string[]) {
    const liveProducts = await this.repository.listProducts();
    const liveIds = new Set(liveProducts.map((product) => product.id));
    const canonicalIds = Array.from(
      new Set(
        (Array.isArray(productIds) ? productIds : [])
          .map((productId) => cleanString(productId, 120))
          .filter((productId) => liveIds.has(productId)),
      ),
    ).slice(0, 200);

    return this.repository.replaceWishlistProductIds(customerId, canonicalIds);
  }
}

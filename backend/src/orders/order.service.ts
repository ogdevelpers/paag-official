import { Inject, Injectable } from "@nestjs/common";
import { applyPromotion } from "../domain";
import type { CartLine, Order } from "../domain";
import { COMMERCE_REPOSITORY, type CommerceRepository } from "../commerce/commerce.repository";
import { getSizeStock } from "../commerce/product-stock";
import { cleanCheckoutText } from "../common/validation/input";

export const PAYMENT_RETRY_WINDOW_MS = 30 * 60 * 1000;

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

type OrderPaymentOverrides = {
  paymentStatus?: "pending" | "paid" | "failed" | "refunded";
  paymentProvider?: "cod" | "razorpay" | "mock" | "cashfree";
  paymentReference?: string;
};

@Injectable()
export class OrderService {
  constructor(
    @Inject(COMMERCE_REPOSITORY) private readonly repository: CommerceRepository,
  ) {}

  private async prepareOrderLines(inputLines: CartLine[]) {
    const prepared = new Map<string, CartLine>();

    for (const line of inputLines) {
      const quantity = Math.min(Math.max(Number(line.quantity || 0), 1), 10);
      const product = await this.repository.getProduct(line.slug);

      if (!product || product.status !== "live") {
        return { error: `${line.name || "A selected item"} is no longer available.` };
      }

      if (!product.sizes.includes(line.size)) {
        return { error: `${product.name} is not available in size ${line.size}.` };
      }

      const key = `${product.id}-${line.size}`;
      const existing = prepared.get(key);
      const nextQuantity = (existing?.quantity || 0) + quantity;
      const available = getSizeStock(product.sizeStock, line.size);

      if (nextQuantity > available) {
        return {
          error:
            available > 0
              ? `${product.name} size ${line.size} has only ${available} left.`
              : `${product.name} is out of stock in size ${line.size}.`,
        };
      }

      prepared.set(key, {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0],
        size: line.size,
        price: product.price,
        quantity: nextQuantity,
      });
    }

    const lines = Array.from(prepared.values());
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

    return { lines, subtotal };
  }

  async validateCartLines(inputLines: CartLine[]) {
    if (!inputLines.length) {
      return { error: "Cart is empty.", status: 400 };
    }

    const prepared = await this.prepareOrderLines(inputLines);
    if (prepared.error || !prepared.lines) {
      return { error: prepared.error || "Unable to validate cart.", status: 400 };
    }

    return { ok: true as const, lines: prepared.lines };
  }

  private async resolveDeliveryDetails(
    payload: CheckoutPayload,
    customer?: { id: string; email: string } | null,
  ) {
    const email = customer?.email || cleanCheckoutText(payload.email, 160).toLowerCase();

    if (payload.addressId && customer?.id) {
      const saved = await this.repository.getCustomerAddress(customer.id, payload.addressId);
      if (!saved) {
        return { error: "Selected address was not found.", status: 400 };
      }

      return {
        customerName: saved.name,
        email,
        phone: saved.phone,
        address: saved.address,
        city: saved.city,
      };
    }

    const customerName = cleanCheckoutText(payload.customerName, 120);
    const phone = cleanCheckoutText(payload.phone, 30);
    const address = cleanCheckoutText(payload.address, 400);
    const city = cleanCheckoutText(payload.city, 100);

    if (!customerName || !email || !phone || !address || !city) {
      return { error: "Delivery details are incomplete.", status: 400 };
    }

    return {
      customerName,
      email,
      phone,
      address,
      city,
      shouldSaveAddress: Boolean(payload.saveAddress),
      addressLabel: cleanCheckoutText(payload.addressLabel, 40) || "Home",
    };
  }

  async placeCheckoutOrder(
    payload: CheckoutPayload,
    customer?: { id: string; email: string } | null,
    payment?: OrderPaymentOverrides,
  ) {
    const lines = payload.lines ?? [];
    if (!lines.length) {
      return { error: "Cart is empty", status: 400 };
    }

    const deliveryDetails = await this.resolveDeliveryDetails(payload, customer);
    if (
      deliveryDetails.error ||
      !deliveryDetails.customerName ||
      !deliveryDetails.email ||
      !deliveryDetails.phone ||
      !deliveryDetails.address ||
      !deliveryDetails.city
    ) {
      return {
        error: deliveryDetails.error || "Delivery details are incomplete.",
        status: deliveryDetails.status || 400,
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryDetails.email)) {
      return { error: "Enter a valid email address.", status: 400 };
    }

    const customerName = deliveryDetails.customerName;
    const email = deliveryDetails.email;
    const phone = deliveryDetails.phone;
    const address = deliveryDetails.address;
    const city = deliveryDetails.city;
    const paymentMode = cleanCheckoutText(payload.paymentMode, 80) || "Cash on Delivery";

    const prepared = await this.prepareOrderLines(lines);
    if (prepared.error || !prepared.lines || prepared.subtotal === undefined) {
      return { error: prepared.error || "Unable to prepare order.", status: 400 };
    }

    const subtotal = prepared.subtotal;
    const promotion = applyPromotion(subtotal, cleanCheckoutText(payload.couponCode, 40));
    if (promotion.error && payload.couponCode) {
      return { error: promotion.error, status: 400 };
    }

    const delivery = subtotal >= 5000 ? 0 : 149;
    const order = await this.repository.createOrder({
      customerId: customer?.id,
      customerName,
      email,
      phone,
      address,
      city,
      paymentMode,
      couponCode: promotion.couponCode || undefined,
      discount: promotion.discount,
      subtotal,
      delivery,
      total: subtotal + delivery - promotion.discount,
      paymentStatus: payment?.paymentStatus || "pending",
      paymentProvider:
        payment?.paymentProvider || (paymentMode === "Cash on Delivery" ? "cod" : undefined),
      paymentReference: payment?.paymentReference,
      lines: prepared.lines,
    });

    if (customer?.id && deliveryDetails.shouldSaveAddress && !payload.addressId) {
      const existingAddresses = await this.repository.listCustomerAddresses(customer.id);
      await this.repository.createCustomerAddress({
        customerId: customer.id,
        label: deliveryDetails.addressLabel || "Home",
        name: customerName,
        phone,
        address,
        city,
        isDefault: existingAddresses.length === 0,
      });
    }

    return { order, status: 201 };
  }

  isWithinPaymentRetryWindow(order: Order, now = Date.now()) {
    const createdAt = new Date(order.createdAt).getTime();
    if (Number.isNaN(createdAt)) return false;
    return now - createdAt <= PAYMENT_RETRY_WINDOW_MS;
  }

  async validateOrderStockForPayment(order: Order) {
    for (const line of order.lines) {
      const quantity = Math.min(Math.max(Number(line.quantity || 0), 1), 10);
      const product = await this.repository.getProduct(line.slug);

      if (!product || product.status !== "live" || !product.sizes.includes(line.size)) {
        return { error: "Out of stock.", status: 400 };
      }

      const reservedForOrder = order.paymentStatus === "failed" ? 0 : quantity;
      const available = getSizeStock(product.sizeStock, line.size) + reservedForOrder;
      if (available < quantity) {
        return { error: "Out of stock.", status: 400 };
      }
    }

    return { ok: true as const };
  }
}

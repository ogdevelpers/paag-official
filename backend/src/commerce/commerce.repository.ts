import { Injectable } from "@nestjs/common";
import { PrismaClient } from "../database";
import type {
  CartLine,
  Customer,
  CustomerAddress,
  MediaAsset,
  Metrics,
  Order,
  PaymentIntent,
  Product,
} from "../domain";
import { normalizeProductInput } from "./product-normalizer";
import {
  applySizeStockDelta,
  getTotalStockFromMap,
  parseSizeStock,
} from "./product-stock";

export const COMMERCE_REPOSITORY = Symbol("COMMERCE_REPOSITORY");

export type CommerceRepository = {
  createCustomer(input: {
    email: string;
    name: string;
    passwordHash: string;
    phone?: string;
  }): Promise<Customer>;
  getCustomerByEmail(email: string): Promise<Customer | null>;
  getCustomerById(id: string): Promise<Customer | null>;
  updateCustomer(input: {
    id: string;
    name?: string;
    phone?: string;
    emailVerifiedAt?: string;
    phoneVerifiedAt?: string;
  }): Promise<Customer | null>;
  getCartLines(customerId: string): Promise<CartLine[]>;
  replaceCartLines(customerId: string, lines: CartLine[]): Promise<CartLine[]>;
  getWishlistProductIds(customerId: string): Promise<string[]>;
  replaceWishlistProductIds(customerId: string, productIds: string[]): Promise<string[]>;
  listProducts(): Promise<Product[]>;
  listAllProducts(): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  upsertProduct(input: Partial<Product>): Promise<Product>;
  updateProduct(originalSlug: string, input: Partial<Product>): Promise<Product | null>;
  deleteProduct(slug: string): Promise<boolean>;
  listOrders(): Promise<Order[]>;
  listOrdersForCustomer(customerId: string, email: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  createOrder(input: Omit<Order, "id" | "createdAt" | "status">): Promise<Order>;
  adjustOrderStock(lines: CartLine[], direction: "release" | "reserve"): Promise<void>;
  updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null>;
  updateOrderPayment(input: {
    id: string;
    paymentStatus: Order["paymentStatus"];
    paymentProvider?: Order["paymentProvider"];
    paymentReference?: string;
    status?: Order["status"];
  }): Promise<Order | null>;
  createPaymentIntent(input: Omit<PaymentIntent, "id" | "createdAt" | "updatedAt">): Promise<PaymentIntent>;
  getPaymentIntentByProviderOrderId(providerOrderId: string): Promise<PaymentIntent | null>;
  updatePaymentIntent(input: {
    id: string;
    providerPaymentId?: string;
    status: PaymentIntent["status"];
  }): Promise<PaymentIntent | null>;
  recordWebhookEvent(input: {
    id: string;
    provider: string;
    eventId: string;
    eventType: string;
  }): Promise<boolean>;
  createMediaAsset(input: Omit<MediaAsset, "id" | "createdAt">): Promise<MediaAsset>;
  createVerificationCode(input: {
    customerId: string;
    channel: "email" | "sms";
    destination: string;
    codeHash: string;
    expiresAt: string;
  }): Promise<{ id: string }>;
  getLatestVerificationCode(input: {
    customerId: string;
    channel: "email" | "sms";
  }): Promise<{
    id: string;
    codeHash: string;
    expiresAt: string;
    attempts: number;
    consumedAt?: string;
  } | null>;
  markVerificationCodeConsumed(id: string): Promise<void>;
  incrementVerificationCodeAttempts(id: string): Promise<void>;
  getMetrics(): Promise<Metrics>;
  listCustomerAddresses(customerId: string): Promise<CustomerAddress[]>;
  getCustomerAddress(customerId: string, addressId: string): Promise<CustomerAddress | null>;
  createCustomerAddress(input: {
    customerId: string;
    label: string;
    name: string;
    phone: string;
    address: string;
    city: string;
    isDefault?: boolean;
  }): Promise<CustomerAddress>;
  updateCustomerAddress(input: {
    customerId: string;
    addressId: string;
    label?: string;
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    isDefault?: boolean;
  }): Promise<CustomerAddress | null>;
  deleteCustomerAddress(customerId: string, addressId: string): Promise<boolean>;
  setDefaultCustomerAddress(customerId: string, addressId: string): Promise<CustomerAddress | null>;
};

type PrismaProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  mrp: number;
  discount: number;
  images: string[];
  color: string;
  sizes: string[];
  sizeStock: unknown;
  stock: number;
  badge: string;
  fabric: string;
  fit: string;
  rating: number;
  reviews: number;
  description: string;
  tags: string[];
  status: string;
  createdAt: string;
};

type PrismaOrder = {
  id: string;
  customerId: string | null;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  paymentMode: string;
  couponCode: string | null;
  discount: number | null;
  subtotal: number;
  delivery: number;
  total: number;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentReference: string | null;
  createdAt: string;
  lines?: PrismaOrderLine[];
};

type PrismaOrderLine = {
  productId: string;
  slug: string;
  name: string;
  image: string;
  size: string;
  price: number;
  quantity: number;
};

type PrismaCustomer = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PrismaCustomerAddress = {
  id: string;
  customerId: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type PrismaCartLine = {
  productId: string;
  slug: string;
  name: string;
  image: string;
  size: string;
  price: number;
  quantity: number;
};

type PrismaPaymentIntent = {
  id: string;
  orderId: string;
  customerId: string | null;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  receipt: string;
  createdAt: string;
  updatedAt: string;
};

function productFromRow(row: PrismaProduct): Product {
  const sizeStock = parseSizeStock(row.sizeStock, row.sizes, row.stock);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    price: row.price,
    mrp: row.mrp,
    discount: row.discount,
    images: row.images,
    color: row.color,
    sizes: row.sizes,
    sizeStock,
    stock: getTotalStockFromMap(sizeStock),
    badge: row.badge,
    fabric: row.fabric,
    fit: row.fit,
    rating: row.rating,
    reviews: row.reviews,
    description: row.description,
    tags: row.tags,
    status: row.status as Product["status"],
    createdAt: row.createdAt,
  };
}

function orderLineFromRow(row: PrismaOrderLine): CartLine {
  return {
    productId: row.productId,
    slug: row.slug,
    name: row.name,
    image: row.image,
    size: row.size,
    price: row.price,
    quantity: row.quantity,
  };
}

function orderFromRow(row: PrismaOrder, lines: CartLine[]): Order {
  return {
    id: row.id,
    customerId: row.customerId || undefined,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    paymentMode: row.paymentMode,
    couponCode: row.couponCode || undefined,
    discount: row.discount || undefined,
    subtotal: row.subtotal,
    delivery: row.delivery,
    total: row.total,
    status: row.status as Order["status"],
    paymentStatus: (row.paymentStatus || "pending") as Order["paymentStatus"],
    paymentProvider: (row.paymentProvider as Order["paymentProvider"]) || undefined,
    paymentReference: row.paymentReference || undefined,
    lines,
    createdAt: row.createdAt,
  };
}

function customerFromRow(row: PrismaCustomer): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone || undefined,
    passwordHash: row.passwordHash,
    emailVerifiedAt: row.emailVerifiedAt || undefined,
    phoneVerifiedAt: row.phoneVerifiedAt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function customerAddressFromRow(row: PrismaCustomerAddress): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customerId,
    label: row.label,
    name: row.name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function paymentIntentFromRow(row: PrismaPaymentIntent): PaymentIntent {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId || undefined,
    provider: row.provider as PaymentIntent["provider"],
    providerOrderId: row.providerOrderId,
    providerPaymentId: row.providerPaymentId || undefined,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentIntent["status"],
    receipt: row.receipt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function productData(product: Product) {
  const sizeStock = parseSizeStock(product.sizeStock, product.sizes, product.stock);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    mrp: product.mrp,
    discount: product.discount,
    images: product.images,
    color: product.color,
    sizes: product.sizes,
    sizeStock,
    stock: getTotalStockFromMap(sizeStock),
    badge: product.badge,
    fabric: product.fabric,
    fit: product.fit,
    rating: product.rating,
    reviews: product.reviews,
    description: product.description,
    tags: product.tags,
    status: product.status,
    createdAt: product.createdAt,
  };
}

@Injectable()
export class PrismaCommerceRepository implements CommerceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCustomer(input: {
    email: string;
    name: string;
    passwordHash: string;
    phone?: string;
  }) {
    const now = new Date().toISOString();
    const customer: Customer = {
      id: `cus-${crypto.randomUUID()}`,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      phone: input.phone?.trim() || undefined,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    await this.prisma.customer.create({
      data: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone || null,
        passwordHash: customer.passwordHash,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
    });

    return customer;
  }

  async getCustomerByEmail(email: string) {
    const row = await this.prisma.customer.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return row ? customerFromRow(row as PrismaCustomer) : null;
  }

  async getCustomerById(id: string) {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    return row ? customerFromRow(row as PrismaCustomer) : null;
  }

  async updateCustomer(input: {
    id: string;
    name?: string;
    phone?: string;
    emailVerifiedAt?: string;
    phoneVerifiedAt?: string;
  }) {
    const current = await this.getCustomerById(input.id);
    if (!current) return null;

    const next = {
      ...current,
      name: input.name !== undefined ? input.name.trim() : current.name,
      phone: input.phone !== undefined ? input.phone.trim() || undefined : current.phone,
      emailVerifiedAt:
        input.emailVerifiedAt !== undefined ? input.emailVerifiedAt : current.emailVerifiedAt,
      phoneVerifiedAt:
        input.phoneVerifiedAt !== undefined ? input.phoneVerifiedAt : current.phoneVerifiedAt,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.customer.update({
      where: { id: next.id },
      data: {
        name: next.name,
        phone: next.phone || null,
        emailVerifiedAt: next.emailVerifiedAt || null,
        phoneVerifiedAt: next.phoneVerifiedAt || null,
        updatedAt: next.updatedAt,
      },
    });

    return next;
  }

  async getCartLines(customerId: string) {
    const rows = await this.prisma.cartLine.findMany({
      where: { customerId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    return rows.map((row) => orderLineFromRow(row as PrismaCartLine));
  }

  async replaceCartLines(customerId: string, lines: CartLine[]) {
    const now = new Date().toISOString();

    await this.prisma.$transaction([
      this.prisma.cartLine.deleteMany({ where: { customerId } }),
      ...lines.map((line) =>
        this.prisma.cartLine.create({
          data: {
            customerId,
            productId: line.productId,
            slug: line.slug,
            name: line.name,
            image: line.image,
            size: line.size,
            price: line.price,
            quantity: line.quantity,
            updatedAt: now,
          },
        }),
      ),
    ]);

    return this.getCartLines(customerId);
  }

  async getWishlistProductIds(customerId: string) {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return rows.map((row) => row.productId);
  }

  async replaceWishlistProductIds(customerId: string, productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    const now = new Date().toISOString();

    await this.prisma.$transaction([
      this.prisma.wishlistItem.deleteMany({ where: { customerId } }),
      ...uniqueIds.map((productId) =>
        this.prisma.wishlistItem.create({
          data: { customerId, productId, createdAt: now },
        }),
      ),
    ]);

    return this.getWishlistProductIds(customerId);
  }

  async listProducts() {
    const rows = await this.prisma.product.findMany({
      where: { status: "live" },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => productFromRow(row as PrismaProduct));
  }

  async listAllProducts() {
    const rows = await this.prisma.product.findMany({
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => productFromRow(row as PrismaProduct));
  }

  async getProduct(slug: string) {
    const row = await this.prisma.product.findUnique({ where: { slug } });
    return row ? productFromRow(row as PrismaProduct) : null;
  }

  async upsertProduct(input: Partial<Product>) {
    const product = normalizeProductInput(input);
    await this.prisma.product.upsert({
      where: { slug: product.slug },
      create: productData(product),
      update: productData(product),
    });
    return product;
  }

  async updateProduct(originalSlug: string, input: Partial<Product>) {
    const existing = await this.getProduct(originalSlug);
    if (!existing) {
      return null;
    }

    const product = normalizeProductInput({
      ...existing,
      ...input,
      id: existing.id,
      createdAt: input.createdAt ?? existing.createdAt,
    });

    if (product.slug !== originalSlug) {
      const conflict = await this.prisma.product.findUnique({ where: { slug: product.slug } });
      if (conflict && conflict.id !== existing.id) {
        throw new Error("Product slug is already in use.");
      }
    }

    await this.prisma.product.update({
      where: { slug: originalSlug },
      data: productData(product),
    });

    return product;
  }

  async deleteProduct(slug: string) {
    try {
      await this.prisma.product.delete({ where: { slug } });
      return true;
    } catch {
      return false;
    }
  }

  async listOrders() {
    const rows = await this.prisma.order.findMany({
      include: { lines: { orderBy: { id: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) =>
      orderFromRow(
        row as PrismaOrder,
        (row.lines || []).map((line) => orderLineFromRow(line as PrismaOrderLine)),
      ),
    );
  }

  async listOrdersForCustomer(customerId: string, email: string) {
    const rows = await this.prisma.order.findMany({
      where: {
        OR: [
          { customerId },
          { email: { equals: email.trim(), mode: "insensitive" } },
        ],
      },
      include: { lines: { orderBy: { id: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) =>
      orderFromRow(
        row as PrismaOrder,
        (row.lines || []).map((line) => orderLineFromRow(line as PrismaOrderLine)),
      ),
    );
  }

  async getOrder(id: string) {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { orderBy: { id: "asc" } } },
    });

    if (!row) return null;

    return orderFromRow(
      row as PrismaOrder,
      (row.lines || []).map((line) => orderLineFromRow(line as PrismaOrderLine)),
    );
  }

  async createOrder(input: Omit<Order, "id" | "createdAt" | "status">) {
    const order: Order = {
      ...input,
      id: `PAAG-${Date.now().toString().slice(-6)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      status: "Placed",
      paymentStatus: input.paymentStatus || "pending",
      paymentProvider:
        input.paymentProvider || (input.paymentMode === "Cash on Delivery" ? "cod" : undefined),
      createdAt: new Date().toISOString(),
    };

    await this.prisma.$transaction(async (tx) => {
      for (const line of input.lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (product) {
          const sizeStock = parseSizeStock(product.sizeStock, product.sizes, product.stock);
          const nextSizeStock = applySizeStockDelta(sizeStock, line.size, -line.quantity);

          await tx.product.update({
            where: { id: line.productId },
            data: {
              sizeStock: nextSizeStock,
              stock: getTotalStockFromMap(nextSizeStock),
            },
          });
        }
      }

      await tx.order.create({
        data: {
          id: order.id,
          customerId: order.customerId || null,
          customerName: order.customerName,
          email: order.email,
          phone: order.phone,
          address: order.address,
          city: order.city,
          paymentMode: order.paymentMode,
          couponCode: order.couponCode || null,
          discount: order.discount || 0,
          subtotal: order.subtotal,
          delivery: order.delivery,
          total: order.total,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentProvider: order.paymentProvider || null,
          paymentReference: order.paymentReference || null,
          createdAt: order.createdAt,
          lines: {
            create: order.lines.map((line) => ({
              productId: line.productId,
              slug: line.slug,
              name: line.name,
              image: line.image,
              size: line.size,
              price: line.price,
              quantity: line.quantity,
            })),
          },
        },
      });
    });

    return order;
  }

  async adjustOrderStock(lines: CartLine[], direction: "release" | "reserve") {
    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product) continue;

        const sizeStock = parseSizeStock(product.sizeStock, product.sizes, product.stock);
        const delta = direction === "release" ? line.quantity : -line.quantity;
        const nextSizeStock = applySizeStockDelta(sizeStock, line.size, delta);

        await tx.product.update({
          where: { id: line.productId },
          data: {
            sizeStock: nextSizeStock,
            stock: getTotalStockFromMap(nextSizeStock),
          },
        });
      }
    });
  }

  async updateOrderStatus(id: string, status: Order["status"]) {
    await this.prisma.order.update({
      where: { id },
      data: { status },
    });
    return this.getOrder(id);
  }

  async updateOrderPayment(input: {
    id: string;
    paymentStatus: Order["paymentStatus"];
    paymentProvider?: Order["paymentProvider"];
    paymentReference?: string;
    status?: Order["status"];
  }) {
    const current = await this.getOrder(input.id);
    if (!current) return null;

    await this.prisma.order.update({
      where: { id: input.id },
      data: {
        paymentStatus: input.paymentStatus,
        paymentProvider: input.paymentProvider ?? current.paymentProvider ?? null,
        paymentReference: input.paymentReference ?? current.paymentReference ?? null,
        status: input.status ?? current.status,
      },
    });

    return this.getOrder(input.id);
  }

  async createPaymentIntent(input: Omit<PaymentIntent, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const intent: PaymentIntent = {
      ...input,
      id: `pi-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.prisma.paymentIntent.create({
      data: {
        id: intent.id,
        orderId: intent.orderId,
        customerId: intent.customerId || null,
        provider: intent.provider,
        providerOrderId: intent.providerOrderId,
        providerPaymentId: intent.providerPaymentId || null,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        receipt: intent.receipt,
        createdAt: intent.createdAt,
        updatedAt: intent.updatedAt,
      },
    });

    return intent;
  }

  async getPaymentIntentByProviderOrderId(providerOrderId: string) {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { providerOrderId },
    });
    return row ? paymentIntentFromRow(row as PrismaPaymentIntent) : null;
  }

  async updatePaymentIntent(input: {
    id: string;
    providerPaymentId?: string;
    status: PaymentIntent["status"];
  }) {
    const now = new Date().toISOString();
    const current = await this.prisma.paymentIntent.findUnique({ where: { id: input.id } });
    if (!current) return null;

    await this.prisma.paymentIntent.update({
      where: { id: input.id },
      data: {
        providerPaymentId: input.providerPaymentId ?? current.providerPaymentId,
        status: input.status,
        updatedAt: now,
      },
    });

    const row = await this.prisma.paymentIntent.findUnique({ where: { id: input.id } });
    return row ? paymentIntentFromRow(row as PrismaPaymentIntent) : null;
  }

  async recordWebhookEvent(input: {
    id: string;
    provider: string;
    eventId: string;
    eventType: string;
  }) {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: input.id,
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          processedAt: new Date().toISOString(),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async createMediaAsset(input: Omit<MediaAsset, "id" | "createdAt">) {
    const asset: MediaAsset = {
      ...input,
      id: `media-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };

    await this.prisma.mediaAsset.create({
      data: {
        id: asset.id,
        key: asset.key,
        url: asset.url,
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
        uploadedBy: asset.uploadedBy,
        createdAt: asset.createdAt,
      },
    });

    return asset;
  }

  async createVerificationCode(input: {
    customerId: string;
    channel: "email" | "sms";
    destination: string;
    codeHash: string;
    expiresAt: string;
  }) {
    const id = `vc-${crypto.randomUUID()}`;
    await this.prisma.verificationCode.create({
      data: {
        id,
        customerId: input.customerId,
        channel: input.channel,
        destination: input.destination,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        createdAt: new Date().toISOString(),
      },
    });

    return { id };
  }

  async getLatestVerificationCode(input: {
    customerId: string;
    channel: "email" | "sms";
  }) {
    const row = await this.prisma.verificationCode.findFirst({
      where: {
        customerId: input.customerId,
        channel: input.channel,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!row) return null;

    return {
      id: row.id,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      attempts: row.attempts,
      consumedAt: row.consumedAt || undefined,
    };
  }

  async markVerificationCodeConsumed(id: string) {
    await this.prisma.verificationCode.update({
      where: { id },
      data: { consumedAt: new Date().toISOString() },
    });
  }

  async incrementVerificationCodeAttempts(id: string) {
    await this.prisma.verificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async getMetrics(): Promise<Metrics> {
    const [orders, products] = await Promise.all([
      this.prisma.order.aggregate({
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.product.findMany({
        select: { status: true, stock: true },
      }),
    ]);

    return {
      revenue: orders._sum.total || 0,
      orders: orders._count._all || 0,
      liveProducts: products.filter((product) => product.status === "live").length,
      lowStock: products.filter((product) => product.stock <= 10).length,
    };
  }

  async listCustomerAddresses(customerId: string) {
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return rows.map((row) => customerAddressFromRow(row as PrismaCustomerAddress));
  }

  async getCustomerAddress(customerId: string, addressId: string) {
    const row = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });

    return row ? customerAddressFromRow(row as PrismaCustomerAddress) : null;
  }

  async createCustomerAddress(input: {
    customerId: string;
    label: string;
    name: string;
    phone: string;
    address: string;
    city: string;
    isDefault?: boolean;
  }) {
    const now = new Date().toISOString();
    const address: CustomerAddress = {
      id: `addr-${crypto.randomUUID()}`,
      customerId: input.customerId,
      label: input.label.trim() || "Home",
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      isDefault: Boolean(input.isDefault),
      createdAt: now,
      updatedAt: now,
    };

    await this.prisma.$transaction(async (tx) => {
      if (address.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: input.customerId },
          data: { isDefault: false },
        });
      }

      await tx.customerAddress.create({
        data: {
          id: address.id,
          customerId: address.customerId,
          label: address.label,
          name: address.name,
          phone: address.phone,
          address: address.address,
          city: address.city,
          isDefault: address.isDefault,
          createdAt: address.createdAt,
          updatedAt: address.updatedAt,
        },
      });
    });

    return address;
  }

  async updateCustomerAddress(input: {
    customerId: string;
    addressId: string;
    label?: string;
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    isDefault?: boolean;
  }) {
    const current = await this.getCustomerAddress(input.customerId, input.addressId);
    if (!current) return null;

    const next: CustomerAddress = {
      ...current,
      label: input.label !== undefined ? input.label.trim() || "Home" : current.label,
      name: input.name !== undefined ? input.name.trim() : current.name,
      phone: input.phone !== undefined ? input.phone.trim() : current.phone,
      address: input.address !== undefined ? input.address.trim() : current.address,
      city: input.city !== undefined ? input.city.trim() : current.city,
      isDefault: input.isDefault !== undefined ? input.isDefault : current.isDefault,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.$transaction(async (tx) => {
      if (next.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: input.customerId, id: { not: input.addressId } },
          data: { isDefault: false },
        });
      }

      await tx.customerAddress.update({
        where: { id: input.addressId },
        data: {
          label: next.label,
          name: next.name,
          phone: next.phone,
          address: next.address,
          city: next.city,
          isDefault: next.isDefault,
          updatedAt: next.updatedAt,
        },
      });
    });

    return next;
  }

  async deleteCustomerAddress(customerId: string, addressId: string) {
    const current = await this.getCustomerAddress(customerId, addressId);
    if (!current) return false;

    await this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id: addressId } });

      if (current.isDefault) {
        const replacement = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: { updatedAt: "desc" },
        });

        if (replacement) {
          await tx.customerAddress.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return true;
  }

  async setDefaultCustomerAddress(customerId: string, addressId: string) {
    const current = await this.getCustomerAddress(customerId, addressId);
    if (!current) return null;

    await this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });

      await tx.customerAddress.update({
        where: { id: addressId },
        data: { isDefault: true, updatedAt: new Date().toISOString() },
      });
    });

    return this.getCustomerAddress(customerId, addressId);
  }
}

import type { Order, Product } from "./types";

/** Products are created via Studio — not seeded with static assets. */
export const seedProducts: Product[] = [];

export const seedOrders: Order[] = [
  {
    id: "PAAG-1048",
    customerName: "Rhea Malhotra",
    email: "rhea@example.com",
    phone: "9999990001",
    address: "Greater Kailash, New Delhi",
    city: "Delhi",
    paymentMode: "UPI",
    subtotal: 4298,
    delivery: 0,
    total: 4298,
    status: "Placed",
    paymentStatus: "paid",
    paymentProvider: "razorpay",
    paymentReference: "pay_seed_1048",
    lines: [
      {
        productId: "sample-001",
        slug: "sample-coord-set",
        name: "Sample Co-ord Set",
        image: "",
        size: "M",
        price: 1499,
        quantity: 1,
      },
    ],
    createdAt: "2026-06-23T09:10:00.000Z",
  },
];

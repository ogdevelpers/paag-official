export type Product = {
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
  sizeStock: Record<string, number>;
  stock: number;
  badge: string;
  fabric: string;
  fit: string;
  rating: number;
  reviews: number;
  description: string;
  tags: string[];
  status: "live" | "draft";
  createdAt: string;
};

export type Customer = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerProfile = Omit<Customer, "passwordHash">;

export type CustomerAddress = {
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

export type CartLine = {
  productId: string;
  slug: string;
  name: string;
  image: string;
  size: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: string;
  customerId?: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  paymentMode: string;
  couponCode?: string;
  discount?: number;
  subtotal: number;
  delivery: number;
  total: number;
  status: "Placed" | "Packed" | "Shipped" | "Delivered" | "Returned" | "Failed";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentProvider?: "cod" | "razorpay" | "mock" | "cashfree";
  paymentReference?: string;
  lines: CartLine[];
  createdAt: string;
};

export type PaymentIntent = {
  id: string;
  orderId: string;
  customerId?: string;
  provider: "razorpay" | "mock" | "cashfree";
  providerOrderId: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "failed" | "refunded";
  receipt: string;
  createdAt: string;
  updatedAt: string;
};

export type MediaAsset = {
  id: string;
  key: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
};

export type Metrics = {
  revenue: number;
  orders: number;
  liveProducts: number;
  lowStock: number;
};

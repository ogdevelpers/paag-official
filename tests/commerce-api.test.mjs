import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.PAAG_TEST_BASE_URL || "http://localhost:3000";
const qaEmail = `qa+test-${Date.now()}@paag.local`;
let cookie = "";

function updateCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;

  const nextCookie = setCookie
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("paag_customer_session="));

  if (nextCookie) {
    cookie = nextCookie.split(";")[0];
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false && cookie) {
    headers.set("Cookie", cookie);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
  } catch (error) {
    throw new Error(
      `Unable to reach ${baseUrl}. Start the dev server with npm run dev before running tests. ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }

  updateCookie(response);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return { response, body };
}

function checkoutPayload(paymentMode = "Cash on Delivery", line) {
  return {
    customerName: "QA Shopper",
    email: qaEmail,
    phone: "+919999990001",
    address: "QA Lane",
    city: "Delhi",
    paymentMode,
    lines: [
      line || {
        productId: "sample-product",
        slug: "sample-product",
        name: "Sample Product",
        image: "",
        size: "Free",
        price: 1,
        quantity: 1,
      },
    ],
  };
}

test("commerce APIs require customer identity for checkout and preserve signed-in flows", async () => {
  try {
    const products = await request("/api/products", { auth: false });
    assert.equal(products.response.status, 200);
    assert.ok(Array.isArray(products.body.products));

    const liveProduct = products.body.products.find((product) => {
      const sizeStock = product.sizeStock || {};
      return (product.sizes || []).some((size) => Number(sizeStock[size] ?? 0) > 0);
    });
    const checkoutLine = liveProduct
      ? {
          productId: liveProduct.id,
          slug: liveProduct.slug,
          name: liveProduct.name,
          image: liveProduct.images?.[0] || "",
          size:
            liveProduct.sizes.find(
              (size) => Number((liveProduct.sizeStock || {})[size] ?? 0) > 0,
            ) || liveProduct.sizes[0],
          price: liveProduct.price,
          quantity: 1,
        }
      : undefined;
    const productId = checkoutLine?.productId || "sample-product";

    const anonymousCart = await request("/api/account/cart", { auth: false });
    assert.equal(anonymousCart.response.status, 200);
    assert.deepEqual(anonymousCart.body.lines, []);

    const anonymousCartUpdate = await request("/api/account/cart", {
      method: "PUT",
      auth: false,
      json: { lines: checkoutPayload("Cash on Delivery", checkoutLine).lines },
    });
    assert.equal(anonymousCartUpdate.response.status, 401);
    assert.match(anonymousCartUpdate.body.error, /sign in required/i);

    const anonymousCodOrder = await request("/api/orders", {
      method: "POST",
      auth: false,
      json: checkoutPayload("Cash on Delivery", checkoutLine),
    });
    assert.equal(anonymousCodOrder.response.status, 401);
    assert.match(anonymousCodOrder.body.error, /sign in required/i);

    const anonymousPayment = await request("/api/payments/checkout", {
      method: "POST",
      auth: false,
      json: checkoutPayload("Card", checkoutLine),
    });
    assert.equal(anonymousPayment.response.status, 401);
    assert.match(anonymousPayment.body.error, /sign in required/i);

    const anonymousPaymentVerify = await request("/api/payments/verify", {
      method: "POST",
      auth: false,
      json: {
        provider: "mock",
        providerOrderId: "order_mock_missing",
        paymentId: "pay_mock_missing",
      },
    });
    assert.equal(anonymousPaymentVerify.response.status, 401);
    assert.match(anonymousPaymentVerify.body.error, /sign in required/i);

    const registered = await request("/api/account/register", {
      method: "POST",
      auth: false,
      json: {
        name: "QA Shopper",
        email: qaEmail,
        phone: "+919999990001",
        password: "Password123",
      },
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.authenticated, true);
    assert.equal(registered.body.customer.email, qaEmail);
    assert.ok(cookie.includes("paag_customer_session="));

    const cart = await request("/api/account/cart", {
      method: "PUT",
      json: {
        lines: checkoutPayload("Cash on Delivery", checkoutLine).lines,
      },
    });
    assert.equal(cart.response.status, 200);
    if (liveProduct) {
      assert.equal(cart.body.lines[0].price, liveProduct.price);
      if (liveProduct.images?.[0]) {
        assert.match(cart.body.lines[0].image, /^\/api\/media\//);
      }
    }

    const wishlist = await request("/api/account/wishlist", {
      method: "PUT",
      json: { productIds: [productId] },
    });
    assert.equal(wishlist.response.status, 200);
    assert.deepEqual(wishlist.body.productIds, [productId]);

    const order = await request("/api/orders", {
      method: "POST",
      json: checkoutPayload("Cash on Delivery", checkoutLine),
    });
    assert.equal(order.response.status, 201);
    assert.equal(order.body.order.email, qaEmail);
    assert.equal(order.body.order.paymentProvider, "cod");
    assert.equal(order.body.order.paymentStatus, "pending");

    const onlinePayment = await request("/api/payments/checkout", {
      method: "POST",
      json: checkoutPayload("Card", checkoutLine),
    });
    assert.equal(onlinePayment.response.status, 201);
    assert.ok(onlinePayment.body.payment.providerOrderId);
    assert.equal(onlinePayment.body.order.paymentStatus, "pending");
    assert.ok(["mock", "razorpay", "cashfree"].includes(onlinePayment.body.payment.provider));

    const onlineHistoryBeforeVerify = await request("/api/account/orders");
    assert.equal(onlineHistoryBeforeVerify.response.status, 200);
    assert.ok(
      onlineHistoryBeforeVerify.body.orders.some(
        (item) =>
          item.id === onlinePayment.body.order.id &&
          item.paymentStatus === "pending",
      ),
    );

    if (onlinePayment.body.payment.provider === "mock") {
      const verifiedPayment = await request("/api/payments/verify", {
        method: "POST",
        json: {
          provider: "mock",
          providerOrderId: onlinePayment.body.payment.providerOrderId,
          paymentId: "pay_mock_test",
        },
      });
      assert.equal(verifiedPayment.response.status, 200);
      assert.equal(verifiedPayment.body.order.paymentStatus, "paid");
    }

    const orderHistory = await request("/api/account/orders");
    assert.equal(orderHistory.response.status, 200);
    assert.ok(orderHistory.body.orders.some((item) => item.id === order.body.order.id));
  } finally {
    // QA rows remain in Postgres; prune manually in Supabase after repeated runs.
  }
});

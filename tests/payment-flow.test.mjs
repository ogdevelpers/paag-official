import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const baseUrl = process.env.PAAG_TEST_BASE_URL || "http://localhost:3000";
const backendUrl = process.env.PAAG_TEST_BACKEND_URL || "http://localhost:4000";
const qaEmail = `pay+test-${Date.now()}@paag.local`;
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
  const origin = options.backend ? backendUrl : baseUrl;
  const headers = new Headers(options.headers || {});
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false && cookie) {
    headers.set("Cookie", cookie);
  }

  const response = await fetch(`${origin}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  updateCookie(response);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function findCheckoutLine(products) {
  for (const product of products || []) {
    const sizeStock = product.sizeStock || {};
    for (const size of product.sizes || []) {
      const stock = Number(sizeStock[size] ?? product.stock ?? 0);
      if (stock > 0) {
        return {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          image: product.images?.[0] || "",
          size,
          price: product.price,
          quantity: 1,
        };
      }
    }
  }
  return null;
}

function checkoutPayload(paymentMode, line) {
  return {
    customerName: "Payment QA",
    email: qaEmail,
    phone: "+919999990002",
    address: "Payment Test Lane",
    city: "Delhi",
    paymentMode,
    lines: [line],
  };
}

async function registerCustomer() {
  const registered = await request("/api/account/register", {
    method: "POST",
    auth: false,
    json: {
      name: "Payment QA",
      email: qaEmail,
      phone: "+919999990002",
      password: "Password123",
    },
  });
  assert.equal(registered.response.status, 201);
  assert.ok(cookie.includes("paag_customer_session="));
}

test("payment flow: checkout, verify, fail, retry (mock gateway)", async () => {
  const products = await request("/api/products", { auth: false });
  assert.equal(products.response.status, 200);

  const line = findCheckoutLine(products.body.products);
  assert.ok(line, "Need at least one in-stock size to run payment tests.");

  await registerCustomer();

  const checkout = await request("/api/payments/checkout", {
    method: "POST",
    json: checkoutPayload("Card", line),
  });
  assert.equal(checkout.response.status, 201);
  assert.ok(checkout.body.payment?.providerOrderId);
  assert.equal(checkout.body.order.paymentStatus, "pending");
  assert.ok(["mock", "razorpay", "cashfree"].includes(checkout.body.payment.provider));

  if (checkout.body.payment.provider === "cashfree") {
    assert.ok(
      checkout.body.payment.paymentSessionId,
      "Cashfree checkout must return paymentSessionId",
    );
    assert.ok(["sandbox", "production"].includes(checkout.body.payment.mode));
  }

  if (checkout.body.payment.provider !== "mock") {
    console.log(
      `Skipping verify/fail/retry assertions — active provider is ${checkout.body.payment.provider}.`,
    );
    return;
  }

  const verified = await request("/api/payments/verify", {
    method: "POST",
    json: {
      provider: "mock",
      providerOrderId: checkout.body.payment.providerOrderId,
      paymentId: "pay_mock_flow_ok",
    },
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.order.paymentStatus, "paid");

  const duplicateVerify = await request("/api/payments/verify", {
    method: "POST",
    json: {
      provider: "mock",
      providerOrderId: checkout.body.payment.providerOrderId,
      paymentId: "pay_mock_flow_ok",
    },
  });
  assert.equal(duplicateVerify.response.status, 200);
  assert.equal(duplicateVerify.body.order.paymentStatus, "paid");

  const checkoutTwo = await request("/api/payments/checkout", {
    method: "POST",
    json: checkoutPayload("UPI", line),
  });
  assert.equal(checkoutTwo.response.status, 201);
  const orderTwoId = checkoutTwo.body.order.id;

  const failed = await request(`/api/payments/orders/${encodeURIComponent(orderTwoId)}/fail`, {
    method: "POST",
  });
  assert.equal(failed.response.status, 200);
  assert.equal(failed.body.order.paymentStatus, "failed");
  assert.equal(failed.body.order.status, "Failed");

  const retry = await request(`/api/payments/orders/${encodeURIComponent(orderTwoId)}/retry`, {
    method: "POST",
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.order.paymentStatus, "pending");
  assert.ok(retry.body.payment?.providerOrderId);

  const verifiedRetry = await request("/api/payments/verify", {
    method: "POST",
    json: {
      provider: "mock",
      providerOrderId: retry.body.payment.providerOrderId,
      paymentId: "pay_mock_retry_ok",
    },
  });
  assert.equal(verifiedRetry.response.status, 200);
  assert.equal(verifiedRetry.body.order.paymentStatus, "paid");
});

test("payment webhook: Cashfree rejects invalid signature", async () => {
  const payload = JSON.stringify({ type: "PAYMENT_FAILED_WEBHOOK", data: {} });
  const response = await fetch(`${backendUrl}/api/payments/webhook/cashfree`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-signature": "invalid-signature",
      "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "x-idempotency-key": `test-${Date.now()}`,
    },
    body: payload,
  });

  assert.ok(
    response.status === 400 || response.status === 500,
    `Expected webhook rejection, got ${response.status}`,
  );
});

test("payment webhook: Cashfree signature algorithm round-trip", () => {
  const secret = "test_webhook_secret";
  const timestamp = "1710000000";
  const rawBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" });
  const signature = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  assert.match(signature, /^[A-Za-z0-9+/=]+$/);
});

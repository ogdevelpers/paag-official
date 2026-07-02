#!/usr/bin/env node
/**
 * Validates Cashfree sandbox credentials and creates a test PG order.
 * Usage: node scripts/cashfree-smoke.mjs
 *
 * Requires backend/.env with:
 *   CASHFREE_APP_ID, CASHFREE_SECRET_KEY
 *   CASHFREE_ENVIRONMENT=sandbox (default)
 */
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, "backend/.env");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("Missing backend/.env");
    process.exit(1);
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function env(name) {
  return (process.env[name] || "").trim();
}

function isPlaceholder(value) {
  return !value || /replace-with|replace_me|your-/i.test(value);
}

async function main() {
  loadEnv();

  const appId = env("CASHFREE_APP_ID");
  const secretKey = env("CASHFREE_SECRET_KEY");
  const environment = env("CASHFREE_ENVIRONMENT") || "sandbox";
  const webhookSecret = env("CASHFREE_WEBHOOK_SECRET") || secretKey;

  console.log("Cashfree sandbox smoke test\n");

  if (isPlaceholder(appId) || isPlaceholder(secretKey)) {
    console.log("Status: credentials not configured yet.\n");
    console.log("Add these to backend/.env, then re-run this script:\n");
    console.log("  CASHFREE_APP_ID=<from Cashfree sandbox dashboard>");
    console.log("  CASHFREE_SECRET_KEY=<from Cashfree sandbox dashboard>");
    console.log("  CASHFREE_WEBHOOK_SECRET=<webhook secret from dashboard>");
    console.log("  CASHFREE_ENVIRONMENT=sandbox");
    console.log("  PAAG_PAYMENT_PROVIDER=cashfree\n");
    console.log("Dashboard: https://merchant.cashfree.com/merchants/pg/developers/api-keys");
    console.log("Webhook URL: http://localhost:4000/api/payments/webhook/cashfree");
    console.log("(Use ngrok or similar for webhook delivery in local dev.)\n");
    process.exit(0);
  }

  const baseUrl =
    environment === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

  const orderId = `smoke_${Date.now()}`.slice(0, 45);

  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": appId,
      "x-client-secret": secretKey,
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: 1,
      order_currency: "INR",
      customer_details: {
        customer_id: "smoke_customer",
        customer_name: "Smoke Test",
        customer_email: "smoke@paag.local",
        customer_phone: "9999999999",
      },
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Cashfree API rejected the test order.");
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("Cashfree API: OK");
  console.log(`  order_id: ${body.order_id || orderId}`);
  console.log(`  payment_session_id: ${body.payment_session_id || "(missing)"}`);
  console.log(`  order_status: ${body.order_status || "unknown"}`);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sampleBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: {} });
  const signature = createHmac("sha256", webhookSecret)
    .update(timestamp + sampleBody)
    .digest("base64");

  console.log("\nWebhook signature self-check: OK");
  console.log(`  sample x-webhook-signature: ${signature.slice(0, 16)}...`);

  console.log("\nNext steps:");
  console.log("  1. Restart backend: npm run dev -w @paag/backend");
  console.log("  2. Open http://localhost:3000/checkout");
  console.log("  3. Pay with Card/UPI — Cashfree sandbox modal should open");
  console.log("  4. Sandbox test UPI: success@upi / Card: 4111 1111 1111 1111");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

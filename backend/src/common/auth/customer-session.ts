import type { Customer, CustomerProfile } from "../../domain";
import type { Request } from "express";

const customerCookieName = "paag_customer_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

type CustomerSession = {
  customerId: string;
  email: string;
  role: "customer";
  iat: number;
  exp: number;
};

export type AuthError = {
  status: number;
  body: Record<string, unknown>;
};

function getSessionSecret() {
  return (
    process.env.PAAG_CUSTOMER_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    "paag-local-customer-secret-change-before-production"
  );
}

function getAllowedWebOrigin() {
  const configured = process.env.PAAG_WEB_ORIGIN || process.env.FRONTEND_URL;
  if (configured) {
    return configured.split(",")[0]?.trim() || "http://localhost:3000";
  }
  return "http://localhost:3000";
}

function base64UrlEncode(bytes: Uint8Array) {
  const value = Buffer.from(bytes).toString("base64");
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

function readCookie(req: Request, name: string) {
  const fromParser = req.cookies?.[name];
  if (typeof fromParser === "string") return fromParser;

  const cookies = req.headers.cookie || "";
  const match = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isSecureRequest(req: Request) {
  return req.protocol === "https" || req.get("x-forwarded-proto") === "https";
}

function cookieAttributes(req: Request, maxAge: number) {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];

  if (isSecureRequest(req)) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function isAllowedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return true;

  if (origin === getAllowedWebOrigin()) return true;

  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

export function customerProfile(customer: Customer): CustomerProfile {
  const { passwordHash, ...profile } = customer;
  void passwordHash;
  return profile;
}

export async function createCustomerSessionCookie(req: Request, customer: Customer) {
  const now = Math.floor(Date.now() / 1000);
  const session: CustomerSession = {
    customerId: customer.id,
    email: customer.email,
    role: "customer",
    iat: now,
    exp: now + sessionMaxAgeSeconds,
  };
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await sign(payload);

  return `${customerCookieName}=${encodeURIComponent(`${payload}.${signature}`)}; ${cookieAttributes(
    req,
    sessionMaxAgeSeconds,
  )}`;
}

export function clearCustomerSessionCookie(req: Request) {
  return `${customerCookieName}=; ${cookieAttributes(req, 0)}`;
}

export async function readCustomerSession(req: Request) {
  const cookie = readCookie(req, customerCookieName);
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  const expected = await sign(payload);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(payload));
    const session = JSON.parse(decoded) as CustomerSession;
    if (session.role !== "customer" || session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function requireCustomerSession(req: Request) {
  const originError = rejectCrossOriginMutation(req);
  if (originError) {
    return { error: originError, session: null };
  }

  const session = await readCustomerSession(req);
  if (!session) {
    return {
      error: { status: 401, body: { error: "Sign in required" } },
      session: null,
    };
  }

  return { error: null, session };
}

export function rejectCrossOriginMutation(req: Request): AuthError | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return null;
  }

  const origin = req.headers.origin;
  if (!origin) return null;

  if (!isAllowedOrigin(req)) {
    return { status: 403, body: { error: "Invalid request origin" } };
  }

  return null;
}

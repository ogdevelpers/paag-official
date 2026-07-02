import type { Request } from "express";
import { hashPassword, verifyPassword } from "./password";

const studioCookieName = "paag_studio_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;

type StudioSession = {
  email: string;
  role: "studio";
  iat: number;
  exp: number;
};

export type AuthError = {
  status: number;
  body: Record<string, unknown>;
};

let cachedPasswordHash: string | null = null;

function getStudioEmail() {
  return process.env.PAAG_STUDIO_EMAIL || "studio@paag.in";
}

function getSessionSecret() {
  return (
    process.env.PAAG_STUDIO_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    "paag-local-development-secret-change-before-production"
  );
}

function getAllowedWebOrigin() {
  return process.env.PAAG_WEB_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
}

async function getStudioPasswordHash() {
  if (process.env.PAAG_STUDIO_PASSWORD_HASH) {
    return process.env.PAAG_STUDIO_PASSWORD_HASH;
  }

  const password =
    process.env.PAAG_STUDIO_PASSWORD ||
    process.env.PAAG_STUDIO_ACCESS_KEY ||
    "paag-studio-2026";
  if (!cachedPasswordHash) {
    cachedPasswordHash = await hashPassword(password);
  }

  return cachedPasswordHash;
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

export async function verifyStudioCredentials(email: string, password: string) {
  if (email.trim().toLowerCase() !== getStudioEmail().toLowerCase()) {
    return false;
  }

  if (!password) {
    return false;
  }

  const storedHash = await getStudioPasswordHash();
  return verifyPassword(password, storedHash);
}

export async function createStudioSessionCookie(req: Request, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const session: StudioSession = {
    email: email.toLowerCase(),
    role: "studio",
    iat: now,
    exp: now + sessionMaxAgeSeconds,
  };
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await sign(payload);

  return `${studioCookieName}=${encodeURIComponent(`${payload}.${signature}`)}; ${cookieAttributes(
    req,
    sessionMaxAgeSeconds,
  )}`;
}

export function clearStudioSessionCookie(req: Request) {
  return `${studioCookieName}=; ${cookieAttributes(req, 0)}`;
}

export async function readStudioSession(req: Request) {
  const cookie = readCookie(req, studioCookieName);
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  const expected = await sign(payload);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(payload));
    const session = JSON.parse(decoded) as StudioSession;
    if (session.role !== "studio" || session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function isStudioRequest(req: Request) {
  return Boolean(await readStudioSession(req));
}

export async function requireStudioRequest(req: Request): Promise<AuthError | null> {
  if (!isSameOriginMutation(req)) {
    return { status: 403, body: { error: "Invalid request origin" } };
  }

  if (!(await isStudioRequest(req))) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  return null;
}

function isSameOriginMutation(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }

  const origin = req.headers.origin;
  if (!origin) return true;

  return isAllowedOrigin(req);
}

export const studioSessionCookieName = studioCookieName;

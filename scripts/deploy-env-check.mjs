#!/usr/bin/env node
/**
 * Pre-deploy checklist. Run from repo root:
 *   node scripts/deploy-env-check.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return values;
}

function isPlaceholder(value) {
  if (!value) return true;
  return /replace-with|replace_me|your-|YOUR_/i.test(value);
}

const backendEnv = loadEnv(resolve(root, "backend/.env"));
const requiredBackend = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAAG_CUSTOMER_SESSION_SECRET",
  "PAAG_STUDIO_SESSION_SECRET",
  "PAAG_STUDIO_PASSWORD",
];

console.log("PAAG deploy checklist\n");

console.log("Backend env (Render):");
let backendReady = true;
for (const key of requiredBackend) {
  const value = backendEnv[key];
  const ok = !isPlaceholder(value);
  console.log(`  ${ok ? "OK" : "MISSING"} ${key}`);
  if (!ok) backendReady = false;
}

console.log("\nProduction-only (set on host dashboards):");
console.log("  FRONTEND_URL       -> https://your-app.vercel.app");
console.log("  API_INTERNAL_URL   -> https://your-api.onrender.com  (Vercel only)");
console.log("  API_PUBLIC_URL     -> same as Render URL (Cashfree webhooks)");

console.log("\nGitHub:");
console.log("  Push this repo to GitHub before connecting Render/Vercel.");

console.log("\nDatabase:");
console.log("  Run once against production Postgres:");
console.log("    DATABASE_URL=... npm run db:push");
console.log("    DATABASE_URL=... npm run db:seed   # optional demo data");

console.log(
  backendReady
    ? "\nLocal backend/.env looks ready to copy into Render."
    : "\nFill backend/.env (or Render env vars) before deploying.",
);

process.exit(backendReady ? 0 : 1);

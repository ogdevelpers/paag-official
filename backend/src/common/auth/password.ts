const algorithm = "pbkdf2-sha256";
const iterations = 150000;

function base64UrlEncode(bytes: Uint8Array) {
  const value = Buffer.from(bytes).toString("base64");
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function derivePasswordHash(password: string, salt: Uint8Array, rounds: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: rounds,
      salt: new Uint8Array(salt),
    },
    key,
    256,
  );

  return base64UrlEncode(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePasswordHash(password, salt, iterations);
  return `${algorithm}$${iterations}$${base64UrlEncode(salt)}$${digest}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [storedAlgorithm, roundsValue, saltValue, digest] = storedHash.split("$");
  const rounds = Number(roundsValue);

  if (storedAlgorithm !== algorithm || !Number.isInteger(rounds) || !saltValue || !digest) {
    return false;
  }

  const nextDigest = await derivePasswordHash(password, base64UrlDecode(saltValue), rounds);
  return timingSafeEqual(nextDigest, digest);
}

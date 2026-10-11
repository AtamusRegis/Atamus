import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

// scrypt parameters. N must be a power of two; cost ~= N*r.
const N = 16384; // 2^14
const R = 8;
const P = 1;
const KEYLEN = 32;

/**
 * Hash a secret (password or recovery answer).
 * Returns a self-describing string: scrypt$N$r$p$saltHex$hashHex
 */
export async function hashSecret(plain) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verify a secret against a stored hash. Constant-time comparison. */
export async function verifySecret(plain, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(plain, salt, expected.length, {
      N: parseInt(n, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Normalize a recovery answer so small typing differences don't matter:
 * trim ends, lowercase, and collapse internal whitespace.
 */
export function normalizeAnswer(answer) {
  return String(answer).trim().toLowerCase().replace(/\s+/g, " ");
}

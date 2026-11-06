import crypto from "node:crypto";

export const API_KEY_PREFIX = "atlas_live_";
const API_KEY_ENTROPY_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SHA256_HEX_LENGTH = 64;

export interface GeneratedApiKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const entropy = crypto.randomBytes(API_KEY_ENTROPY_BYTES).toString("hex");
  const rawKey = `${API_KEY_PREFIX}${entropy}`;

  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 23),
    keyHash: hashApiKey(rawKey),
  };
}

/**
 * New API keys use salted scrypt. The encoded value is self-describing:
 * scrypt$<salt hex>$<derived key hex>.
 */
export function hashApiKey(apiKey: string): string {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error("API key is required");
  }

  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = crypto.scryptSync(
    normalizedKey,
    salt,
    SCRYPT_KEY_LENGTH,
    {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    },
  );

  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

/** Deterministic digest used only for legacy Project.apiKeyHash lookups and rate-limit keys. */
export function hashLegacyApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey.trim(), "utf8").digest("hex");
}

export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  if (
    typeof rawKey !== "string" ||
    typeof storedHash !== "string" ||
    !rawKey.trim()
  ) {
    return false;
  }

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    const saltHex = parts[1];
    const expectedHex = parts[2];

    if (
      !saltHex ||
      !expectedHex ||
      !/^[a-f0-9]{32}$/i.test(saltHex) ||
      !/^[a-f0-9]{128}$/i.test(expectedHex)
    ) {
      return false;
    }

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    const actual = crypto.scryptSync(
      rawKey.trim(),
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
    );

    return crypto.timingSafeEqual(actual, expected);
  }

  // Backward compatibility for keys issued before the scrypt migration.
  if (
    storedHash.length !== SHA256_HEX_LENGTH ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const computed = Buffer.from(hashLegacyApiKey(rawKey), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return computed.length === stored.length &&
    crypto.timingSafeEqual(computed, stored);
}

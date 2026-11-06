import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  hashLegacyApiKey,
  verifyApiKey,
  API_KEY_PREFIX,
} from "@/lib/api-keys";

describe("generateApiKey", () => {
  it("returns a rawKey starting with atlas_live_", () => {
    expect(generateApiKey().rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it("returns different rawKey values on subsequent calls", () => {
    expect(generateApiKey().rawKey).not.toBe(generateApiKey().rawKey);
  });

  it("stores a salted scrypt hash rather than the raw key", () => {
    const { rawKey, keyHash } = generateApiKey();
    expect(keyHash.startsWith("scrypt$")).toBe(true);
    expect(keyHash).not.toContain(rawKey);
  });
});

describe("hashApiKey", () => {
  it("uses a unique salt for each hash", () => {
    const key = "atlas_live_salted_key";
    expect(hashApiKey(key)).not.toBe(hashApiKey(key));
  });

  it("rejects an empty key", () => {
    expect(() => hashApiKey("  ")).toThrow("API key is required");
  });
});

describe("verifyApiKey", () => {
  it("verifies a matching scrypt hash", () => {
    const { rawKey, keyHash } = generateApiKey();
    expect(verifyApiKey(rawKey, keyHash)).toBe(true);
  });

  it("rejects a wrong key against a scrypt hash", () => {
    const { keyHash } = generateApiKey();
    expect(verifyApiKey("atlas_live_wrongkey", keyHash)).toBe(false);
  });

  it("continues to verify legacy SHA-256 hashes", () => {
    const rawKey = "atlas_live_legacy_key";
    expect(verifyApiKey(rawKey, hashLegacyApiKey(rawKey))).toBe(true);
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyApiKey("atlas_live_key", "not-a-valid-hash")).toBe(false);
  });
});

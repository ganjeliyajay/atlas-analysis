import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

/** Stable SHA-256 fingerprint so JSON object key ordering cannot bypass dedupe. */
export function hashIngestionPayload(payload: unknown): string {
  const serialized = JSON.stringify(canonicalize(payload)) ?? "null";
  return createHash("sha256").update(serialized).digest("hex");
}

import { describe, expect, it } from "vitest";
import { formatUtcNaiveTimestamp, normalizeUtcNaiveTimestamp } from "./date-utils";

describe("UTC timestamp-without-time-zone normalization", () => {
  it("serializes the stored wall-clock timestamp as UTC", () => {
    const databaseTimestamp = new Date(2026, 10, 13, 1, 5, 6, 7);

    expect(formatUtcNaiveTimestamp(databaseTimestamp)).toBe("2026-11-13T01:05:06.007Z");
    expect(normalizeUtcNaiveTimestamp(databaseTimestamp).toISOString()).toBe(
      "2026-11-13T01:05:06.007Z",
    );
  });
});

import { describe, expect, it } from "vitest";
import { hashIngestionPayload } from "@/lib/ingestion/idempotency";

describe("ingestion idempotency payload hashing", () => {
  it("produces the same digest when object keys are reordered", () => {
    const first = [{ eventName: "purchase", properties: { amount: 10, currency: "INR" } }];
    const second = [{ properties: { currency: "INR", amount: 10 }, eventName: "purchase" }];

    expect(hashIngestionPayload(first)).toBe(hashIngestionPayload(second));
  });

  it("produces a different digest when event data changes", () => {
    expect(
      hashIngestionPayload([{ eventName: "purchase", properties: { amount: 10 } }]),
    ).not.toBe(
      hashIngestionPayload([{ eventName: "purchase", properties: { amount: 11 } }]),
    );
  });
});

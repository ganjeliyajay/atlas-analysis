import { describe, expect, it } from "vitest";
import { eventHub, LiveEventPayload } from "@/lib/analytics/event-hub";

describe("LiveEventHub Multi-Tenant & Multi-Instance Verification", () => {
  const sampleEvent: LiveEventPayload = {
    id: "evt-001",
    eventName: "checkout_completed",
    userId: "usr-42",
    sessionId: "sess-99",
    properties: { amount: 150 },
    pageUrl: "/checkout",
    country: "US",
    device: "Desktop",
    browser: "Chrome",
    createdAt: new Date().toISOString(),
    projectId: "proj-1",
    projectName: "E-Commerce",
  };

  it("delivers events to subscribers of the matching tenant", () => {
    const orgId = "tenant-alpha";
    const received: LiveEventPayload[] = [];

    const { unsubscribe, ok } = eventHub.subscribe(orgId, (evt) => {
      received.push(evt);
    });

    expect(ok).toBe(true);

    eventHub.publish(orgId, sampleEvent);

    expect(received.length).toBe(1);
    expect(received[0]?.id).toBe("evt-001");
    expect(received[0]?.eventName).toBe("checkout_completed");

    unsubscribe();
  });

  it("strictly isolates events so Tenant B never receives Tenant A events", () => {
    const tenantA = "tenant-aaa";
    const tenantB = "tenant-bbb";

    const receivedB: LiveEventPayload[] = [];
    const { unsubscribe } = eventHub.subscribe(tenantB, (evt) => {
      receivedB.push(evt);
    });

    // Publish to Tenant A
    eventHub.publish(tenantA, sampleEvent);

    expect(receivedB.length).toBe(0);

    unsubscribe();
  });

  it("stops receiving events after unsubscribe", () => {
    const orgId = "tenant-gamma";
    const received: LiveEventPayload[] = [];

    const { unsubscribe } = eventHub.subscribe(orgId, (evt) => {
      received.push(evt);
    });

    eventHub.publish(orgId, sampleEvent);
    expect(received.length).toBe(1);

    unsubscribe();

    eventHub.publish(orgId, { ...sampleEvent, id: "evt-002" });
    expect(received.length).toBe(1); // Still 1
  });

  it("enforces tenant connection limits (max 50 concurrent streams)", () => {
    const orgId = "tenant-busy";
    const unsubs: (() => void)[] = [];

    for (let i = 0; i < 50; i++) {
      const res = eventHub.subscribe(orgId, () => {});
      expect(res.ok).toBe(true);
      unsubs.push(res.unsubscribe);
    }

    // 51st subscription should be rejected
    const excess = eventHub.subscribe(orgId, () => {});
    expect(excess.ok).toBe(false);
    expect(excess.reason).toContain("Maximum concurrent live streams");

    // Clean up all streams
    unsubs.forEach((unsub) => unsub());

    // Now subscription should succeed again
    const postCleanup = eventHub.subscribe(orgId, () => {});
    expect(postCleanup.ok).toBe(true);
    postCleanup.unsubscribe();
  });
});

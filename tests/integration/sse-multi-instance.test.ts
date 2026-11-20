import { describe, expect, it, afterAll } from "vitest";
import { LiveEventHub, LiveEventPayload } from "@/lib/analytics/event-hub";

describe("LiveEventHub Multi-Instance Cross-Node Communication", () => {
  const dbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL;
  let instanceA: LiveEventHub | null = null;
  let instanceB: LiveEventHub | null = null;

  afterAll(async () => {
    if (instanceA) await instanceA.close();
    if (instanceB) await instanceB.close();
  });

  it("propagates published events across separate cluster instances via PostgreSQL LISTEN/NOTIFY", async () => {
    instanceA = new LiveEventHub(dbUrl);
    instanceB = new LiveEventHub(dbUrl);

    // Give PostgreSQL clients time to establish LISTEN on atlas_live_events
    await new Promise((resolve) => setTimeout(resolve, 500));

    const testOrgId = `test-org-multi-${Date.now()}`;
    const sampleEvent: LiveEventPayload = {
      id: `evt-${Date.now()}`,
      eventName: "cluster_node_broadcast",
      userId: "usr-cluster",
      sessionId: "sess-cluster",
      properties: { test: true },
      pageUrl: "/test",
      country: "US",
      device: "Desktop",
      browser: "Chrome",
      createdAt: new Date().toISOString(),
      projectId: "proj-cluster",
      projectName: "Cluster Node Test",
    };

    const receivedOnInstanceB: LiveEventPayload[] = [];
    const { unsubscribe } = instanceB.subscribe(testOrgId, (evt) => {
      receivedOnInstanceB.push(evt);
    });

    // Publish event from Instance A (which should trigger PostgreSQL pg_notify)
    instanceA.publish(testOrgId, sampleEvent);

    // Wait up to 2 seconds for Instance B's pg client notification event to fire
    const deadline = Date.now() + 2000;
    while (receivedOnInstanceB.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    unsubscribe();

    expect(receivedOnInstanceB.length).toBe(1);
    expect(receivedOnInstanceB[0]?.id).toBe(sampleEvent.id);
    expect(receivedOnInstanceB[0]?.eventName).toBe("cluster_node_broadcast");
  });
});

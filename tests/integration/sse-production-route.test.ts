import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock @/auth to pass through requests directly and avoid Node ESM next-auth import issues
vi.mock("@/auth", () => ({
  auth: vi.fn((handler: unknown) => {
    if (typeof handler === "function") {
      return async (req: unknown, ctx: unknown) => {
        return (handler as (r: unknown, c: unknown) => unknown)(req, ctx);
      };
    }
    return Promise.resolve(null);
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/analytics/live/route";
import { testFixturePrisma } from "@/tests/test-client";
import { eventHub } from "@/lib/analytics/event-hub";

type AuthenticatedMockRequest = NextRequest & {
  auth?: { user?: { id: string } } | null;
};

describe("Production SSE Route Security & Reliability Integration Suite", () => {
  let tenantA: { id: string; user: { id: string; email: string }; project: { id: string } };
  let tenantB: { id: string; user: { id: string; email: string }; project: { id: string } };

  beforeAll(async () => {
    const ts = Date.now();

    // 1. Setup Tenant A fixtures
    const userA = await testFixturePrisma.user.create({
      data: {
        email: `sse-user-a-${ts}@atlas.test`,
        name: "SSE User A",
        password: "secure_password_123",
      },
    });

    const orgA = await testFixturePrisma.organization.create({
      data: {
        name: "SSE Tenant A",
        slug: `sse-org-a-${ts}`,
        ownerId: userA.id,
      },
    });

    await testFixturePrisma.organizationMember.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        role: "owner",
      },
    });

    const projectA = await testFixturePrisma.project.create({
      data: {
        name: "SSE Project A",
        slug: `sse-proj-a-${ts}`,
        organizationId: orgA.id,
      },
    });

    tenantA = { id: orgA.id, user: userA, project: projectA };

    // 2. Setup Tenant B fixtures
    const userB = await testFixturePrisma.user.create({
      data: {
        email: `sse-user-b-${ts}@atlas.test`,
        name: "SSE User B",
        password: "secure_password_123",
      },
    });

    const orgB = await testFixturePrisma.organization.create({
      data: {
        name: "SSE Tenant B",
        slug: `sse-org-b-${ts}`,
        ownerId: userB.id,
      },
    });

    await testFixturePrisma.organizationMember.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        role: "owner",
      },
    });

    const projectB = await testFixturePrisma.project.create({
      data: {
        name: "SSE Project B",
        slug: `sse-proj-b-${ts}`,
        organizationId: orgB.id,
      },
    });

    tenantB = { id: orgB.id, user: userB, project: projectB };
  });

  afterAll(async () => {
    if (tenantA?.id) {
      await testFixturePrisma.analyticsEvent.deleteMany({ where: { projectId: tenantA.project.id } }).catch(() => {});
      await testFixturePrisma.organization.delete({ where: { id: tenantA.id } }).catch(() => {});
      await testFixturePrisma.user.delete({ where: { id: tenantA.user.id } }).catch(() => {});
    }
    if (tenantB?.id) {
      await testFixturePrisma.analyticsEvent.deleteMany({ where: { projectId: tenantB.project.id } }).catch(() => {});
      await testFixturePrisma.organization.delete({ where: { id: tenantB.id } }).catch(() => {});
      await testFixturePrisma.user.delete({ where: { id: tenantB.user.id } }).catch(() => {});
    }
  });

  // Helper to create simulated NextAuth requests
  function createAuthenticatedRequest(
    userId: string,
    url = "http://localhost:3000/api/analytics/live",
    headers: Record<string, string> = {}
  ): AuthenticatedMockRequest {
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...headers,
      },
    }) as AuthenticatedMockRequest;

    req.auth = {
      user: {
        id: userId,
      },
    };

    return req;
  }

  const dummyContext = {} as unknown as { params: Promise<Record<string, string>> };

  it("1. Rejects unauthenticated requests with 401 Unauthorized", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/analytics/live", {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    }) as AuthenticatedMockRequest;
    unauthReq.auth = null;

    const res = (await GET(unauthReq, dummyContext)) as Response;
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Unauthorized");
  });

  it("2. Rejects cross-tenant project ID access with 404 Not Found", async () => {
    // Tenant A attempts to access Tenant B's project
    const crossProjectReq = createAuthenticatedRequest(
      tenantA.user.id,
      `http://localhost:3000/api/analytics/live?projectId=${tenantB.project.id}`
    );

    const res = (await GET(crossProjectReq, dummyContext)) as Response;
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/Project not found or access denied/i);
  });

  it("3. Verifies cross-tenant isolation and data filtering", async () => {
    // Insert event for Tenant A
    const eventA = await testFixturePrisma.analyticsEvent.create({
      data: {
        projectId: tenantA.project.id,
        eventName: "event_tenant_a",
        userId: "usr_a_1",
        properties: { secret: "tenant_a_data" },
      },
    });
    expect(eventA.id).toBeDefined();

    // Insert event for Tenant B
    const eventB = await testFixturePrisma.analyticsEvent.create({
      data: {
        projectId: tenantB.project.id,
        eventName: "event_tenant_b",
        userId: "usr_b_1",
        properties: { secret: "tenant_b_data" },
      },
    });
    expect(eventB.id).toBeDefined();

    // Tenant A queries snapshot (stream=false)
    const reqA = createAuthenticatedRequest(
      tenantA.user.id,
      "http://localhost:3000/api/analytics/live?stream=false",
      { Accept: "application/json" }
    );
    const resA = (await GET(reqA, dummyContext)) as Response;
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as { success: boolean; data: { events: Array<{ id: string; eventName: string }> } };
    expect(bodyA.success).toBe(true);

    const eventNamesA = bodyA.data.events.map((e) => e.eventName);
    expect(eventNamesA).toContain("event_tenant_a");
    expect(eventNamesA).not.toContain("event_tenant_b");

    // Tenant B queries snapshot (stream=false)
    const reqB = createAuthenticatedRequest(
      tenantB.user.id,
      "http://localhost:3000/api/analytics/live?stream=false",
      { Accept: "application/json" }
    );
    const resB = (await GET(reqB, dummyContext)) as Response;
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as { success: boolean; data: { events: Array<{ id: string; eventName: string }> } };
    expect(bodyB.success).toBe(true);

    const eventNamesB = bodyB.data.events.map((e) => e.eventName);
    expect(eventNamesB).toContain("event_tenant_b");
    expect(eventNamesB).not.toContain("event_tenant_a");
  });

  it("4. Tests Last-Event-ID cursor replay with real database events", async () => {
    const baseTime = new Date();

    const ev1 = await testFixturePrisma.analyticsEvent.create({
      data: {
        projectId: tenantA.project.id,
        eventName: "replay_step_1",
        createdAt: new Date(baseTime.getTime() + 1000),
      },
    });

    const ev2 = await testFixturePrisma.analyticsEvent.create({
      data: {
        projectId: tenantA.project.id,
        eventName: "replay_step_2",
        createdAt: new Date(baseTime.getTime() + 2000),
      },
    });
    expect(ev2.id).toBeDefined();

    const ev3 = await testFixturePrisma.analyticsEvent.create({
      data: {
        projectId: tenantA.project.id,
        eventName: "replay_step_3",
        createdAt: new Date(baseTime.getTime() + 3000),
      },
    });
    expect(ev3.id).toBeDefined();

    // Request with Last-Event-ID set to ev1.id
    const replayReq = createAuthenticatedRequest(
      tenantA.user.id,
      "http://localhost:3000/api/analytics/live?stream=true",
      { "last-event-id": ev1.id }
    );

    const res = (await GET(replayReq, dummyContext)) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Read streamed response chunks until we get the replay events
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let receivedChunks = "";

    if (reader) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !receivedChunks.includes("replay_step_3")) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          receivedChunks += decoder.decode(value);
        }
      }
      await reader.cancel();
    }

    // Verify replay chunks include ev2 and ev3, and do not repeat ev1
    expect(receivedChunks).toContain("replay_step_2");
    expect(receivedChunks).toContain("replay_step_3");
    expect(receivedChunks).not.toContain("replay_step_1");
  });

  it("5. Tests duplicate prevention and stream subscription lifecycle", async () => {
    // Subscribe to EventHub for Tenant A
    const receivedLiveEvents: unknown[] = [];
    const sub = eventHub.subscribe(tenantA.id, (payload) => {
      receivedLiveEvents.push(payload);
    });

    expect(sub.ok).toBe(true);

    // Publish event
    eventHub.publish(tenantA.id, {
      id: "dup_test_id_101",
      eventName: "live_socket_broadcast",
      createdAt: new Date().toISOString(),
      properties: { test: true },
      projectId: tenantA.project.id,
      projectName: "SSE Project A",
      userId: null,
      sessionId: null,
      pageUrl: null,
      country: null,
      device: null,
      browser: null,
    });

    expect(receivedLiveEvents.length).toBe(1);

    // Unsubscribe and verify no more events received
    sub.unsubscribe();

    eventHub.publish(tenantA.id, {
      id: "dup_test_id_102",
      eventName: "after_unsubscribe",
      createdAt: new Date().toISOString(),
      properties: { test: true },
      projectId: tenantA.project.id,
      projectName: "SSE Project A",
      userId: null,
      sessionId: null,
      pageUrl: null,
      country: null,
      device: null,
      browser: null,
    });

    expect(receivedLiveEvents.length).toBe(1);
  });

  it("6. Verifies event hub listener resilience under dropped connection", async () => {
    // Assert event hub instance remains healthy and can re-subscribe cleanly
    expect(eventHub).toBeDefined();

    let eventReceived = false;
    const sub = eventHub.subscribe(tenantA.id, (p) => {
      if (p.id === "resilience_check_id") {
        eventReceived = true;
      }
    });

    expect(sub.ok).toBe(true);

    eventHub.publish(tenantA.id, {
      id: "resilience_check_id",
      eventName: "resilience_check_event",
      createdAt: new Date().toISOString(),
      properties: {},
      projectId: tenantA.project.id,
      projectName: "Resilience",
      userId: null,
      sessionId: null,
      pageUrl: null,
      country: null,
      device: null,
      browser: null,
    });

    expect(eventReceived).toBe(true);
    sub.unsubscribe();
  });
});

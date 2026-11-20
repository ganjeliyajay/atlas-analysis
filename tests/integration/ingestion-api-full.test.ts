import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testFixturePrisma } from "@/tests/test-client";
import { POST } from "@/app/api/events/route";
import { NextRequest } from "next/server";
import { generateApiKey } from "@/lib/api-keys";

describe("Stage 6: Ingestion API Full Test Suite", () => {
  let testOrgId: string;
  let testProjectId: string;
  let validApiKey: string;
  let revokedApiKey: string;
  let suspendedOrgId: string;
  let suspendedProjectId: string;
  let suspendedApiKey: string;

  beforeAll(async () => {
    // 1. Create standard active tenant
    const user = await testFixturePrisma.user.create({
      data: {
        email: `ingest-qa-${Date.now()}@test.com`,
        name: "Ingest QA User",
        password: "qa_secure_password_123",
      },
    });

    const org = await testFixturePrisma.organization.create({
      data: {
        name: "Ingest QA Active Org",
        slug: `ingest-active-${Date.now()}`,
        ownerId: user.id,
        eventQuota: 50000,
        status: "active",
      },
    });
    testOrgId = org.id;

    const project = await testFixturePrisma.project.create({
      data: {
        name: "Ingest Active Project",
        slug: `ingest-active-proj-${Date.now()}`,
        organizationId: testOrgId,
      },
    });
    testProjectId = project.id;

    // Create valid API key
    const validGen = generateApiKey();
    validApiKey = validGen.rawKey;

    await testFixturePrisma.apiKey.create({
      data: {
        organizationId: testOrgId,
        projectId: testProjectId,
        name: "QA Valid Key",
        keyPrefix: validGen.keyPrefix,
        keyHash: validGen.keyHash,
      },
    });

    // Create revoked API key
    const revokedGen = generateApiKey();
    revokedApiKey = revokedGen.rawKey;

    await testFixturePrisma.apiKey.create({
      data: {
        organizationId: testOrgId,
        projectId: testProjectId,
        name: "QA Revoked Key",
        keyPrefix: revokedGen.keyPrefix,
        keyHash: revokedGen.keyHash,
        revokedAt: new Date(),
      },
    });

    // 2. Create suspended tenant
    const suspendedOrg = await testFixturePrisma.organization.create({
      data: {
        name: "Ingest QA Suspended Org",
        slug: `ingest-suspended-${Date.now()}`,
        ownerId: user.id,
        eventQuota: 50000,
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: "Payment delinquency",
      },
    });
    suspendedOrgId = suspendedOrg.id;

    const suspendedProj = await testFixturePrisma.project.create({
      data: {
        name: "Ingest Suspended Project",
        slug: `ingest-suspended-proj-${Date.now()}`,
        organizationId: suspendedOrgId,
      },
    });
    suspendedProjectId = suspendedProj.id;

    const suspendedGen = generateApiKey();
    suspendedApiKey = suspendedGen.rawKey;

    await testFixturePrisma.apiKey.create({
      data: {
        organizationId: suspendedOrgId,
        projectId: suspendedProjectId,
        name: "QA Suspended Key",
        keyPrefix: suspendedGen.keyPrefix,
        keyHash: suspendedGen.keyHash,
      },
    });
  });

  afterAll(async () => {
    await testFixturePrisma.apiKey.deleteMany({ where: { organizationId: { in: [testOrgId, suspendedOrgId] } } }).catch(() => {});
    await testFixturePrisma.analyticsEvent.deleteMany({ where: { projectId: { in: [testProjectId, suspendedProjectId] } } }).catch(() => {});
    await testFixturePrisma.project.deleteMany({ where: { organizationId: { in: [testOrgId, suspendedOrgId] } } }).catch(() => {});
    await testFixturePrisma.organization.deleteMany({ where: { id: { in: [testOrgId, suspendedOrgId] } } }).catch(() => {});
  });

  it("rejects requests missing an API key with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "test_event" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects requests with invalid or nonexistent API key with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer atlas_live_nonexistent_key_9999999999",
      },
      body: JSON.stringify({ eventName: "test_event" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects requests with a revoked API key with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${revokedApiKey}`,
      },
      body: JSON.stringify({ eventName: "test_event" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("revoked");
  });

  it("rejects ingestion for a suspended organization with 403", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${suspendedApiKey}`,
      },
      body: JSON.stringify({ eventName: "test_suspended_event" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("suspended");
  });

  it("accepts a valid single event with 202 Accepted", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
      },
      body: JSON.stringify({
        eventName: "qa_single_event",
        userId: "usr_qa_1",
        sessionId: "sess_qa_1",
        properties: { feature: "qa_testing", step: 1 },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.quota).toBeDefined();
  });

  it("accepts a valid batch of events with 202 Accepted", async () => {
    const events = Array.from({ length: 25 }, (_, i) => ({
      eventName: "qa_batch_event",
      userId: `usr_qa_${i}`,
      sessionId: `sess_qa_${i}`,
      properties: { index: i },
    }));

    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
      },
      body: JSON.stringify({ events }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(25);
  });

  it("rejects a batch exceeding 500 events with 400 Bad Request", async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      eventName: "qa_overflow_event",
      userId: `usr_${i}`,
    }));

    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
      },
      body: JSON.stringify({ events }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects events with invalid or missing eventName with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
      },
      body: JSON.stringify({
        eventName: "", // Invalid empty name
        userId: "usr_qa_invalid",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles idempotency replay (202 duplicate: true) and conflict (409)", async () => {
    const idemKey = `qa-idem-${Date.now()}`;
    const eventPayload = {
      eventName: "idempotency_test_event",
      userId: "usr_idem_1",
      properties: { canary: true },
    };

    // 1. First send: 202 Accepted
    const req1 = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify(eventPayload),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(202);
    const body1 = await res1.json();
    expect(body1.accepted).toBe(1);

    // 2. Duplicate send with identical payload: 202 Replayed
    const req2 = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify(eventPayload),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(202);
    const body2 = await res2.json();
    expect(body2.duplicate).toBe(true);

    // 3. Send with SAME key but DIFFERENT payload: 409 Conflict
    const req3 = new NextRequest("http://localhost:3000/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validApiKey}`,
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        eventName: "different_conflicting_event",
        userId: "usr_different",
      }),
    });
    const res3 = await POST(req3);
    expect(res3.status).toBe(409);
    const body3 = await res3.json();
    expect(body3.error).toContain("Idempotency key was already used with a different payload");
  });
});

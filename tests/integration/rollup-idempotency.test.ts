import { describe, it, expect, beforeAll } from "vitest";
import { prismaOps } from "@/lib/prisma-ops";
import { testFixturePrisma } from "@/tests/test-client";
import { rebuildEventRollups } from "@/lib/analytics/rollups";

describe("Rollup engine UTC bucketing and idempotency verification", () => {
  let testOrgId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Find or create an organization for testing
    let org = await testFixturePrisma.organization.findFirst({
      where: { slug: "rollup-test-tenant" },
    });

    if (!org) {
      let owner = await testFixturePrisma.user.findFirst();
      if (!owner) {
        owner = await testFixturePrisma.user.create({
          data: {
            email: "rollup-test@example.com",
            name: "Rollup Tester",
            password: "hashed_dummy_password",
          },
        });
      }

      org = await testFixturePrisma.organization.create({
        data: {
          name: "Rollup Test Tenant",
          slug: "rollup-test-tenant",
          timezone: "Asia/Kolkata", // Reporting timezone must not alter UTC rollup buckets.
          ownerId: owner.id,
        },
      });
    }

    testOrgId = org.id;

    let project = await testFixturePrisma.project.findFirst({
      where: { organizationId: testOrgId, slug: "rollup-test-project" },
    });

    if (!project) {
      project = await testFixturePrisma.project.create({
        data: {
          name: "Rollup Test Project",
          slug: "rollup-test-project",
          organizationId: testOrgId,
        },
      });
    }

    testProjectId = project.id;
    await testFixturePrisma.organization.update({
      where: { id: testOrgId },
      data: { timezone: "Asia/Kolkata" },
    });

    // Clean up any existing boundary test events from previous test runs
    await testFixturePrisma.analyticsEvent.deleteMany({
      where: {
        projectId: testProjectId,
        eventName: "boundary_test_event",
      },
    });
    await testFixturePrisma.eventDailyRollup.deleteMany({
      where: {
        organizationId: testOrgId,
        eventName: "boundary_test_event",
      },
    });
    await testFixturePrisma.eventHourlyRollup.deleteMany({
      where: {
        organizationId: testOrgId,
        eventName: "boundary_test_event",
      },
    });

    // Seed events around midnight boundary
    // 2026-11-12 19:30:00 UTC is 2026-11-13 01:00:00 IST!
    const midnightEventTime = new Date("2026-11-12T19:30:00.000Z");

    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: testProjectId,
          eventName: "boundary_test_event",
          userId: "user_boundary_1",
          sessionId: "sess_boundary_1",
          createdAt: midnightEventTime,
        },
        {
          projectId: testProjectId,
          eventName: "boundary_test_event",
          userId: "user_boundary_2",
          sessionId: "sess_boundary_2",
          createdAt: midnightEventTime,
        },
      ],
    });
  });

  it("places events into UTC calendar day buckets regardless of organization timezone", async () => {
    const now = new Date("2026-11-13T12:00:00.000Z");
    const result = await rebuildEventRollups(now);
    expect(result.dailyBucketsRebuilt).toBeGreaterThan(0);

    // Query daily rollups for boundary_test_event
    const dailyRollup = await prismaOps.$queryRaw<Array<{
      bucketDate: string;
      eventCount: bigint;
      uniqueUsers: bigint;
    }>>`
      SELECT
        "bucketStart"::text AS "bucketDate",
        "eventCount",
        "uniqueUsers"
      FROM event_daily_rollups
      WHERE "organizationId" = ${testOrgId}
        AND "eventName" = 'boundary_test_event'
      ORDER BY "bucketStart" DESC
      LIMIT 1
    `;

    expect(dailyRollup).toHaveLength(1);
    // 2026-11-12 19:30 UTC belongs to the UTC calendar day 2026-11-12.
    expect(dailyRollup[0]?.bucketDate).toBe("2026-11-12");
    expect(Number(dailyRollup[0]?.eventCount)).toBe(2);
    expect(Number(dailyRollup[0]?.uniqueUsers)).toBe(2);
  });

  it("proves running rebuildEventRollups twice yields identical checksums and counts (idempotent)", async () => {
    const now = new Date("2026-11-13T12:00:00.000Z");

    // First run
    const run1 = await rebuildEventRollups(now);
    const count1 = await prismaOps.eventDailyRollup.count({
      where: { organizationId: testOrgId },
    });

    // Second run
    const run2 = await rebuildEventRollups(now);
    const count2 = await prismaOps.eventDailyRollup.count({
      where: { organizationId: testOrgId },
    });

    expect(count1).toBe(count2);
    expect(run1.dailyBucketsRebuilt).toBe(run2.dailyBucketsRebuilt);
  });
});

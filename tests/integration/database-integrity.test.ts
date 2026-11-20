import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testFixturePrisma } from "@/tests/test-client";
import bcrypt from "bcryptjs";

describe("Stage 3: Database & Constraint Integrity Testing", () => {
  let testOrgId: string;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Create clean test fixtures
    const user = await testFixturePrisma.user.create({
      data: {
        email: `db-integrity-${Date.now()}@test.com`,
        password: await bcrypt.hash("Password123!", 10),
        name: "DB Integrity Tester",
      },
    });
    testUserId = user.id;

    const org = await testFixturePrisma.organization.create({
      data: {
        name: "DB Integrity Org",
        slug: `db-integrity-${Date.now()}`,
        ownerId: user.id,
      },
    });
    testOrgId = org.id;

    await testFixturePrisma.organizationMember.create({
      data: {
        organizationId: testOrgId,
        userId: testUserId,
        role: "owner",
      },
    });

    const project = await testFixturePrisma.project.create({
      data: {
        name: "Integrity Project",
        slug: `integrity-proj-${Date.now()}`,
        organizationId: testOrgId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    // Clean up
    await testFixturePrisma.project.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await testFixturePrisma.organizationMember.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await testFixturePrisma.organization.deleteMany({ where: { id: testOrgId } }).catch(() => {});
    await testFixturePrisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
  });

  it("enforces unique constraint on duplicate organization memberships", async () => {
    let duplicateError: (Error & { code?: string }) | null = null;
    try {
      await testFixturePrisma.organizationMember.create({
        data: {
          organizationId: testOrgId,
          userId: testUserId,
          role: "viewer",
        },
      });
    } catch (err: unknown) {
      duplicateError = err as Error & { code?: string };
    }

    expect(duplicateError).not.toBeNull();
    expect(duplicateError?.code).toBe("P2002"); // Unique constraint violation
  });

  it("enforces unique constraint on duplicate API key hashes", async () => {
    const keyHash = `hash_${Date.now()}_unique_test`;
    const keyPrefix = `key_${Date.now().toString().slice(-8)}`;

    await testFixturePrisma.apiKey.create({
      data: {
        name: "Primary Key",
        keyPrefix,
        keyHash,
        organizationId: testOrgId,
        projectId: testProjectId,
      },
    });

    let duplicateError: (Error & { code?: string }) | null = null;
    try {
      await testFixturePrisma.apiKey.create({
        data: {
          name: "Duplicate Key",
          keyPrefix: `diff_${Date.now().toString().slice(-8)}`,
          keyHash, // Same hash!
          organizationId: testOrgId,
          projectId: testProjectId,
        },
      });
    } catch (err: unknown) {
      duplicateError = err as Error & { code?: string };
    }

    expect(duplicateError).not.toBeNull();
    expect(duplicateError?.code).toBe("P2002");
  });

  it("enforces unique constraint on duplicate ingestion idempotency keys", async () => {
    const idempotencyKey = `idem_${Date.now()}_test`;
    const expiresAt = new Date(Date.now() + 86400000);

    await testFixturePrisma.ingestionIdempotencyKey.create({
      data: {
        projectId: testProjectId,
        key: idempotencyKey,
        payloadHash: "hash123",
        response: { message: "ok" },
        expiresAt,
      },
    });

    let duplicateError: (Error & { code?: string }) | null = null;
    try {
      await testFixturePrisma.ingestionIdempotencyKey.create({
        data: {
          projectId: testProjectId,
          key: idempotencyKey, // Same key in same project
          payloadHash: "hash456",
          response: { message: "duplicate" },
          expiresAt,
        },
      });
    } catch (err: unknown) {
      duplicateError = err as Error & { code?: string };
    }

    expect(duplicateError).not.toBeNull();
    expect(duplicateError?.code).toBe("P2002");
  });

  it("enforces foreign key constraints when inserting events with invalid project IDs", async () => {
    let fkError: (Error & { code?: string }) | null = null;
    try {
      await testFixturePrisma.analyticsEvent.create({
        data: {
          projectId: "00000000-0000-0000-0000-000000000000", // Nonexistent project
          eventName: "test_fk_event",
          userId: "usr_fk",
        },
      });
    } catch (err: unknown) {
      fkError = err as Error & { code?: string };
    }

    expect(fkError).not.toBeNull();
    expect(fkError?.code).toBe("P2003"); // Foreign key violation
  });

  it("verifies interactive transaction rollback on failure (atomicity)", async () => {
    const canarySlug = `rollback-canary-${Date.now()}`;

    let txError: Error | null = null;
    try {
      await testFixturePrisma.$transaction(async (tx) => {
        // Step 1: Create a project
        await tx.project.create({
          data: {
            name: "Canary Project",
            slug: canarySlug,
            organizationId: testOrgId,
          },
        });

        // Step 2: Deliberately throw an error
        throw new Error("Simulated transactional failure");
      });
    } catch (err: unknown) {
      txError = err as Error;
    }

    expect(txError).not.toBeNull();
    expect(txError?.message).toBe("Simulated transactional failure");

    // Verify Step 1 was rolled back completely
    const canary = await testFixturePrisma.project.findFirst({
      where: { slug: canarySlug },
    });
    expect(canary).toBeNull();
  });
});

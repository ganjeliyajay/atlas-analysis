import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

describe("audit_logs database role permission boundary", () => {
  const appClient = new Client({
    connectionString: process.env.DATABASE_URL_APP,
  });

  const opsClient = new Client({
    connectionString: process.env.DATABASE_URL_OPS,
  });

  beforeAll(async () => {
    await appClient.connect();
    await opsClient.connect();
  });

  afterAll(async () => {
    await appClient.end().catch(() => {});
    await opsClient.end().catch(() => {});
  });

  it("proves atlas_app is strictly forbidden from querying audit_logs (SELECT)", async () => {
    let queryError: (Error & { code?: string }) | null = null;
    try {
      await appClient.query('SELECT count(*) FROM "audit_logs";');
    } catch (err: unknown) {
      queryError = err as Error & { code?: string };
    }

    expect(queryError).not.toBeNull();
    // PostgreSQL error 42501 is insufficient_privilege
    expect(queryError?.code).toBe("42501");
    expect(queryError?.message.toLowerCase()).toContain("permission denied");
  });

  it("proves atlas_app is strictly forbidden from updating audit_logs (UPDATE)", async () => {
    let queryError: (Error & { code?: string }) | null = null;
    try {
      await appClient.query('UPDATE "audit_logs" SET "action" = \'tampered\';');
    } catch (err: unknown) {
      queryError = err as Error & { code?: string };
    }

    expect(queryError).not.toBeNull();
    expect(queryError?.code).toBe("42501");
    expect(queryError?.message.toLowerCase()).toContain("permission denied");
  });

  it("proves atlas_app is strictly forbidden from deleting audit_logs (DELETE)", async () => {
    let queryError: (Error & { code?: string }) | null = null;
    try {
      await appClient.query('DELETE FROM "audit_logs";');
    } catch (err: unknown) {
      queryError = err as Error & { code?: string };
    }

    expect(queryError).not.toBeNull();
    expect(queryError?.code).toBe("42501");
    expect(queryError?.message.toLowerCase()).toContain("permission denied");
  });

  it("proves atlas_app is permitted to append audit records (INSERT without SELECT)", async () => {
    // Obtain a valid user ID for foreign key constraint using opsClient (SELECT)
    const userRes = await opsClient.query('SELECT id FROM "User" LIMIT 1;');
    expect(userRes.rows.length).toBeGreaterThan(0);
    const validUserId = userRes.rows[0].id;

    const testAuditId = `test_app_audit_${Date.now()}`;
    const insertResult = await appClient.query(
      `INSERT INTO "audit_logs" ("id", "actorId", "action", "targetType", "targetId", "details", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW());`,
      [testAuditId, validUserId, "security.test_event", "organization", "org_perm_test", JSON.stringify({ ok: true })]
    );

    expect(insertResult.rowCount).toBe(1);
  });

  it("proves atlas_ops can read audit_logs for platform governance (SELECT)", async () => {
    const result = await opsClient.query('SELECT count(*) FROM "audit_logs";');
    expect(result.rows).toBeDefined();
    expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("proves atlas_ops is strictly forbidden from deleting audit_logs (DELETE)", async () => {
    let deleteError: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query('DELETE FROM "audit_logs";');
    } catch (err: unknown) {
      deleteError = err as Error & { code?: string };
    }

    expect(deleteError).not.toBeNull();
    expect(deleteError?.code).toBe("42501");
    expect(deleteError?.message.toLowerCase()).toContain("permission denied");
  });

  it("proves atlas_ops is strictly forbidden from updating audit_logs (UPDATE)", async () => {
    let updateError: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query('UPDATE "audit_logs" SET "action" = \'tampered\';');
    } catch (err: unknown) {
      updateError = err as Error & { code?: string };
    }

    expect(updateError).not.toBeNull();
    expect(updateError?.code).toBe("42501");
    expect(updateError?.message.toLowerCase()).toContain("permission denied");
  });

  it("proves atlas_ops is strictly forbidden from truncating audit_logs (TRUNCATE)", async () => {
    let truncateError: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query('TRUNCATE TABLE "audit_logs";');
    } catch (err: unknown) {
      truncateError = err as Error & { code?: string };
    }

    expect(truncateError).not.toBeNull();
    expect(truncateError?.code).toBe("42501");
    expect(truncateError?.message.toLowerCase()).toContain("permission denied");
  });
});

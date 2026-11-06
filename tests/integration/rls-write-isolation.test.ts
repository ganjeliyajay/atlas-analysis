
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const connectionString = process.env.DATABASE_URL_APP;

if (!connectionString) {
  throw new Error("DATABASE_URL_APP is required for RLS tests");
}

const pool = new Pool({
  connectionString,
  max: 1,
});

async function setUserContext(
  client: PoolClient,
  userId: string,
): Promise<void> {
  await client.query(
    `SELECT set_config('app.user_id', $1, true)`,
    [userId],
  );
}

async function setTenantContext(
  client: PoolClient,
  organizationId: string,
): Promise<void> {
  await client.query(
    `SELECT set_config('app.tenant_id', $1, true)`,
    [organizationId],
  );
}

async function expectRlsViolation(
  client: PoolClient,
  query: string,
  values: unknown[],
): Promise<void> {
  await client.query("SAVEPOINT rls_write_check");

  try {
    await client.query(query, values);
    throw new Error("Expected PostgreSQL RLS violation, but query succeeded");
  } catch (error) {
    const pgError = error as { code?: string };

    if (pgError.code !== "42501") {
      throw error;
    }
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT rls_write_check");
    await client.query("RELEASE SAVEPOINT rls_write_check");
  }
}

describe("PostgreSQL RLS Write Isolation", () => {
  let client: PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });

  it(
    "must prevent one tenant from modifying another tenant's data",
    async () => {
      const suffix = randomUUID();

      const userA = randomUUID();
      const userB = randomUUID();
      const adminA = randomUUID();

      const tenantA = randomUUID();
      const tenantB = randomUUID();

      const projectA = randomUUID();
      const projectB = randomUUID();

      const eventA = randomUUID();
      const eventB = randomUUID();
      const crossTenantEvent = randomUUID();

      await client.query("BEGIN");

      try {
        // Verify the application database role.
        const roleResult = await client.query(
          `SELECT current_user AS role_name`,
        );

        expect(roleResult.rows[0]?.role_name).toBe("atlas_app");

        // Create test users.
        await client.query(
          `INSERT INTO "User"
            ("id", "name", "email", "password")
           VALUES
            ($1, $2, $3, $4),
            ($5, $6, $7, $8),
            ($9, $10, $11, $12)`,
          [
            userA,
            "RLS Write User A",
            `write-a-${suffix}@example.test`,
            "test-password-hash",
            userB,
            "RLS Write User B",
            `write-b-${suffix}@example.test`,
            "test-password-hash",
            adminA,
            "RLS Write Admin A",
            `write-admin-a-${suffix}@example.test`,
            "test-password-hash",
          ],
        );

        // Create Tenant A.
        await setUserContext(client, userA);

        await client.query(
          `INSERT INTO "Organization"
            ("id", "name", "slug", "ownerId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [tenantA, "RLS Write Tenant A", `write-a-${suffix}`, userA],
        );

        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), userA, tenantA, "owner"],
        );

        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), adminA, tenantA, "admin"],
        );

        // Create Tenant B.
        await setUserContext(client, userB);

        await client.query(
          `INSERT INTO "Organization"
            ("id", "name", "slug", "ownerId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [tenantB, "RLS Write Tenant B", `write-b-${suffix}`, userB],
        );

        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), userB, tenantB, "owner"],
        );

        // Create Tenant A project and event.
        await setTenantContext(client, tenantA);

        await client.query(
          `INSERT INTO "Project"
            ("id", "name", "slug", "organizationId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [projectA, "Write Project A", `write-project-a-${suffix}`, tenantA],
        );

        await client.query(
          `INSERT INTO "AnalyticsEvent"
            ("id", "eventName", "projectId")
           VALUES ($1, $2, $3)`,
          [eventA, "write_event_a", projectA],
        );

        // Create Tenant B project and event.
        await setTenantContext(client, tenantB);

        await client.query(
          `INSERT INTO "Project"
            ("id", "name", "slug", "organizationId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [projectB, "Write Project B", `write-project-b-${suffix}`, tenantB],
        );

        await client.query(
          `INSERT INTO "AnalyticsEvent"
            ("id", "eventName", "projectId")
           VALUES ($1, $2, $3)`,
          [eventB, "write_event_b", projectB],
        );

        // Switch to Tenant A.
        await setTenantContext(client, tenantA);

        // 1. Tenant A cannot INSERT a project into Tenant B.
        await expectRlsViolation(
          client,
          `INSERT INTO "Project"
            ("id", "name", "slug", "organizationId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            randomUUID(),
            "Unauthorized Project",
            `unauthorized-${suffix}`,
            tenantB,
          ],
        );

        // 2. Tenant A cannot INSERT an event into Tenant B's project.
        await expectRlsViolation(
          client,
          `INSERT INTO "AnalyticsEvent"
            ("id", "eventName", "projectId")
           VALUES ($1, $2, $3)`,
          [crossTenantEvent, "unauthorized_event", projectB],
        );

        // 3. Tenant A cannot UPDATE Tenant B's project.
        const projectUpdate = await client.query(
          `UPDATE "Project"
           SET "name" = $1
           WHERE "id" = $2`,
          ["Hacked Project", projectB],
        );

        expect(projectUpdate.rowCount).toBe(0);

        // 4. Tenant A cannot DELETE Tenant B's project.
        const projectDelete = await client.query(
          `DELETE FROM "Project"
           WHERE "id" = $1`,
          [projectB],
        );

        expect(projectDelete.rowCount).toBe(0);

        // 5. Tenant A cannot UPDATE Tenant B's event.
        const eventUpdate = await client.query(
          `UPDATE "AnalyticsEvent"
           SET "eventName" = $1
           WHERE "id" = $2`,
          ["hacked_event", eventB],
        );

        expect(eventUpdate.rowCount).toBe(0);

        // 6. Tenant A cannot DELETE Tenant B's event.
        const eventDelete = await client.query(
          `DELETE FROM "AnalyticsEvent"
           WHERE "id" = $1`,
          [eventB],
        );

        expect(eventDelete.rowCount).toBe(0);

        // 7. Tenant A's own project and event remain accessible.
        const ownProject = await client.query(
          `SELECT "id" FROM "Project" WHERE "id" = $1`,
          [projectA],
        );

        const ownEvent = await client.query(
          `SELECT "id" FROM "AnalyticsEvent" WHERE "id" = $1`,
          [eventA],
        );

        expect(ownProject.rowCount).toBe(1);
        expect(ownEvent.rowCount).toBe(1);

        // 8. An organization admin cannot promote anyone to owner or remove
        // the canonical owner, even when issuing direct SQL without app filters.
        await setUserContext(client, adminA);
        await setTenantContext(client, tenantA);

        await expectRlsViolation(
          client,
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, 'owner')`,
          [randomUUID(), adminA, tenantA],
        );

        await expectRlsViolation(
          client,
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, 'admin')`,
          [randomUUID(), userB, tenantA],
        );

        const ownerDemotion = await client.query(
          `UPDATE "OrganizationMember"
           SET "role" = 'viewer'
           WHERE "organizationId" = $1 AND "userId" = $2`,
          [tenantA, userA],
        );
        expect(ownerDemotion.rowCount).toBe(0);

        const ownerRemoval = await client.query(
          `DELETE FROM "OrganizationMember"
           WHERE "organizationId" = $1 AND "userId" = $2`,
          [tenantA, userA],
        );
        expect(ownerRemoval.rowCount).toBe(0);

        // 9. Tenant B's project and event remain unchanged.
        await setUserContext(client, userA);
        await setTenantContext(client, tenantB);

        const protectedProject = await client.query(
          `SELECT "id", "name" FROM "Project" WHERE "id" = $1`,
          [projectB],
        );

        const protectedEvent = await client.query(
          `SELECT "id", "eventName" FROM "AnalyticsEvent" WHERE "id" = $1`,
          [eventB],
        );

        expect(protectedProject.rowCount).toBe(1);
        expect(protectedProject.rows[0]?.name).toBe("Write Project B");

        expect(protectedEvent.rowCount).toBe(1);
        expect(protectedEvent.rows[0]?.eventName).toBe("write_event_b");
      } finally {
        // Roll back all temporary test data.
        await client.query("ROLLBACK");
      }
    },
    30000,
  );
});

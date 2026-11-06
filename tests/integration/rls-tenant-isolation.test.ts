
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

describe("PostgreSQL RLS Tenant Isolation", () => {
  let client: PoolClient | undefined;

  beforeAll(async () => {
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });

  it(
    "must prevent Tenant A from reading Tenant B events without WHERE",
    async () => {
      if (!client) {
        throw new Error("Database client is not initialized");
      }

      const suffix = randomUUID();

      const userA = randomUUID();
      const userB = randomUUID();

      const tenantA = randomUUID();
      const tenantB = randomUUID();

      const projectA = randomUUID();
      const projectB = randomUUID();

      const eventA = randomUUID();
      const eventB = randomUUID();

      await client.query("BEGIN");

      try {
        // Verify the actual database role.
        const roleResult = await client.query(
          `SELECT current_user AS role_name`,
        );

        expect(roleResult.rows[0]?.role_name).toBe("atlas_app");

        const roleSecurity = await client.query(
          `SELECT rolsuper, rolbypassrls
           FROM pg_roles
           WHERE rolname = current_user`,
        );
        expect(roleSecurity.rows[0]?.rolsuper).toBe(false);
        expect(roleSecurity.rows[0]?.rolbypassrls).toBe(false);

        // Create test users.
        await client.query(
          `INSERT INTO "User"
            ("id", "name", "email", "password")
           VALUES
            ($1, $2, $3, $4),
            ($5, $6, $7, $8)`,
          [
            userA,
            "RLS Test User A",
            `rls-a-${suffix}@example.test`,
            "test-password-hash",
            userB,
            "RLS Test User B",
            `rls-b-${suffix}@example.test`,
            "test-password-hash",
          ],
        );

        // Create Tenant A.
        await setUserContext(client, userA);

        await client.query(
          `INSERT INTO "Organization"
            ("id", "name", "slug", "ownerId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [tenantA, "RLS Tenant A", `rls-a-${suffix}`, userA],
        );

        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), userA, tenantA, "owner"],
        );

        // Create Tenant B.
        await setUserContext(client, userB);

        await client.query(
          `INSERT INTO "Organization"
            ("id", "name", "slug", "ownerId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [tenantB, "RLS Tenant B", `rls-b-${suffix}`, userB],
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
          [
            projectA,
            "Tenant A Project",
            `project-a-${suffix}`,
            tenantA,
          ],
        );

        await client.query(
          `INSERT INTO "AnalyticsEvent"
            ("id", "eventName", "projectId")
           VALUES ($1, $2, $3)`,
          [eventA, "tenant_a_event", projectA],
        );

        // Create Tenant B project and event.
        await setTenantContext(client, tenantB);

        await client.query(
          `INSERT INTO "Project"
            ("id", "name", "slug", "organizationId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            projectB,
            "Tenant B Project",
            `project-b-${suffix}`,
            tenantB,
          ],
        );

        await client.query(
          `INSERT INTO "AnalyticsEvent"
            ("id", "eventName", "projectId")
           VALUES ($1, $2, $3)`,
          [eventB, "tenant_b_event", projectB],
        );

        // SECURITY TEST:
        // Tenant A must never read Tenant B events.
        await setTenantContext(client, tenantA);

        const resultA = await client.query(
          `SELECT * FROM "AnalyticsEvent"`,
        );

        expect(resultA.rows).toHaveLength(1);
        expect(resultA.rows[0]?.id).toBe(eventA);

        expect(
          resultA.rows.some(
            (row: { id: string }) => row.id === eventB,
          ),
        ).toBe(false);

        // Reverse isolation test.
        await setTenantContext(client, tenantB);

        const resultB = await client.query(
          `SELECT * FROM "AnalyticsEvent"`,
        );

        expect(resultB.rows).toHaveLength(1);
        expect(resultB.rows[0]?.id).toBe(eventB);

        expect(
          resultB.rows.some(
            (row: { id: string }) => row.id === eventA,
          ),
        ).toBe(false);

        // No tenant context must expose no events.
        await client.query(
          `SELECT set_config('app.tenant_id', '', true)`,
        );

        const resultWithoutTenant = await client.query(
          `SELECT * FROM "AnalyticsEvent"`,
        );

        expect(resultWithoutTenant.rows).toHaveLength(0);
      } finally {
        // All test data is rolled back.
        await client.query("ROLLBACK");
      }
    },
    30000,
  );
});

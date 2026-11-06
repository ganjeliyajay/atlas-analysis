
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const connectionString = process.env.DATABASE_URL_APP;

if (!connectionString) {
  throw new Error("DATABASE_URL_APP is required for ownership tests");
}

const pool = new Pool({
  connectionString,
  max: 1,
});

async function setUserContext(
  client: PoolClient,
  userId: string
): Promise<void> {
  await client.query(
    `SELECT set_config('app.user_id', $1, true)`,
    [userId]
  );
}

async function setTenantContext(
  client: PoolClient,
  organizationId: string
): Promise<void> {
  await client.query(
    `SELECT set_config('app.tenant_id', $1, true)`,
    [organizationId]
  );
}

describe("Organization Ownership Transfer", () => {
  let client: PoolClient | undefined;

  beforeAll(async () => {
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });

  it(
    "must atomically transfer ownership and reject the previous owner",
    async () => {
      if (!client) {
        throw new Error("Database client is not initialized");
      }

      const suffix = randomUUID();

      const ownerId = randomUUID();
      const targetUserId = randomUUID();
      const organizationId = randomUUID();

      await client.query("BEGIN");

      try {
        // Verify the application database role.
        const roleResult = await client.query(
          `SELECT current_user AS role_name`
        );

        expect(roleResult.rows[0]?.role_name).toBe("atlas_app");

        // Create test users.
        await client.query(
          `INSERT INTO "User"
            ("id", "name", "email", "password")
           VALUES
            ($1, $2, $3, $4),
            ($5, $6, $7, $8)`,
          [
            ownerId,
            "Ownership Test Owner",
            `owner-${suffix}@example.test`,
            "test-password-hash",
            targetUserId,
            "Ownership Test Target",
            `target-${suffix}@example.test`,
            "test-password-hash",
          ]
        );

        // Create organization as the initial owner.
        await setUserContext(client, ownerId);

        await client.query(
          `INSERT INTO "Organization"
            ("id", "name", "slug", "ownerId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            organizationId,
            "Ownership Transfer Test",
            `ownership-${suffix}`,
            ownerId,
          ]
        );

        // Create initial owner membership.
        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [
            randomUUID(),
            ownerId,
            organizationId,
            "owner",
          ]
        );

        // Set tenant context.
        await setTenantContext(client, organizationId);

        // Add target user as a regular member.
        await client.query(
          `INSERT INTO "OrganizationMember"
            ("id", "userId", "organizationId", "role")
           VALUES ($1, $2, $3, $4)`,
          [
            randomUUID(),
            targetUserId,
            organizationId,
            "member",
          ]
        );

        // ==========================================
        // TEST 1: Successful ownership transfer
        // ==========================================

        await client.query(
          `SELECT public.transfer_organization_ownership($1, $2)`,
          [organizationId, targetUserId]
        );

        // Read the updated organization.
        const organizationResult = await client.query(
          `SELECT "ownerId"
           FROM "Organization"
           WHERE "id" = $1`,
          [organizationId]
        );

        expect(organizationResult.rows[0]?.ownerId).toBe(
          targetUserId
        );

        // Read membership roles.
        const membershipResult = await client.query(
          `SELECT "userId", "role"
           FROM "OrganizationMember"
           WHERE "organizationId" = $1`,
          [organizationId]
        );

        const previousOwner = membershipResult.rows.find(
          (row: { userId: string }) => row.userId === ownerId
        );

        const newOwner = membershipResult.rows.find(
          (row: { userId: string }) => row.userId === targetUserId
        );

        expect(previousOwner?.role).toBe("admin");
        expect(newOwner?.role).toBe("owner");

        const ownerCount = membershipResult.rows.filter(
          (row: { role: string }) => row.role === "owner"
        ).length;

        expect(ownerCount).toBe(1);

        // ==========================================
        // TEST 2: Previous owner cannot transfer again
        // ==========================================

        await client.query("SAVEPOINT unauthorized_transfer");

        await setUserContext(client, ownerId);

        let unauthorizedError: unknown;

        try {
          await client.query(
            `SELECT public.transfer_organization_ownership($1, $2)`,
            [organizationId, targetUserId]
          );
        } catch (error) {
          unauthorizedError = error;
        }

        expect(unauthorizedError).toBeDefined();

        expect(
          (unauthorizedError as { code?: string }).code
        ).toBe("42501");

        await client.query(
          "ROLLBACK TO SAVEPOINT unauthorized_transfer"
        );

        await client.query(
          "RELEASE SAVEPOINT unauthorized_transfer"
        );

        // ==========================================
        // TEST 3: Ownership remains unchanged
        // ==========================================

        const finalOrganizationResult = await client.query(
          `SELECT "ownerId"
           FROM "Organization"
           WHERE "id" = $1`,
          [organizationId]
        );

        expect(
          finalOrganizationResult.rows[0]?.ownerId
        ).toBe(targetUserId);

        const finalOwnerCount = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM "OrganizationMember"
           WHERE "organizationId" = $1
             AND "role" = 'owner'`,
          [organizationId]
        );

        expect(finalOwnerCount.rows[0]?.count).toBe(1);
      } finally {
        // Remove all test data through transaction rollback.
        await client.query("ROLLBACK");
      }
    },
    30000
  );
});

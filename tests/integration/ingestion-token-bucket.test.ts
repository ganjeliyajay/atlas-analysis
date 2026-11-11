
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";

const appUrl = process.env.DATABASE_URL_APP;
const migrationUrl = process.env.DATABASE_URL_MIGRATION;

const describeWithDatabase =
  appUrl && migrationUrl ? describe : describe.skip;

const appPool = appUrl
  ? new Pool({ connectionString: appUrl, max: 2 })
  : undefined;

const migrationPool = migrationUrl
  ? new Pool({ connectionString: migrationUrl, max: 1 })
  : undefined;

describeWithDatabase("PostgreSQL ingestion token bucket", () => {
  afterAll(async () => {
    await appPool?.end();
    await migrationPool?.end();
  });

  it(
    "serializes concurrent consumption under tenant RLS",
    async () => {
      if (!appPool || !migrationPool) {
        throw new Error(
          "Application and migration database pools are required",
        );
      }

      const organizationId = randomUUID();
      const ownerId = randomUUID();
      const uniqueId = randomUUID();

      const email = `token-test-${uniqueId}@example.test`;
      const slug = `token-test-${uniqueId}`;

      const keyHash = createHash("sha256")
        .update(randomUUID())
        .digest("hex");

      // Create isolated test fixtures using the migration connection.
      const fixtureClient = await migrationPool.connect();

      try {
        const database = await fixtureClient.query(
          "SELECT current_database() AS db",
        );

        if (database.rows[0]?.db !== "atlas_analytics_test") {
          throw new Error(
            "Safety check failed: test fixtures can only be created in atlas_analytics_test",
          );
        }

        await fixtureClient.query("BEGIN");

        await fixtureClient.query(
          `INSERT INTO public."User"
            ("id", "name", "email", "password", "role", "createdAt")
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            ownerId,
            "Token Bucket Test Owner",
            email,
            "integration-test-only-password",
            "owner",
          ],
        );

        await fixtureClient.query(
          `INSERT INTO public."Organization"
            ("id", "name", "slug", "ownerId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [
            organizationId,
            "Token Bucket Integration Test",
            slug,
            ownerId,
          ],
        );

        await fixtureClient.query("COMMIT");
      } catch (error) {
        await fixtureClient.query("ROLLBACK");
        throw error;
      } finally {
        fixtureClient.release();
      }

      try {
        const consume = async () => {
          const client = await appPool.connect();

          try {
            await client.query("BEGIN");

            await client.query(
              "SELECT set_config('app.tenant_id', $1, true)",
              [organizationId],
            );

            const result = await client.query(
              `SELECT *
               FROM public.consume_ingestion_tokens($1, $2, 5, 0.001, 4)`,
              [organizationId, keyHash],
            );

            await client.query("COMMIT");

            return result;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        };

        const results = await Promise.all([
          consume(),
          consume(),
        ]);

        const rows = results.map((result) => result.rows[0]);

        expect(
          rows.filter((row) => row?.allowed === true),
        ).toHaveLength(1);

        expect(
          rows.filter((row) => row?.allowed === false),
        ).toHaveLength(1);

        const rejected = rows.find(
          (row) => row?.allowed === false,
        );

        expect(
          Number(rejected?.retry_after_seconds),
        ).toBeGreaterThanOrEqual(1);
      } finally {
        // Remove temporary Organization and its dependent records.
        // Organization deletion cascades to its token buckets.
        const cleanupClient = await migrationPool.connect();

        try {
          await cleanupClient.query("BEGIN");

          await cleanupClient.query(
            `DELETE FROM public."Organization"
             WHERE "id" = $1`,
            [organizationId],
          );

          await cleanupClient.query(
            `DELETE FROM public."User"
             WHERE "id" = $1`,
            [ownerId],
          );

          await cleanupClient.query("COMMIT");
        } catch (error) {
          await cleanupClient.query("ROLLBACK");
          throw error;
        } finally {
          cleanupClient.release();
        }
      }
    },
    30_000,
  );
});

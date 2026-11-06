
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Pool } from "pg";
import type { NextRequest } from "next/server";

// --------------------------------------------------
// MOCKS
// --------------------------------------------------

const mocks = vi.hoisted(() => ({
  organizationId: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(
    (handler: (request: unknown, context?: unknown) => unknown) =>
      handler,
  ),
}));

vi.mock("@/lib/organization", () => ({
  getCurrentOrganization: vi.fn(async () => {
    if (!mocks.organizationId) return null;

    return {
      id: mocks.organizationId,
      name: "Integration Test Organization",
      slug: "integration-test-organization",
      role: "owner",
    };
  }),
}));

// --------------------------------------------------
// IMPORTS AFTER MOCKS
// --------------------------------------------------

import {
  GET,
  POST,
} from "@/app/api/keys/route";

import {
  DELETE,
} from "@/app/api/keys/[id]/route";

import {
  POST as REVOKE,
} from "@/app/api/keys/[id]/revoke/route";

import { prisma } from "@/lib/prisma";
import { verifyApiKey } from "@/lib/api-keys";

// --------------------------------------------------
// DATABASE CONNECTION
// --------------------------------------------------

const migrationUrl = process.env.DATABASE_URL_MIGRATION;

if (!migrationUrl) {
  throw new Error("DATABASE_URL_MIGRATION is not set");
}

const pool = new Pool({
  connectionString: migrationUrl,
  max: 1,
});

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Fixture = {
  ownerId: string;
  adminId: string;
  memberId: string;
  viewerId: string;
  outsiderId: string;
  otherOwnerId: string;

  organizationId: string;
  otherOrganizationId: string;
};

let fixture: Fixture;

// --------------------------------------------------
// CREATE TEST FIXTURES
// --------------------------------------------------

async function createFixture(): Promise<Fixture> {
  const data: Fixture = {
    ownerId: randomUUID(),
    adminId: randomUUID(),
    memberId: randomUUID(),
    viewerId: randomUUID(),
    outsiderId: randomUUID(),
    otherOwnerId: randomUUID(),

    organizationId: randomUUID(),
    otherOrganizationId: randomUUID(),
  };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const users = [
      [
        data.ownerId,
        "Owner",
        `owner-${data.ownerId}@test.local`,
      ],
      [
        data.adminId,
        "Admin",
        `admin-${data.adminId}@test.local`,
      ],
      [
        data.memberId,
        "Member",
        `member-${data.memberId}@test.local`,
      ],
      [
        data.viewerId,
        "Viewer",
        `viewer-${data.viewerId}@test.local`,
      ],
      [
        data.outsiderId,
        "Outsider",
        `outsider-${data.outsiderId}@test.local`,
      ],
      [
        data.otherOwnerId,
        "Other Owner",
        `other-${data.otherOwnerId}@test.local`,
      ],
    ];

    for (const [id, name, email] of users) {
      await client.query(
        `INSERT INTO "User"
          ("id", "name", "email", "password")
         VALUES ($1, $2, $3, $4)`,
        [
          id,
          name,
          email,
          "integration-test-password",
        ],
      );
    }

    await client.query(
      `INSERT INTO "Organization"
        ("id", "name", "slug", "ownerId", "updatedAt")
       VALUES
        ($1, $2, $3, $4, NOW()),
        ($5, $6, $7, $8, NOW())`,
      [
        data.organizationId,
        "Integration Test Organization",
        `integration-${data.organizationId}`,
        data.ownerId,

        data.otherOrganizationId,
        "Other Organization",
        `other-${data.otherOrganizationId}`,
        data.otherOwnerId,
      ],
    );

    await client.query(
      `INSERT INTO "OrganizationMember"
        ("id", "userId", "organizationId", "role")
       VALUES
        ($1, $2, $3, 'owner'),
        ($4, $5, $3, 'admin'),
        ($6, $7, $3, 'member'),
        ($8, $9, $3, 'viewer'),
        ($10, $11, $12, 'owner')`,
      [
        randomUUID(),
        data.ownerId,
        data.organizationId,

        randomUUID(),
        data.adminId,

        randomUUID(),
        data.memberId,

        randomUUID(),
        data.viewerId,

        randomUUID(),
        data.otherOwnerId,
        data.otherOrganizationId,
      ],
    );

    await client.query("COMMIT");

    return data;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// --------------------------------------------------
// CLEANUP TEST FIXTURES
// --------------------------------------------------

async function cleanupFixture() {
  if (!fixture) return;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM "Organization"
       WHERE "id" = ANY($1::text[])`,
      [[
        fixture.organizationId,
        fixture.otherOrganizationId,
      ]],
    );

    await client.query(
      `DELETE FROM "User"
       WHERE "id" = ANY($1::text[])`,
      [[
        fixture.ownerId,
        fixture.adminId,
        fixture.memberId,
        fixture.viewerId,
        fixture.outsiderId,
        fixture.otherOwnerId,
      ]],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// --------------------------------------------------
// REQUEST HELPERS
// --------------------------------------------------

function createRequest(
  method: string,
  actorUserId: string | null,
  body?: unknown,
): Request {
  const request = new Request(
    "http://localhost/api/keys",
    {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    },
  );

  Object.defineProperty(request, "auth", {
    value: actorUserId
      ? {
          user: {
            id: actorUserId,
            email: "integration-test@test.local",
          },
        }
      : null,
  });

  return request;
}

async function callCollectionApi(
  method: "GET" | "POST",
  actorUserId: string | null,
  body?: unknown,
  organizationId: string | null = fixture.organizationId,
): Promise<Response> {
  mocks.organizationId = organizationId;

  const request = createRequest(
    method,
    actorUserId,
    body,
  );

  if (method === "GET") {
    const handler = GET as unknown as (
      request: NextRequest,
    ) => Promise<Response>;

    return handler(request as NextRequest);
  }

  const handler = POST as unknown as (
    request: NextRequest,
  ) => Promise<Response>;

  return handler(request as NextRequest);
}

async function callItemApi(
  actorUserId: string | null,
  keyId: string,
  organizationId: string | null = fixture.organizationId,
): Promise<Response> {
  mocks.organizationId = organizationId;

  const request = createRequest(
    "DELETE",
    actorUserId,
  );

  const handler = DELETE as unknown as (
    request: NextRequest,
    context: {
      params: Promise<{ id: string }>;
    },
  ) => Promise<Response>;

  return handler(request as NextRequest, {
    params: Promise.resolve({
      id: keyId,
    }),
  });
}

async function callRevokeApi(
  actorUserId: string | null,
  keyId: string,
  organizationId: string | null = fixture.organizationId,
): Promise<Response> {
  mocks.organizationId = organizationId;

  const request = createRequest(
    "POST",
    actorUserId,
  );

  const handler = REVOKE as unknown as (
    request: NextRequest,
    context: {
      params: Promise<{ id: string }>;
    },
  ) => Promise<Response>;

  return handler(request as NextRequest, {
    params: Promise.resolve({
      id: keyId,
    }),
  });
}

// --------------------------------------------------
// DATABASE VERIFICATION HELPERS
// --------------------------------------------------

async function createKey(
  actorUserId: string,
  name = "Integration Test API Key",
  organizationId: string | null = fixture.organizationId,
) {
  const response = await callCollectionApi(
    "POST",
    actorUserId,
    { name },
    organizationId,
  );

  expect(response.status).toBe(201);

  const body = await response.json();

  return body.key as {
    id: string;
    name: string;
    keyPrefix: string;
    secretKey: string;
    createdAt: string;
    expiresAt: string | null;
  };
}

async function getStoredKey(keyId: string) {
  const result = await pool.query(
    `SELECT
       "id",
       "organizationId",
       "name",
       "keyPrefix",
       "keyHash",
       "expiresAt",
       "revokedAt",
       "createdById"
     FROM "api_keys"
     WHERE "id" = $1`,
    [keyId],
  );

  return result.rows[0] ?? null;
}

// --------------------------------------------------
// TEST SUITE
// --------------------------------------------------

describe("API Keys integration tests", () => {
  beforeAll(async () => {
    // Verify application Prisma connection uses atlas_app.
    const result = await prisma.$queryRaw<
      Array<{ current_user: string }>
    >`
      SELECT current_user
    `;

    expect(result[0]?.current_user).toBe("atlas_app");
  });

  beforeEach(async () => {
    fixture = await createFixture();

    mocks.organizationId = fixture.organizationId;
  });

  afterEach(async () => {
    await cleanupFixture();

    mocks.organizationId = null;
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  // --------------------------------------------------
  // CREATE API KEY
  // --------------------------------------------------

  it("allows the owner to create an API key", async () => {
    const key = await createKey(fixture.ownerId);

    expect(key.id).toBeTruthy();
    expect(key.name).toBe("Integration Test API Key");
    expect(key.secretKey.startsWith("atlas_live_")).toBe(true);

    const stored = await getStoredKey(key.id);

    expect(stored).not.toBeNull();
    expect(stored.organizationId).toBe(fixture.organizationId);
    expect(stored.createdById).toBe(fixture.ownerId);
    expect(verifyApiKey(key.secretKey, stored.keyHash)).toBe(true);
    expect(stored.keyHash).not.toBe(key.secretKey);
  });

  it("does not expose the stored key hash in the create response", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.ownerId,
      { name: "Safe Response Key" },
    );

    expect(response.status).toBe(201);

    const body = await response.json();

    expect(body.key.secretKey).toBeTruthy();
    expect(body.key.keyHash).toBeUndefined();
  });

  it("allows an admin to create an API key", async () => {
    const key = await createKey(fixture.adminId);

    const stored = await getStoredKey(key.id);

    expect(stored).not.toBeNull();
    expect(stored.createdById).toBe(fixture.adminId);
  });

  it("rejects API key creation by a member", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.memberId,
      { name: "Member Key" },
    );

    expect(response.status).toBe(403);
  });

  it("rejects API key creation by a viewer", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.viewerId,
      { name: "Viewer Key" },
    );

    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated API key creation", async () => {
    const response = await callCollectionApi(
      "POST",
      null,
      { name: "Unauthenticated Key" },
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when there is no active organization", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.ownerId,
      { name: "No Organization Key" },
      null,
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid API key input", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.ownerId,
      { name: "   " },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a project ID that does not belong to the organization", async () => {
    const response = await callCollectionApi(
      "POST",
      fixture.ownerId,
      {
        name: "Invalid Project Key",
        projectId: randomUUID(),
      },
    );

    expect(response.status).toBe(404);
  });

  it("stores the requested expiry date", async () => {
    const before = Date.now();

    const response = await callCollectionApi(
      "POST",
      fixture.ownerId,
      {
        name: "Expiring Key",
        expiresInDays: 1,
      },
    );

    expect(response.status).toBe(201);

    const body = await response.json();

    const expiresAt = new Date(
      body.key.expiresAt,
    ).getTime();

    expect(expiresAt).toBeGreaterThan(before);

    expect(expiresAt).toBeLessThanOrEqual(
      before + 24 * 60 * 60 * 1000 + 5000,
    );
  });

  // --------------------------------------------------
  // LIST API KEYS
  // --------------------------------------------------

  it("allows the owner to list API keys without exposing secrets", async () => {
    const created = await createKey(fixture.ownerId);

    const response = await callCollectionApi(
      "GET",
      fixture.ownerId,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(Array.isArray(body.keys)).toBe(true);

    const key = body.keys.find(
      (item: { id: string }) =>
        item.id === created.id,
    );

    expect(key).toBeDefined();
    expect(key.name).toBe(created.name);
    expect(key.keyPrefix).toBe(created.keyPrefix);

    expect(key.keyHash).toBeUndefined();
    expect(key.secretKey).toBeUndefined();
  });

  it("allows an admin to list API keys", async () => {
    await createKey(fixture.ownerId);

    const response = await callCollectionApi(
      "GET",
      fixture.adminId,
    );

    expect(response.status).toBe(200);
  });

  it("rejects a member from listing API keys", async () => {
    const response = await callCollectionApi(
      "GET",
      fixture.memberId,
    );

    expect(response.status).toBe(403);
  });

  it("rejects a viewer from listing API keys", async () => {
    const response = await callCollectionApi(
      "GET",
      fixture.viewerId,
    );

    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated API key listing", async () => {
    const response = await callCollectionApi(
      "GET",
      null,
    );

    expect(response.status).toBe(401);
  });

  // --------------------------------------------------
  // REVOKE API KEY
  // --------------------------------------------------

  it("allows the owner to revoke an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callRevokeApi(
      fixture.ownerId,
      key.id,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.key.id).toBe(key.id);
    expect(body.key.status).toBe("revoked");
    expect(body.key.revokedAt).toBeTruthy();

    const stored = await getStoredKey(key.id);

    expect(stored.revokedAt).not.toBeNull();
  });

  it("returns an idempotent response when revoking an already revoked key", async () => {
    const key = await createKey(fixture.ownerId);

    const firstResponse = await callRevokeApi(
      fixture.ownerId,
      key.id,
    );

    expect(firstResponse.status).toBe(200);

    const firstBody = await firstResponse.json();

    const secondResponse = await callRevokeApi(
      fixture.ownerId,
      key.id,
    );

    expect(secondResponse.status).toBe(200);

    const secondBody = await secondResponse.json();

    expect(secondBody.message).toBe(
      "API key is already revoked",
    );

    expect(secondBody.key.revokedAt).toBe(
      firstBody.key.revokedAt,
    );
  });

  it("allows an admin to revoke an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callRevokeApi(
      fixture.adminId,
      key.id,
    );

    expect(response.status).toBe(200);
  });

  it("rejects a member from revoking an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callRevokeApi(
      fixture.memberId,
      key.id,
    );

    expect(response.status).toBe(403);

    const stored = await getStoredKey(key.id);

    expect(stored.revokedAt).toBeNull();
  });

  it("rejects a viewer from revoking an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callRevokeApi(
      fixture.viewerId,
      key.id,
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when revoking a nonexistent key", async () => {
    const response = await callRevokeApi(
      fixture.ownerId,
      randomUUID(),
    );

    expect(response.status).toBe(404);
  });

  it("rejects unauthenticated revoke requests", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callRevokeApi(
      null,
      key.id,
    );

    expect(response.status).toBe(401);
  });

  // --------------------------------------------------
  // DELETE API KEY
  // --------------------------------------------------

  it("allows the owner to permanently delete an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callItemApi(
      fixture.ownerId,
      key.id,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.key.id).toBe(key.id);
    expect(body.key.status).toBe("deleted");

    const stored = await getStoredKey(key.id);

    expect(stored).toBeNull();
  });

  it("allows an admin to permanently delete an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callItemApi(
      fixture.adminId,
      key.id,
    );

    expect(response.status).toBe(200);

    expect(await getStoredKey(key.id)).toBeNull();
  });

  it("rejects a member from deleting an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callItemApi(
      fixture.memberId,
      key.id,
    );

    expect(response.status).toBe(403);

    expect(await getStoredKey(key.id)).not.toBeNull();
  });

  it("rejects a viewer from deleting an API key", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callItemApi(
      fixture.viewerId,
      key.id,
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when deleting a nonexistent API key", async () => {
    const response = await callItemApi(
      fixture.ownerId,
      randomUUID(),
    );

    expect(response.status).toBe(404);
  });

  it("rejects unauthenticated delete requests", async () => {
    const key = await createKey(fixture.ownerId);

    const response = await callItemApi(
      null,
      key.id,
    );

    expect(response.status).toBe(401);
  });

  // --------------------------------------------------
  // CROSS-TENANT ISOLATION
  // --------------------------------------------------

  it("does not allow one organization to list another organization's keys", async () => {
    const otherKey = await createKey(
      fixture.otherOwnerId,
      "Other Organization Key",
      fixture.otherOrganizationId,
    );

    const response = await callCollectionApi(
      "GET",
      fixture.ownerId,
      undefined,
      fixture.organizationId,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(
      body.keys.some(
        (item: { id: string }) =>
          item.id === otherKey.id,
      ),
    ).toBe(false);
  });

  it("does not allow one organization to revoke another organization's key", async () => {
    const otherKey = await createKey(
      fixture.otherOwnerId,
      "Other Organization Revoke Key",
      fixture.otherOrganizationId,
    );

    const response = await callRevokeApi(
      fixture.ownerId,
      otherKey.id,
      fixture.organizationId,
    );

    expect(response.status).toBe(404);

    const stored = await getStoredKey(otherKey.id);

    expect(stored.revokedAt).toBeNull();
  });

  it("does not allow one organization to delete another organization's key", async () => {
    const otherKey = await createKey(
      fixture.otherOwnerId,
      "Other Organization Delete Key",
      fixture.otherOrganizationId,
    );

    const response = await callItemApi(
      fixture.ownerId,
      otherKey.id,
      fixture.organizationId,
    );

    expect(response.status).toBe(404);

    const stored = await getStoredKey(otherKey.id);

    expect(stored).not.toBeNull();
  });
});

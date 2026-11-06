
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
  userId: null as string | null,
  organizationId: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(
    (handler: (request: unknown, context: unknown) => unknown) => handler,
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

import { PATCH } from "@/app/api/organization/members/[id]/role/route";
import { prisma } from "@/lib/prisma";

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
  outsiderId: string;
  otherOwnerId: string;

  organizationId: string;
  otherOrganizationId: string;

  adminMembershipId: string;
  memberMembershipId: string;
  outsiderMembershipId: string;
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
    outsiderId: randomUUID(),
    otherOwnerId: randomUUID(),

    organizationId: randomUUID(),
    otherOrganizationId: randomUUID(),

    adminMembershipId: randomUUID(),
    memberMembershipId: randomUUID(),
    outsiderMembershipId: randomUUID(),
  };

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create users
    const users = [
      [data.ownerId, "Owner", `owner-${data.ownerId}@test.local`],
      [data.adminId, "Admin", `admin-${data.adminId}@test.local`],
      [data.memberId, "Member", `member-${data.memberId}@test.local`],
      [data.outsiderId, "Outsider", `outsider-${data.outsiderId}@test.local`],
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
        [id, name, email, "integration-test-password"],
      );
    }

    // Create organizations.
    // updatedAt is required because raw SQL does not apply Prisma defaults.
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

    // Create memberships.
    await client.query(
      `INSERT INTO "OrganizationMember"
        ("id", "userId", "organizationId", "role")
       VALUES
        ($1, $2, $3, 'owner'),
        ($4, $5, $3, 'admin'),
        ($6, $7, $3, 'member'),
        ($8, $9, $10, 'member'),
        ($11, $12, $10, 'owner')`,
      [
        randomUUID(),
        data.ownerId,
        data.organizationId,

        data.adminMembershipId,
        data.adminId,

        data.memberMembershipId,
        data.memberId,

        data.outsiderMembershipId,
        data.outsiderId,
        data.otherOrganizationId,

        randomUUID(),
        data.otherOwnerId,
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

    // Organization deletion cascades its memberships.
    await client.query(
      `DELETE FROM "Organization"
       WHERE "id" = ANY($1::text[])`,
      [[fixture.organizationId, fixture.otherOrganizationId]],
    );

    await client.query(
      `DELETE FROM "User"
       WHERE "id" = ANY($1::text[])`,
      [[
        fixture.ownerId,
        fixture.adminId,
        fixture.memberId,
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
// API REQUEST HELPER
// --------------------------------------------------

async function callRoleApi(
  actorUserId: string | null,
  targetMembershipId: string,
  body: unknown,
): Promise<Response> {
  mocks.userId = actorUserId;
  mocks.organizationId = fixture.organizationId;

  const request = new Request(
    `http://localhost/api/organization/members/${targetMembershipId}/role`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

  const patchHandler = PATCH as unknown as (
    request: NextRequest,
    context: {
      params: Promise<{ id: string }>;
    },
  ) => Promise<Response>;

  return patchHandler(request as NextRequest, {
    params: Promise.resolve({
      id: targetMembershipId,
    }),
  });
}

// --------------------------------------------------
// DATABASE VERIFICATION HELPERS
// --------------------------------------------------

async function getMembershipRole(userId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT "role"
     FROM "OrganizationMember"
     WHERE "userId" = $1
       AND "organizationId" = $2`,
    [userId, fixture.organizationId],
  );

  return result.rows[0]?.role ?? null;
}

async function getOrganizationOwner(): Promise<string> {
  const result = await pool.query(
    `SELECT "ownerId"
     FROM "Organization"
     WHERE "id" = $1`,
    [fixture.organizationId],
  );

  return result.rows[0].ownerId;
}

// --------------------------------------------------
// TEST SUITE
// --------------------------------------------------

describe("PATCH /api/organization/members/[id]/role", () => {
  beforeAll(async () => {
    // Confirm application Prisma connection uses atlas_app.
    const result = await prisma.$queryRaw<
      Array<{ current_user: string }>
    >`
      SELECT current_user
    `;

    expect(result[0]?.current_user).toBe("atlas_app");
  });

  beforeEach(async () => {
    fixture = await createFixture();

    mocks.userId = null;
    mocks.organizationId = fixture.organizationId;
  });

  afterEach(async () => {
    await cleanupFixture();

    mocks.userId = null;
    mocks.organizationId = null;
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  // 1. Owner promotes member to admin
  it("allows the owner to promote a member to admin", async () => {
    const response = await callRoleApi(
      fixture.ownerId,
      fixture.memberMembershipId,
      { role: "admin" },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.member.role).toBe("admin");
    expect(body.member.ownershipTransferred).toBe(false);

    expect(await getMembershipRole(fixture.memberId)).toBe("admin");
  });

  // 2. Ownership transfer
  it("transfers ownership atomically to another organization member", async () => {
    const response = await callRoleApi(
      fixture.ownerId,
      fixture.adminMembershipId,
      { role: "owner" },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.member.ownershipTransferred).toBe(true);
    expect(body.member.role).toBe("owner");

    expect(await getOrganizationOwner()).toBe(fixture.adminId);

    expect(await getMembershipRole(fixture.ownerId)).toBe("admin");
    expect(await getMembershipRole(fixture.adminId)).toBe("owner");

    const owners = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM "OrganizationMember"
       WHERE "organizationId" = $1
         AND "role" = 'owner'`,
      [fixture.organizationId],
    );

    expect(owners.rows[0].count).toBe(1);
  });

  // 3. Admin cannot transfer ownership
  it("does not allow an admin to assign the owner role", async () => {
    const response = await callRoleApi(
      fixture.adminId,
      fixture.memberMembershipId,
      { role: "owner" },
    );

    expect(response.status).toBe(403);

    expect(await getMembershipRole(fixture.memberId)).toBe("member");
    expect(await getOrganizationOwner()).toBe(fixture.ownerId);
  });

  // 4. Member cannot update roles
  it("does not allow a member to update another member's role", async () => {
    const response = await callRoleApi(
      fixture.memberId,
      fixture.adminMembershipId,
      { role: "viewer" },
    );

    expect(response.status).toBe(403);

    expect(await getMembershipRole(fixture.adminId)).toBe("admin");
  });

  // 5. Cross-organization member ID
  it("returns 404 when the target membership belongs to another organization", async () => {
    const response = await callRoleApi(
      fixture.ownerId,
      fixture.outsiderMembershipId,
      { role: "viewer" },
    );

    expect(response.status).toBe(404);

    expect(await getMembershipRole(fixture.memberId)).toBe("member");
  });

  // 6. Invalid role
  it("returns 400 for an invalid role", async () => {
    const response = await callRoleApi(
      fixture.ownerId,
      fixture.memberMembershipId,
      { role: "super_admin" },
    );

    expect(response.status).toBe(400);

    expect(await getMembershipRole(fixture.memberId)).toBe("member");
  });

  // 7. Unauthenticated request
  it("returns 401 for an unauthenticated request", async () => {
    const response = await callRoleApi(
      null,
      fixture.memberMembershipId,
      { role: "admin" },
    );

    expect(response.status).toBe(401);
  });

  // 8. Non-member actor
  it("rejects an actor who is not a member of the active organization", async () => {
    const response = await callRoleApi(
      fixture.outsiderId,
      fixture.memberMembershipId,
      { role: "viewer" },
    );

    expect(response.status).toBe(403);

    expect(await getMembershipRole(fixture.memberId)).toBe("member");
  });
});

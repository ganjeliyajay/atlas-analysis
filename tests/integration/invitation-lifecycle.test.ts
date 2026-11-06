
import { randomUUID, createHash } from "node:crypto";
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
  sendInvitationEmail: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(
    (handler: (request: unknown, context: unknown) => unknown) =>
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

vi.mock("@/lib/email", () => ({
  emailService: {
    sendInvitationEmail: mocks.sendInvitationEmail,
  },
}));

// --------------------------------------------------
// IMPORTS AFTER MOCKS
// --------------------------------------------------

import { POST as resendInvitation } from "@/app/api/organization/invitations/[id]/resend/route";
import { POST as revokeInvitation } from "@/app/api/organization/invitations/[id]/revoke/route";
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
  viewerId: string;
  outsiderId: string;
  otherOwnerId: string;
  organizationId: string;
  otherOrganizationId: string;
};

type InvitationFixture = {
  id: string;
  tokenHash: string;
  organizationId: string;
};

type RouteContext = {
  params: Promise<{ id: string }>;
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
      [data.ownerId, "Owner", `owner-${data.ownerId}@test.local`],
      [data.adminId, "Admin", `admin-${data.adminId}@test.local`],
      [data.memberId, "Member", `member-${data.memberId}@test.local`],
      [data.viewerId, "Viewer", `viewer-${data.viewerId}@test.local`],
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
        [id, name, email, "integration-test-password"],
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
        ($10, $11, $12, 'member'),
        ($13, $14, $12, 'owner')`,
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
// CREATE INVITATION FIXTURE
// --------------------------------------------------

async function createInvitation(
  organizationId: string = fixture.organizationId,
  invitedById: string = fixture.ownerId,
  status: string = "pending",
): Promise<InvitationFixture> {
  const id = randomUUID();
  const tokenHash = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  );

  await pool.query(
    `INSERT INTO "invitations"
      (
        "id",
        "organizationId",
        "email",
        "role",
        "tokenHash",
        "expiresAt",
        "status",
        "invitedById",
        "createdAt",
        "updatedAt"
      )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      id,
      organizationId,
      `invite-${id}@test.local`,
      "viewer",
      tokenHash,
      expiresAt,
      status,
      invitedById,
    ],
  );

  return {
    id,
    tokenHash,
    organizationId,
  };
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
      [[fixture.organizationId, fixture.otherOrganizationId]],
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
// API REQUEST HELPER
// --------------------------------------------------

async function callInvitationApi(
  action: "resend" | "revoke",
  actorUserId: string | null,
  invitationId: string,
): Promise<Response> {
  mocks.organizationId = fixture.organizationId;

  const request = new Request(
    `http://localhost/api/organization/invitations/${invitationId}/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  Object.defineProperty(request, "auth", {
    value: actorUserId
      ? {
          user: {
            id: actorUserId,
            name: "Integration Test User",
            email: "integration-test@test.local",
          },
        }
      : null,
  });

  const handler = (
    action === "resend" ? resendInvitation : revokeInvitation
  ) as unknown as (
    request: NextRequest,
    context: RouteContext,
  ) => Promise<Response>;

  return handler(request as NextRequest, {
    params: Promise.resolve({
      id: invitationId,
    }),
  });
}

// --------------------------------------------------
// DATABASE VERIFICATION HELPERS
// --------------------------------------------------

async function getInvitation(id: string) {
  const result = await pool.query(
    `SELECT
       "id",
       "organizationId",
       "email",
       "role",
       "tokenHash",
       "expiresAt",
       "status"
     FROM "invitations"
     WHERE "id" = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

// --------------------------------------------------
// TEST SUITE
// --------------------------------------------------

describe("Invitation lifecycle API", () => {
  beforeAll(async () => {
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

    mocks.sendInvitationEmail.mockReset();
    mocks.sendInvitationEmail.mockResolvedValue({
      success: true,
      messageId: "integration-test-message",
    });
  });

  afterEach(async () => {
    await cleanupFixture();
    mocks.organizationId = null;
  });

  afterAll(async () => {
    await pool.end();
    await prisma.$disconnect();
  });

  // RESEND TESTS

  it("allows the owner to resend a pending invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "resend",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.message).toBe("Invitation resent successfully");
    expect(body.invitation.id).toBe(invitation.id);
    expect(body.invitation.status).toBe("pending");

    const updated = await getInvitation(invitation.id);

    expect(updated.status).toBe("pending");
    expect(updated.tokenHash).not.toBe(invitation.tokenHash);

    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    expect(mocks.sendInvitationEmail).toHaveBeenCalledTimes(1);

    const emailCall = mocks.sendInvitationEmail.mock.calls[0];

    expect(emailCall).toBeDefined();

    const emailParams = emailCall![0];

    expect(emailParams.to).toBe(updated.email);
    expect(emailParams.role).toBe("viewer");

    const sentTokenHash = createHash("sha256")
      .update(emailParams.inviteToken)
      .digest("hex");

    expect(sentTokenHash).toBe(updated.tokenHash);
  });

  it("allows an admin to resend a pending invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "resend",
      fixture.adminId,
      invitation.id,
    );

    expect(response.status).toBe(200);
    expect(mocks.sendInvitationEmail).toHaveBeenCalledTimes(1);
  });

  it("does not allow a member to resend an invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "resend",
      fixture.memberId,
      invitation.id,
    );

    expect(response.status).toBe(403);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.tokenHash).toBe(invitation.tokenHash);
  });

  it("does not allow a viewer to resend an invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "resend",
      fixture.viewerId,
      invitation.id,
    );

    expect(response.status).toBe(403);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("rejects resending an accepted invitation", async () => {
    const invitation = await createInvitation(
      fixture.organizationId,
      fixture.ownerId,
      "accepted",
    );

    const response = await callInvitationApi(
      "resend",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(409);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("accepted");
    expect(unchanged.tokenHash).toBe(invitation.tokenHash);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for an invitation from another organization", async () => {
    const invitation = await createInvitation(
      fixture.otherOrganizationId,
      fixture.otherOwnerId,
    );

    const response = await callInvitationApi(
      "resend",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(404);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.tokenHash).toBe(invitation.tokenHash);
  });

  it("returns 404 for a nonexistent invitation during resend", async () => {
    const response = await callInvitationApi(
      "resend",
      fixture.ownerId,
      randomUUID(),
    );

    expect(response.status).toBe(404);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated resend request", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "resend",
      null,
      invitation.id,
    );

    expect(response.status).toBe(401);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  // REVOKE TESTS

  it("allows the owner to revoke a pending invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "revoke",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.message).toBe("Invitation revoked successfully");
    expect(body.invitation.id).toBe(invitation.id);
    expect(body.invitation.status).toBe("revoked");

    const updated = await getInvitation(invitation.id);

    expect(updated.status).toBe("revoked");
  });

  it("allows an admin to revoke a pending invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "revoke",
      fixture.adminId,
      invitation.id,
    );

    expect(response.status).toBe(200);

    const updated = await getInvitation(invitation.id);

    expect(updated.status).toBe("revoked");
  });

  it("does not allow a member to revoke an invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "revoke",
      fixture.memberId,
      invitation.id,
    );

    expect(response.status).toBe(403);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("pending");
  });

  it("does not allow a viewer to revoke an invitation", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "revoke",
      fixture.viewerId,
      invitation.id,
    );

    expect(response.status).toBe(403);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("pending");
  });

  it("returns success when an invitation is already revoked", async () => {
    const invitation = await createInvitation(
      fixture.organizationId,
      fixture.ownerId,
      "revoked",
    );

    const response = await callInvitationApi(
      "revoke",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.message).toBe("Invitation is already revoked");
    expect(body.invitation.status).toBe("revoked");
  });

  it("rejects revoking an accepted invitation", async () => {
    const invitation = await createInvitation(
      fixture.organizationId,
      fixture.ownerId,
      "accepted",
    );

    const response = await callInvitationApi(
      "revoke",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(409);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("accepted");
  });

  it("returns 404 for an invitation from another organization during revoke", async () => {
    const invitation = await createInvitation(
      fixture.otherOrganizationId,
      fixture.otherOwnerId,
    );

    const response = await callInvitationApi(
      "revoke",
      fixture.ownerId,
      invitation.id,
    );

    expect(response.status).toBe(404);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("pending");
  });

  it("returns 404 for a nonexistent invitation during revoke", async () => {
    const response = await callInvitationApi(
      "revoke",
      fixture.ownerId,
      randomUUID(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 for an unauthenticated revoke request", async () => {
    const invitation = await createInvitation();

    const response = await callInvitationApi(
      "revoke",
      null,
      invitation.id,
    );

    expect(response.status).toBe(401);

    const unchanged = await getInvitation(invitation.id);

    expect(unchanged.status).toBe("pending");
  });
});

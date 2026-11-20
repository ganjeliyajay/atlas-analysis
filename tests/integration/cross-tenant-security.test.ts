import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { testFixturePrisma } from "@/tests/test-client";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

// Mock auth session
const sessionMock = vi.hoisted(() => ({
  userId: "" as string,
  email: "" as string,
  role: "user" as string,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn((handler: unknown) => {
    if (typeof handler === "function") {
      return async (req: { auth?: unknown }, ctx: unknown) => {
        req.auth = sessionMock.userId
          ? {
              user: {
                id: sessionMock.userId,
                email: sessionMock.email,
                role: sessionMock.role,
              },
            }
          : null;
        return (handler as (r: unknown, c: unknown) => unknown)(req, ctx);
      };
    }
    return Promise.resolve(
      sessionMock.userId
        ? {
            user: {
              id: sessionMock.userId,
              email: sessionMock.email,
              role: sessionMock.role,
            },
          }
        : null
    );
  }),
}));

import { GET as exportGET } from "@/app/api/projects/[projectId]/analytics/export/route";
import { GET as opsGET } from "@/app/api/ops/route";

describe("Stage 5 & 14: Cross-Tenant Security & Broken Object Level Authorization (BOLA/IDOR)", () => {
  let tenantAOrgId: string;
  let tenantAUserId: string;
  let tenantAProjectId: string;

  let tenantBOrgId: string;
  let tenantBUserId: string;
  let tenantBProjectId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Tenant A
    const userA = await testFixturePrisma.user.create({
      data: {
        email: `tenant-a-${Date.now()}@test.com`,
        name: "User A",
        password: passwordHash,
      },
    });
    tenantAUserId = userA.id;

    const orgA = await testFixturePrisma.organization.create({
      data: {
        name: "Tenant A Org",
        slug: `tenant-a-${Date.now()}`,
        ownerId: userA.id,
      },
    });
    tenantAOrgId = orgA.id;

    await testFixturePrisma.organizationMember.create({
      data: {
        organizationId: tenantAOrgId,
        userId: tenantAUserId,
        role: "owner",
      },
    });

    const projectA = await testFixturePrisma.project.create({
      data: {
        name: "Project A",
        slug: `proj-a-${Date.now()}`,
        organizationId: tenantAOrgId,
      },
    });
    tenantAProjectId = projectA.id;

    // Tenant B
    const userB = await testFixturePrisma.user.create({
      data: {
        email: `tenant-b-${Date.now()}@test.com`,
        name: "User B",
        password: passwordHash,
      },
    });
    tenantBUserId = userB.id;

    const orgB = await testFixturePrisma.organization.create({
      data: {
        name: "Tenant B Org",
        slug: `tenant-b-${Date.now()}`,
        ownerId: userB.id,
      },
    });
    tenantBOrgId = orgB.id;

    await testFixturePrisma.organizationMember.create({
      data: {
        organizationId: tenantBOrgId,
        userId: tenantBUserId,
        role: "owner",
      },
    });

    const projectB = await testFixturePrisma.project.create({
      data: {
        name: "Project B",
        slug: `proj-b-${Date.now()}`,
        organizationId: tenantBOrgId,
      },
    });
    tenantBProjectId = projectB.id;
  });

  afterAll(async () => {
    await testFixturePrisma.project.deleteMany({ where: { organizationId: { in: [tenantAOrgId, tenantBOrgId] } } }).catch(() => {});
    await testFixturePrisma.organizationMember.deleteMany({ where: { organizationId: { in: [tenantAOrgId, tenantBOrgId] } } }).catch(() => {});
    await testFixturePrisma.organization.deleteMany({ where: { id: { in: [tenantAOrgId, tenantBOrgId] } } }).catch(() => {});
    await testFixturePrisma.user.deleteMany({ where: { id: { in: [tenantAUserId, tenantBUserId] } } }).catch(() => {});
  });

  it("prevents Tenant A from exporting Tenant B's analytics data (IDOR rejection)", async () => {
    // Authenticate as User A
    sessionMock.userId = tenantAUserId;
    sessionMock.email = "tenant-a@test.com";

    // Attempt to export Tenant A's own project data (should succeed)
    const ownReq = new NextRequest(`http://localhost:3000/api/projects/${tenantAProjectId}/analytics/export`, {
      method: "GET",
    });
    const ownRes = (await exportGET(ownReq, {
      params: Promise.resolve({ projectId: tenantAProjectId }),
    })) as Response;
    expect(ownRes.status).toBe(200);

    // Attempt to export Tenant B's project data (must be rejected)
    const req = new NextRequest(`http://localhost:3000/api/projects/${tenantBProjectId}/analytics/export`, {
      method: "GET",
    });

    const res = (await exportGET(req, {
      params: Promise.resolve({ projectId: tenantBProjectId }),
    })) as Response;

    // Must be rejected with 404 (Not Found / Not Authorized)
    expect(res.status).toBe(404);
  });

  it("strictly denies non-ops tenant users from accessing global Operations Console API", async () => {
    // Authenticate as normal tenant User A
    sessionMock.userId = tenantAUserId;
    sessionMock.email = "tenant-a@test.com";

    const req = new NextRequest("http://localhost:3000/api/ops", {
      method: "GET",
    });

    const res = (await opsGET(req, {} as unknown as { params: Promise<Record<string, string>> })) as Response;

    // Normal tenant users are forbidden from reading global platform ops
    expect(res.status).toBe(403);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { testFixturePrisma } from "@/tests/test-client";

describe("PostgreSQL Function Security & Permission Boundary Integration Suite", () => {
  let tenantA: { orgId: string; ownerId: string; adminId: string; memberId: string };
  let tenantB: { orgId: string; ownerId: string; memberId: string };
  let testApiKey: { rawKey: string; keyPrefix: string; keyHash: string };

  const appClient = new Client({
    connectionString: process.env.DATABASE_URL_APP,
  });

  const opsClient = new Client({
    connectionString: process.env.DATABASE_URL_OPS,
  });

  beforeAll(async () => {
    await appClient.connect();
    await opsClient.connect();

    const ts = Date.now();

    // 1. Setup Tenant A with Owner, Admin, and Member
    const ownerA = await testFixturePrisma.user.create({
      data: { email: `fn-owner-a-${ts}@atlas.test`, name: "Owner A", password: "pw" },
    });
    const adminA = await testFixturePrisma.user.create({
      data: { email: `fn-admin-a-${ts}@atlas.test`, name: "Admin A", password: "pw" },
    });
    const memberA = await testFixturePrisma.user.create({
      data: { email: `fn-member-a-${ts}@atlas.test`, name: "Member A", password: "pw" },
    });

    const orgA = await testFixturePrisma.organization.create({
      data: { name: "Function Security Org A", slug: `fn-org-a-${ts}`, ownerId: ownerA.id, eventQuota: 100000 },
    });

    await testFixturePrisma.organizationMember.createMany({
      data: [
        { organizationId: orgA.id, userId: ownerA.id, role: "owner" },
        { organizationId: orgA.id, userId: adminA.id, role: "admin" },
        { organizationId: orgA.id, userId: memberA.id, role: "member" },
      ],
    });

    tenantA = {
      orgId: orgA.id,
      ownerId: ownerA.id,
      adminId: adminA.id,
      memberId: memberA.id,
    };

    // 2. Setup Tenant B with Owner and Member
    const ownerB = await testFixturePrisma.user.create({
      data: { email: `fn-owner-b-${ts}@atlas.test`, name: "Owner B", password: "pw" },
    });
    const memberB = await testFixturePrisma.user.create({
      data: { email: `fn-member-b-${ts}@atlas.test`, name: "Member B", password: "pw" },
    });

    const orgB = await testFixturePrisma.organization.create({
      data: { name: "Function Security Org B", slug: `fn-org-b-${ts}`, ownerId: ownerB.id, eventQuota: 50000 },
    });

    await testFixturePrisma.organizationMember.createMany({
      data: [
        { organizationId: orgB.id, userId: ownerB.id, role: "owner" },
        { organizationId: orgB.id, userId: memberB.id, role: "member" },
      ],
    });

    tenantB = {
      orgId: orgB.id,
      ownerId: ownerB.id,
      memberId: memberB.id,
    };

    // 3. Setup Project and API Key for Tenant A
    const projectA = await testFixturePrisma.project.create({
      data: { name: "Project A", slug: `fn-proj-a-${ts}`, organizationId: orgA.id },
    });

    const keyPrefix = `atk_${ts.toString().slice(-8)}`;
    const keyHash = `hash_${ts}_${Math.random().toString(36).slice(2)}`;
    await testFixturePrisma.apiKey.create({
      data: {
        name: "Security Ingestion Key",
        keyPrefix,
        keyHash,
        organizationId: orgA.id,
        projectId: projectA.id,
      },
    });

    testApiKey = {
      rawKey: `${keyPrefix}_secret_suffix_123456`,
      keyPrefix,
      keyHash,
    };
  });

  afterAll(async () => {
    await appClient.end().catch(() => {});
    await opsClient.end().catch(() => {});

    if (tenantA?.orgId) {
      await testFixturePrisma.apiKey.deleteMany({ where: { organizationId: tenantA.orgId } }).catch(() => {});
      await testFixturePrisma.project.deleteMany({ where: { organizationId: tenantA.orgId } }).catch(() => {});
      await testFixturePrisma.organizationMember.deleteMany({ where: { organizationId: tenantA.orgId } }).catch(() => {});
      await testFixturePrisma.organization.delete({ where: { id: tenantA.orgId } }).catch(() => {});
      await testFixturePrisma.user.deleteMany({ where: { id: { in: [tenantA.ownerId, tenantA.adminId, tenantA.memberId] } } }).catch(() => {});
    }

    if (tenantB?.orgId) {
      await testFixturePrisma.organizationMember.deleteMany({ where: { organizationId: tenantB.orgId } }).catch(() => {});
      await testFixturePrisma.organization.delete({ where: { id: tenantB.orgId } }).catch(() => {});
      await testFixturePrisma.user.deleteMany({ where: { id: { in: [tenantB.ownerId, tenantB.memberId] } } }).catch(() => {});
    }
  });

  // ============================================================================
  // 1. Role-Level Execution Restriction Tests (atlas_ops and PUBLIC)
  // ============================================================================

  it("strictly forbids atlas_ops from executing transfer_organization_ownership", async () => {
    let callError: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
        tenantA.orgId,
        tenantA.adminId,
      ]);
    } catch (err) {
      callError = err as Error & { code?: string };
    }

    expect(callError).not.toBeNull();
    expect(callError?.code).toBe("42501"); // insufficient_privilege
    expect(callError?.message.toLowerCase()).toContain("permission denied");
  });

  it("strictly forbids atlas_ops from executing update_organization_member_role", async () => {
    let callError: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantA.orgId,
        "mem_fake",
        "admin",
      ]);
    } catch (err) {
      callError = err as Error & { code?: string };
    }

    expect(callError).not.toBeNull();
    expect(callError?.code).toBe("42501");
    expect(callError?.message.toLowerCase()).toContain("permission denied");
  });

  // ============================================================================
  // 2. Ownership Transfer Function Authorization Tests
  // ============================================================================

  it("rejects transfer_organization_ownership when actor is not the organization owner", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.adminId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
        tenantA.orgId,
        tenantA.memberId,
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Only the current organization owner can transfer ownership/i);
  });

  it("rejects transfer_organization_ownership when tenant context does not match target org", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantB.orgId}';`); // Context mismatch!
      await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
        tenantA.orgId,
        tenantA.adminId,
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Tenant context mismatch/i);
  });

  it("rejects transfer_organization_ownership when target user is not an organization member", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
        tenantA.orgId,
        tenantB.memberId, // Member of Org B, not Org A!
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503");
    expect(error?.message).toMatch(/Target user is not an organization member/i);
  });

  it("rejects transfer_organization_ownership when caller attempts self-transfer", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
        tenantA.orgId,
        tenantA.ownerId, // Self-transfer!
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("22023");
    expect(error?.message).toMatch(/Cannot transfer ownership to yourself/i);
  });

  // ============================================================================
  // 3. Member Role Promotion Function Authorization Tests
  // ============================================================================

  it("rejects update_organization_member_role when actor is a standard member", async () => {
    const targetMembership = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.adminId },
    });
    expect(targetMembership).not.toBeNull();

    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.memberId}';`); // Standard member
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantA.orgId,
        targetMembership!.id,
        "viewer",
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Insufficient organization permissions/i);
  });

  it("rejects update_organization_member_role when attempting cross-tenant role modification", async () => {
    const memberBRecord = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantB.orgId, userId: tenantB.memberId },
    });
    expect(memberBRecord).not.toBeNull();

    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      // Admin A attempts to modify Member B in Org B
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.adminId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantB.orgId, // Org B!
        memberBRecord!.id,
        "admin",
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Tenant context mismatch/i);
  });

  it("rejects update_organization_member_role when an admin attempts to assign admin role", async () => {
    const memberARecord = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.memberId },
    });
    expect(memberARecord).not.toBeNull();

    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.adminId}';`); // Admin
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantA.orgId,
        memberARecord!.id,
        "admin", // Admin cannot promote to admin (only member or viewer)
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Admins may only assign member or viewer roles/i);
  });

  // ============================================================================
  // 4. Ingestion API Key Lookup Function Tests
  // ============================================================================

  it("returns only the targeted active key and organization metadata during unauthenticated ingestion lookup", async () => {
    const res = await appClient.query(
      "SELECT * FROM public.lookup_api_key_for_ingestion($1, $2);",
      [testApiKey.keyPrefix, null]
    );

    expect(res.rows.length).toBe(1);
    const row = res.rows[0];
    expect(row.organizationId).toBe(tenantA.orgId);
    expect(row.keyPrefix).toBe(testApiKey.keyPrefix);
    expect(row.keyHash).toBe(testApiKey.keyHash);
    expect(row.status).toBe("active");
  });

  it("returns zero rows when API key prefix is shorter than 12 characters", async () => {
    const res = await appClient.query(
      "SELECT * FROM public.lookup_api_key_for_ingestion($1, $2);",
      ["atk_short", null]
    );

    expect(res.rows.length).toBe(0);
  });

  // ============================================================================
  // 5. Valid Application Workflow Execution
  // ============================================================================

  it("allows valid owner to transfer organization ownership atomically", async () => {
    await appClient.query("BEGIN;");
    await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
    await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);

    await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
      tenantA.orgId,
      tenantA.adminId, // Promote Admin A to Owner!
    ]);
    await appClient.query("COMMIT;");

    // Verify canonical organization owner updated
    const orgRecord = await testFixturePrisma.organization.findUnique({
      where: { id: tenantA.orgId },
    });
    expect(orgRecord?.ownerId).toBe(tenantA.adminId);

    // Verify memberships swapped atomically
    const newOwnerMembership = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.adminId },
    });
    expect(newOwnerMembership?.role).toBe("owner");

    const previousOwnerMembership = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.ownerId },
    });
    expect(previousOwnerMembership?.role).toBe("admin");

    // Transfer back so state is clean
    await appClient.query("BEGIN;");
    await appClient.query(`SET LOCAL app.user_id = '${tenantA.adminId}';`);
    await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
    await appClient.query("SELECT public.transfer_organization_ownership($1, $2);", [
      tenantA.orgId,
      tenantA.ownerId,
    ]);
    await appClient.query("COMMIT;");
  });

  it("rejects update_organization_member_role when attempting to demote the canonical owner", async () => {
    const ownerMembership = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.ownerId },
    });
    expect(ownerMembership).not.toBeNull();

    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantA.orgId,
        ownerMembership!.id,
        "member", // Forbids changing canonical owner role
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/Transfer ownership before changing the canonical owner role/i);
  });

  it("rejects update_organization_member_role when actor context app.user_id is missing", async () => {
    const memberARecord = await testFixturePrisma.organizationMember.findFirst({
      where: { organizationId: tenantA.orgId, userId: tenantA.memberId },
    });

    let error: (Error & { code?: string }) | null = null;
    try {
      await appClient.query("BEGIN;");
      // app.user_id not set
      await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);
      await appClient.query("SELECT public.update_organization_member_role($1, $2, $3);", [
        tenantA.orgId,
        memberARecord!.id,
        "admin",
      ]);
      await appClient.query("COMMIT;");
    } catch (err) {
      await appClient.query("ROLLBACK;").catch(() => {});
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/User context is required/i);
  });

  it("strictly forbids atlas_ops from executing lookup_api_key_for_ingestion", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query(
        "SELECT * FROM public.lookup_api_key_for_ingestion($1, $2);",
        [testApiKey.keyPrefix, null]
      );
    } catch (err) {
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("strictly forbids atlas_ops from executing lookup_legacy_project_for_ingestion", async () => {
    let error: (Error & { code?: string }) | null = null;
    try {
      await opsClient.query(
        "SELECT * FROM public.lookup_legacy_project_for_ingestion($1);",
        ["some_hash_1234567890abcdef"]
      );
    } catch (err) {
      error = err as Error & { code?: string };
    }

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("verifies RLS helper functions execute cleanly without recursion", async () => {
    await appClient.query("BEGIN;");
    await appClient.query(`SET LOCAL app.user_id = '${tenantA.ownerId}';`);
    await appClient.query(`SET LOCAL app.tenant_id = '${tenantA.orgId}';`);

    const ownsOrgRes = await appClient.query("SELECT public.current_user_owns_org($1) AS val;", [tenantA.orgId]);
    expect(ownsOrgRes.rows[0].val).toBe(true);

    const isMemberRes = await appClient.query("SELECT public.current_user_is_org_member($1) AS val;", [tenantA.orgId]);
    expect(isMemberRes.rows[0].val).toBe(true);

    const isAdminOrOwnerRes = await appClient.query("SELECT public.current_user_is_org_admin_or_owner($1) AS val;", [tenantA.orgId]);
    expect(isAdminOrOwnerRes.rows[0].val).toBe(true);

    const isCanonRes = await appClient.query("SELECT public.is_canonical_org_owner_membership($1, $2) AS val;", [tenantA.orgId, tenantA.ownerId]);
    expect(isCanonRes.rows[0].val).toBe(true);

    await appClient.query("COMMIT;");
  });
});

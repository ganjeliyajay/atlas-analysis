
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  withUserContext: vi.fn(),
}));

vi.mock("@/lib/db-context", () => ({
  withUserContext: mocks.withUserContext,
}));

import {
  canAssignRole,
  getMemberRole,
  hasPermission,
  isOrgRole,
  isSoleOwner,
  requireOrgPermission,
} from "@/lib/permissions";

function createMockTransaction() {
  return {
    organizationMember: {
      findUnique: mocks.findUnique,
      count: mocks.count,
      findFirst: mocks.findFirst,
    },
  };
}

describe("permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.withUserContext.mockImplementation(
      async (
        _userId: string,
        callback: (tx: ReturnType<typeof createMockTransaction>) => unknown
      ) => callback(createMockTransaction())
    );
  });

  describe("isOrgRole", () => {
    it.each(["owner", "admin", "member", "viewer"])(
      "accepts valid role: %s",
      (role) => {
        expect(isOrgRole(role)).toBe(true);
      }
    );

    it.each(["super_admin", "guest", "", null, undefined, 123])(
      "rejects invalid role: %s",
      (role) => {
        expect(isOrgRole(role)).toBe(false);
      }
    );
  });

  describe("hasPermission", () => {
    describe("owner", () => {
      it("has all organization permissions", () => {
        const actions = [
          "org:update",
          "org:delete",
          "member:invite",
          "member:remove",
          "member:update_role",
          "project:create",
          "project:update",
          "project:delete",
          "api_key:create",
          "api_key:revoke",
          "analytics:read",
          "settings:read",
        ] as const;

        for (const action of actions) {
          expect(hasPermission("owner", action)).toBe(true);
        }
      });
    });

    describe("admin", () => {
      it("can update organization but cannot delete it", () => {
        expect(hasPermission("admin", "org:update")).toBe(true);
        expect(hasPermission("admin", "org:delete")).toBe(false);
      });

      it("can invite, remove and manage member roles", () => {
        expect(hasPermission("admin", "member:invite")).toBe(true);
        expect(hasPermission("admin", "member:remove")).toBe(true);
        expect(hasPermission("admin", "member:update_role")).toBe(true);
      });

      it("can create, update, and delete projects", () => {
        expect(hasPermission("admin", "project:create")).toBe(true);
        expect(hasPermission("admin", "project:update")).toBe(true);
        expect(hasPermission("admin", "project:delete")).toBe(true);
      });

      it("can manage API keys and read analytics/settings", () => {
        expect(hasPermission("admin", "api_key:create")).toBe(true);
        expect(hasPermission("admin", "api_key:revoke")).toBe(true);
        expect(hasPermission("admin", "analytics:read")).toBe(true);
        expect(hasPermission("admin", "settings:read")).toBe(true);
      });
    });

    describe("member", () => {
      it("cannot create or update projects", () => {
        expect(hasPermission("member", "project:create")).toBe(false);
        expect(hasPermission("member", "project:update")).toBe(false);
      });

      it("can read analytics", () => {
        expect(hasPermission("member", "analytics:read")).toBe(true);
      });

      it("cannot delete projects", () => {
        expect(hasPermission("member", "project:delete")).toBe(false);
      });

      it("cannot manage members or invitations", () => {
        expect(hasPermission("member", "member:invite")).toBe(false);
        expect(hasPermission("member", "member:remove")).toBe(false);
        expect(hasPermission("member", "member:update_role")).toBe(false);
      });

      it("cannot manage API keys or organization settings", () => {
        expect(hasPermission("member", "api_key:create")).toBe(false);
        expect(hasPermission("member", "api_key:revoke")).toBe(false);
        expect(hasPermission("member", "settings:read")).toBe(false);
      });
    });

    describe("viewer", () => {
      it("can read analytics only", () => {
        expect(hasPermission("viewer", "analytics:read")).toBe(true);
      });

      it("cannot create or update projects", () => {
        expect(hasPermission("viewer", "project:create")).toBe(false);
        expect(hasPermission("viewer", "project:update")).toBe(false);
      });

      it("cannot manage members, projects, or API keys", () => {
        expect(hasPermission("viewer", "member:invite")).toBe(false);
        expect(hasPermission("viewer", "member:remove")).toBe(false);
        expect(hasPermission("viewer", "project:delete")).toBe(false);
        expect(hasPermission("viewer", "api_key:create")).toBe(false);
        expect(hasPermission("viewer", "api_key:revoke")).toBe(false);
      });

      it("cannot read settings or delete organization", () => {
        expect(hasPermission("viewer", "settings:read")).toBe(false);
        expect(hasPermission("viewer", "org:delete")).toBe(false);
      });
    });

    it("rejects unknown roles", () => {
      expect(hasPermission("super_admin", "org:delete")).toBe(false);
      expect(hasPermission("guest", "analytics:read")).toBe(false);
    });

    it("normalizes role casing and whitespace", () => {
      expect(hasPermission(" OWNER ", "org:delete")).toBe(true);
      expect(hasPermission(" Admin ", "project:create")).toBe(true);
    });
  });

  describe("canAssignRole", () => {
    it("allows owner to assign all four roles", () => {
      expect(canAssignRole("owner", "owner")).toBe(true);
      expect(canAssignRole("owner", "admin")).toBe(true);
      expect(canAssignRole("owner", "member")).toBe(true);
      expect(canAssignRole("owner", "viewer")).toBe(true);
    });

    it("allows admin to assign member and viewer only", () => {
      expect(canAssignRole("admin", "member")).toBe(true);
      expect(canAssignRole("admin", "viewer")).toBe(true);
      expect(canAssignRole("admin", "owner")).toBe(false);
      expect(canAssignRole("admin", "admin")).toBe(false);
    });

    it("does not allow member or viewer to assign roles", () => {
      expect(canAssignRole("member", "viewer")).toBe(false);
      expect(canAssignRole("viewer", "member")).toBe(false);
    });

    it("rejects unknown actor or target roles", () => {
      expect(canAssignRole("super_admin", "member")).toBe(false);
      expect(canAssignRole("admin", "super_admin")).toBe(false);
    });
  });

  describe("getMemberRole", () => {
    it("returns the user's valid role using user context", async () => {
      mocks.findUnique.mockResolvedValue({ role: "admin" });

      const result = await getMemberRole("user-1", "org-1");

      expect(result).toBe("admin");
      expect(mocks.withUserContext).toHaveBeenCalledTimes(1);
      expect(mocks.withUserContext).toHaveBeenCalledWith(
        "user-1",
        expect.any(Function)
      );
      expect(mocks.findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: "user-1",
            organizationId: "org-1",
          },
        },
        select: {
          role: true,
        },
      });
    });

    it("returns null when membership does not exist", async () => {
      mocks.findUnique.mockResolvedValue(null);

      await expect(getMemberRole("user-1", "org-1")).resolves.toBeNull();
    });

    it("returns null for an invalid database role", async () => {
      mocks.findUnique.mockResolvedValue({ role: "super_admin" });

      await expect(getMemberRole("user-1", "org-1")).resolves.toBeNull();
    });

    it("does not query when user or organization ID is empty", async () => {
      await expect(getMemberRole("", "org-1")).resolves.toBeNull();
      await expect(getMemberRole("user-1", "")).resolves.toBeNull();

      expect(mocks.withUserContext).not.toHaveBeenCalled();
    });
  });

  describe("requireOrgPermission", () => {
    it("allows a member to read analytics", async () => {
      mocks.findUnique.mockResolvedValue({ role: "member" });

      await expect(
        requireOrgPermission("user-1", "org-1", "analytics:read")
      ).resolves.toEqual({
        allowed: true,
        role: "member",
      });
    });

    it("denies a viewer from creating projects", async () => {
      mocks.findUnique.mockResolvedValue({ role: "viewer" });

      await expect(
        requireOrgPermission("user-1", "org-1", "project:create")
      ).resolves.toEqual({
        allowed: false,
        role: "viewer",
        error: "Forbidden: role 'viewer' cannot perform 'project:create'",
      });
    });

    it("denies users without organization membership", async () => {
      mocks.findUnique.mockResolvedValue(null);

      await expect(
        requireOrgPermission("user-1", "org-1", "analytics:read")
      ).resolves.toEqual({
        allowed: false,
        error: "Not a member of this organization",
      });
    });
  });

  describe("isSoleOwner", () => {
    it("returns true when the user is the only owner", async () => {
      mocks.count.mockResolvedValue(1);
      mocks.findFirst.mockResolvedValue({ id: "membership-1" });

      await expect(isSoleOwner("user-1", "org-1")).resolves.toBe(true);

      expect(mocks.withUserContext).toHaveBeenCalledWith(
        "user-1",
        expect.any(Function)
      );
      expect(mocks.count).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          role: "owner",
        },
      });
    });

    it("returns false when the organization has multiple owners", async () => {
      mocks.count.mockResolvedValue(2);

      await expect(isSoleOwner("user-1", "org-1")).resolves.toBe(false);
      expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it("returns false when the user is not an owner", async () => {
      mocks.count.mockResolvedValue(1);
      mocks.findFirst.mockResolvedValue(null);

      await expect(isSoleOwner("user-1", "org-1")).resolves.toBe(false);
    });

    it("returns false when the organization has no owners", async () => {
      mocks.count.mockResolvedValue(0);

      await expect(isSoleOwner("user-1", "org-1")).resolves.toBe(false);
      expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it("does not query when user or organization ID is empty", async () => {
      await expect(isSoleOwner("", "org-1")).resolves.toBe(false);
      await expect(isSoleOwner("user-1", "")).resolves.toBe(false);

      expect(mocks.withUserContext).not.toHaveBeenCalled();
    });
  });
});

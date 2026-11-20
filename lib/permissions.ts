import { withUserContext } from "@/lib/db-context";

/**
 * Canonical tenant roles:
 * - owner: Full organization control, billing, ownership transfer, admin invites
 * - admin: Management access (projects, API keys, member invites/removals)
 * - viewer: Standard read-only analytics access
 */
export const TENANT_ROLES = ["owner", "admin", "viewer"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const ORG_ROLES = [
  "owner",
  "admin",
  "member",
  "viewer",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export function normalizeOrgRole(role: string): TenantRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "member") return "viewer";
  if (normalized === "owner" || normalized === "admin" || normalized === "viewer") {
    return normalized;
  }
  return "viewer";
}

export type OrgAction =
  | "org:update"
  | "org:delete"
  | "member:invite"
  | "member:remove"
  | "member:update_role"
  | "project:create"
  | "project:update"
  | "project:delete"
  | "api_key:create"
  | "api_key:revoke"
  | "analytics:read"
  | "settings:read";

const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgAction[]> = {
  owner: [
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
  ],

  admin: [
    "org:update",
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
  ],

  member: [
    "analytics:read",
  ],

  viewer: [
    "analytics:read",
  ],
};

export function isOrgRole(role: unknown): role is OrgRole {
  return (
    typeof role === "string" &&
    ORG_ROLES.includes(role as OrgRole)
  );
}

export function hasPermission(
  role: unknown,
  action: OrgAction
): boolean {
  if (typeof role !== "string") {
    return false;
  }

  const normalizedRole = role.trim().toLowerCase();

  if (!isOrgRole(normalizedRole)) {
    return false;
  }

  return ROLE_PERMISSIONS[normalizedRole].includes(action);
}

export function canAssignRole(
  actorRole: unknown,
  targetRole: unknown
): boolean {
  if (
    typeof actorRole !== "string" ||
    typeof targetRole !== "string"
  ) {
    return false;
  }

  const actor = actorRole.trim().toLowerCase();
  const target = targetRole.trim().toLowerCase();

  if (!isOrgRole(actor) || !isOrgRole(target)) {
    return false;
  }

  if (actor === "owner") {
    return true;
  }

  if (actor === "admin") {
    return target === "member" || target === "viewer";
  }

  return false;
}

export async function getMemberRole(
  userId: string,
  organizationId: string
): Promise<OrgRole | null> {
  if (
    !userId.trim() ||
    !organizationId.trim()
  ) {
    return null;
  }

  return withUserContext(userId, async (tx) => {
    const membership = await tx.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      select: {
        role: true,
      },
    });

    return isOrgRole(membership?.role)
      ? membership.role
      : null;
  });
}

export async function requireOrgPermission(
  userId: string,
  organizationId: string,
  action: OrgAction
): Promise<{
  allowed: boolean;
  role?: OrgRole;
  error?: string;
}> {
  const role = await getMemberRole(userId, organizationId);

  if (!role) {
    return {
      allowed: false,
      error: "Not a member of this organization",
    };
  }

  if (!hasPermission(role, action)) {
    return {
      allowed: false,
      role,
      error: `Forbidden: role '${role}' cannot perform '${action}'`,
    };
  }

  return {
    allowed: true,
    role,
  };
}

export async function isSoleOwner(
  userId: string,
  organizationId: string
): Promise<boolean> {
  if (
    !userId.trim() ||
    !organizationId.trim()
  ) {
    return false;
  }

  return withUserContext(userId, async (tx) => {
    const ownerCount = await tx.organizationMember.count({
      where: {
        organizationId,
        role: "owner",
      },
    });

    if (ownerCount !== 1) {
      return false;
    }

    const membership = await tx.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        role: "owner",
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  });
}

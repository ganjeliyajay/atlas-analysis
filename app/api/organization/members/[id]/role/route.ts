
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";

import {
  canAssignRole,
  hasPermission,
  isOrgRole,
} from "@/lib/permissions";

const updateRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

class RoleUpdateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "RoleUpdateError";
  }
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const PATCH = auth(
  async function PATCH(req, context: RouteContext) {
    try {
      // 1. Authentication
      const session = req.auth;

      if (!session?.user?.id) {
        return NextResponse.json(
          { message: "Unauthorized" },
          { status: 401 }
        );
      }

      const actorUserId = session.user.id;

      // 2. Active organization
      const org = await getCurrentOrganization();

      if (!org) {
        return NextResponse.json(
          { message: "No active organization" },
          { status: 400 }
        );
      }

      // 3. Target member ID
      const { id: targetMemberId } = await context.params;

      if (!targetMemberId?.trim()) {
        return NextResponse.json(
          { message: "Member ID is required" },
          { status: 400 }
        );
      }

      // 4. Validate request body
      let body: unknown;

      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { message: "Invalid JSON request body" },
          { status: 400 }
        );
      }

      const validation = updateRoleSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          {
            message:
              validation.error.issues[0]?.message ??
              "Invalid role",
          },
          { status: 400 }
        );
      }

      const requestedRole = validation.data.role;

      // 5. Execute everything in one tenant transaction
      const result = await withTenantContext(
        actorUserId,
        org.id,
        async (tx) => {
          /*
           * Serialize role changes for this organization.
           * The CTE forces the lock but returns only an integer
           * to Prisma, avoiding PostgreSQL's unsupported void type.
           */
          await tx.$queryRaw<Array<{ locked: number }>>`
            WITH lock_result AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${org.id}, 0)
              )
            )
            SELECT 1::int AS locked
            FROM lock_result
          `;

          // 6. Re-check actor membership inside transaction
          const actorMembership =
            await tx.organizationMember.findUnique({
              where: {
                userId_organizationId: {
                  userId: actorUserId,
                  organizationId: org.id,
                },
              },
              select: {
                role: true,
              },
            });

          if (!isOrgRole(actorMembership?.role)) {
            throw new RoleUpdateError(
              "You are not a member of this organization",
              403
            );
          }

          const actorRole = actorMembership.role;

          if (!hasPermission(actorRole, "member:update_role")) {
            throw new RoleUpdateError(
              "You do not have permission to update member roles",
              403
            );
          }

          // 7. Find target only inside active organization
          const targetMembership =
            await tx.organizationMember.findFirst({
              where: {
                id: targetMemberId,
                organizationId: org.id,
              },
              select: {
                id: true,
                userId: true,
                role: true,
              },
            });

          if (!targetMembership) {
            throw new RoleUpdateError(
              "Organization member not found",
              404
            );
          }

          if (!isOrgRole(targetMembership.role)) {
            throw new RoleUpdateError(
              "Target member has an invalid organization role",
              409
            );
          }

          const targetCurrentRole = targetMembership.role;

          // 8. Validate role assignment permissions
          if (!canAssignRole(actorRole, requestedRole)) {
            throw new RoleUpdateError(
              `Your ${actorRole} role cannot assign the ${requestedRole} role`,
              403
            );
          }

          // 9. Read canonical organization owner
          const organization = await tx.organization.findUnique({
            where: {
              id: org.id,
            },
            select: {
              id: true,
              ownerId: true,
            },
          });

          if (!organization) {
            throw new RoleUpdateError(
              "Organization not found",
              404
            );
          }

          const targetIsCanonicalOwner =
            targetMembership.userId === organization.ownerId;

          // 10. Only canonical owner can transfer ownership
          if (
            requestedRole === "owner" &&
            actorRole !== "owner"
          ) {
            throw new RoleUpdateError(
              "Only the current owner can transfer organization ownership",
              403
            );
          }

          // 11. Admin cannot modify canonical owner's role
          if (actorRole === "admin" && targetIsCanonicalOwner) {
            throw new RoleUpdateError(
              "An admin cannot change the organization owner's role",
              403
            );
          }

          // 12. Owner cannot directly demote themselves
          if (
            targetMembership.userId === actorUserId &&
            targetIsCanonicalOwner &&
            requestedRole !== "owner"
          ) {
            throw new RoleUpdateError(
              "Transfer organization ownership before changing your own role",
              409
            );
          }

          // 13. Check whether role is already assigned
          if (targetCurrentRole === requestedRole) {
            return {
              memberId: targetMembership.id,
              userId: targetMembership.userId,
              previousRole: targetCurrentRole,
              role: requestedRole,
              ownershipTransferred: false,
              unchanged: true,
            };
          }

          // 14. Secure ownership transfer
          if (requestedRole === "owner") {
            if (organization.ownerId !== actorUserId) {
              throw new RoleUpdateError(
                "Organization ownership is inconsistent. Contact an organization owner.",
                409
              );
            }

            // Verify current owner membership consistency
            const currentOwnerMembership =
              await tx.organizationMember.findUnique({
                where: {
                  userId_organizationId: {
                    userId: organization.ownerId,
                    organizationId: org.id,
                  },
                },
                select: {
                  id: true,
                  role: true,
                },
              });

            if (
              !currentOwnerMembership ||
              currentOwnerMembership.role !== "owner"
            ) {
              throw new RoleUpdateError(
                "Current organization owner membership is inconsistent",
                409
              );
            }

            /*
             * Call the SECURITY DEFINER PostgreSQL function.
             * The CTE prevents Prisma from trying to deserialize
             * the function's void return value.
             */
            await tx.$queryRaw<Array<{ transferred: number }>>`
              WITH transfer_result AS MATERIALIZED (
                SELECT public.transfer_organization_ownership(
                  ${org.id},
                  ${targetMembership.userId}
                )
              )
              SELECT 1::int AS transferred
              FROM transfer_result
            `;

            return {
              memberId: targetMembership.id,
              userId: targetMembership.userId,
              previousRole: targetCurrentRole,
              role: "owner" as const,
              ownershipTransferred: true,
              unchanged: false,
            };
          }

          // 15. Normal role update
          if (targetIsCanonicalOwner) {
            throw new RoleUpdateError(
              "The organization owner cannot be demoted. Transfer ownership first.",
              409
            );
          }

          const roleUpdate = await tx.$queryRaw<
            Array<{ updated: boolean }>
          >`
            SELECT public.update_organization_member_role(
              ${org.id},
              ${targetMembership.id},
              ${requestedRole}
            ) AS updated
          `;

          if (roleUpdate[0]?.updated !== true) {
            throw new RoleUpdateError(
              "Organization member could not be updated",
              409
            );
          }

          return {
            memberId: targetMembership.id,
            userId: targetMembership.userId,
            previousRole: targetCurrentRole,
            role: requestedRole,
            ownershipTransferred: false,
            unchanged: false,
          };
        }
      );

      // 16. API response
      return NextResponse.json({
        message: result.unchanged
          ? "Member already has this role"
          : result.ownershipTransferred
            ? "Organization ownership transferred successfully"
            : "Member role updated successfully",
        member: result,
      });
    } catch (error) {
      // Expected role and authorization errors
      if (error instanceof RoleUpdateError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        );
      }

      // Tenant context rejects users who are not organization members
      if (
        error instanceof Error &&
        error.message === "Organization access denied"
      ) {
        return NextResponse.json(
          { message: "You are not a member of this organization" },
          { status: 403 }
        );
      }

      console.error("Update member role error:", error);

      return NextResponse.json(
        { message: "Failed to update member role" },
        { status: 500 }
      );
    }
  }
);

import { z } from "zod";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";

export const POST = auth(async function POST(req, context) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const org = await getCurrentOrganization();

    if (!org) {
      return NextResponse.json(
        { message: "No active organization" },
        { status: 400 }
      );
    }

    const permission = await requireOrgPermission(
      session.user.id,
      org.id,
      "member:invite"
    );

    if (!permission.allowed) {
      return NextResponse.json(
        { message: permission.error },
        { status: 403 }
      );
    }

    const params = await (
      context as { params: Promise<{ id: string }> }
    ).params;

    const invitationIdResult = z.string().trim().min(1).safeParse(params.id);

    if (!invitationIdResult.success) {
      return NextResponse.json(
        { message: "Invitation ID is required" },
        { status: 400 }
      );
    }

    const invitationId = invitationIdResult.data;

    const result = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        const invitation = await tx.invitation.findFirst({
          where: {
            id: invitationId,
            organizationId: org.id,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!invitation) {
          return { type: "not_found" as const };
        }

        // Repeated revoke requests are safe and idempotent.
        if (invitation.status === "revoked") {
          return {
            type: "already_revoked" as const,
            id: invitation.id,
          };
        }

        if (invitation.status !== "pending") {
          return {
            type: "invalid_status" as const,
            status: invitation.status,
          };
        }

        // Atomic status transition: only one request can
        // change a pending invitation to revoked.
        const update = await tx.invitation.updateMany({
          where: {
            id: invitationId,
            organizationId: org.id,
            status: "pending",
          },
          data: {
            status: "revoked",
          },
        });

        if (update.count !== 1) {
          const latest = await tx.invitation.findFirst({
            where: {
              id: invitationId,
              organizationId: org.id,
            },
            select: {
              id: true,
              status: true,
            },
          });

          if (!latest) {
            return { type: "not_found" as const };
          }

          if (latest.status === "revoked") {
            return {
              type: "already_revoked" as const,
              id: latest.id,
            };
          }

          return {
            type: "conflict" as const,
            status: latest.status,
          };
        }

        return {
          type: "success" as const,
          id: invitation.id,
        };
      }
    );

    if (result.type === "not_found") {
      return NextResponse.json(
        { message: "Invitation not found" },
        { status: 404 }
      );
    }

    if (result.type === "invalid_status") {
      return NextResponse.json(
        {
          message: `Cannot revoke an invitation with status '${result.status}'`,
        },
        { status: 409 }
      );
    }

    if (result.type === "conflict") {
      return NextResponse.json(
        {
          message: `Invitation status changed to '${result.status}'. Please refresh.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message:
        result.type === "already_revoked"
          ? "Invitation is already revoked"
          : "Invitation revoked successfully",
      invitation: {
        id: result.id,
        status: "revoked",
      },
    });
  } catch (error) {
    console.error("Revoke invitation error:", error);

    return NextResponse.json(
      { message: "Failed to revoke invitation" },
      { status: 500 }
    );
  }
});

import { z } from "zod";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";
import { emailService } from "@/lib/email";
import crypto from "crypto";

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

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    const result = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        const existing = await tx.invitation.findFirst({
          where: {
            id: invitationId,
            organizationId: org.id,
          },
          select: {
            id: true,
            status: true,
            tokenHash: true,
          },
        });

        if (!existing) {
          return { type: "not_found" as const };
        }

        if (existing.status !== "pending") {
          return {
            type: "invalid_status" as const,
            status: existing.status,
          };
        }

        // Compare the old tokenHash to prevent concurrent
        // resend requests from overwriting each other's tokens.
        const update = await tx.invitation.updateMany({
          where: {
            id: invitationId,
            organizationId: org.id,
            status: "pending",
            tokenHash: existing.tokenHash,
          },
          data: {
            tokenHash,
            expiresAt,
          },
        });

        if (update.count !== 1) {
          return { type: "conflict" as const };
        }

        const updated = await tx.invitation.findFirst({
          where: {
            id: invitationId,
            organizationId: org.id,
          },
          select: {
            id: true,
            email: true,
            role: true,
            expiresAt: true,
            status: true,
          },
        });

        if (!updated) {
          return { type: "not_found" as const };
        }

        return {
          type: "success" as const,
          invitation: updated,
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
          message: `Cannot resend an invitation with status '${result.status}'`,
        },
        { status: 409 }
      );
    }

    if (result.type === "conflict") {
      return NextResponse.json(
        {
          message: "Invitation was modified by another request. Please retry.",
        },
        { status: 409 }
      );
    }

    try {
      await emailService.sendInvitationEmail({
        to: result.invitation.email,
        organizationName: org.name,
        inviterName: session.user.name || "A team member",
        role: result.invitation.role,
        inviteToken: rawToken,
        expiresAt: result.invitation.expiresAt,
      });
    } catch (emailError) {
      console.error("Resend invitation email failed:", emailError);

      return NextResponse.json(
        {
          message:
            "Invitation token was refreshed, but the email could not be sent. Please retry.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: "Invitation resent successfully",
      invitation: result.invitation,
    });
  } catch (error) {
    console.error("Resend invitation error:", error);

    return NextResponse.json(
      { message: "Failed to resend invitation" },
      { status: 500 }
    );
  }
});

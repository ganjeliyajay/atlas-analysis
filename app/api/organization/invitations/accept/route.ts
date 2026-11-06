
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { ACTIVE_ORG_COOKIE_NAME } from "@/lib/organization";
import { cookies } from "next/headers";
import crypto from "crypto";
import { z } from "zod";
import { isOrgRole } from "@/lib/permissions";

const acceptSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
});

class InvitationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

export const POST = auth(async function POST(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          message: "Authentication required to accept invitation",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const authenticatedEmail = session.user.email?.trim().toLowerCase();

    if (!authenticatedEmail) {
      return NextResponse.json(
        { message: "Your account does not have a verified email address" },
        { status: 403 }
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const validation = acceptSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message:
            validation.error.issues[0]?.message ?? "Invalid invitation token",
        },
        { status: 400 }
      );
    }

    const { token } = validation.data;

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Initial lookup. The token is a high-entropy secret.
    const invitation = await prismaOps.invitation.findUnique({
      where: { tokenHash },
      include: {
        organization: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { message: "Invalid or nonexistent invitation token" },
        { status: 404 }
      );
    }

    // Do not allow an invitation to be accepted by another account.
    if (invitation.email.trim().toLowerCase() !== authenticatedEmail) {
      return NextResponse.json(
        {
          message:
            "This invitation was sent to a different email address. Please sign in with the invited account.",
        },
        { status: 403 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        {
          message: `This invitation has already been ${invitation.status}`,
        },
        { status: 400 }
      );
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          message:
            "This invitation has expired. Please ask for a new invitation.",
        },
        { status: 410 }
      );
    }

    // Never create a membership with an unknown database role.
    if (!isOrgRole(invitation.role)) {
      console.error("Invalid invitation role:", invitation.role);

      return NextResponse.json(
        { message: "This invitation contains an invalid role" },
        { status: 400 }
      );
    }

    const acceptedRole = invitation.role;

    // Atomically claim the pending invitation and create membership.
    // updateMany with status + expiry conditions prevents two concurrent
    // requests from accepting the same invitation.
    await prismaOps.$transaction(async (tx) => {
      const existingMembership =
        await tx.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: session.user.id,
              organizationId: invitation.organizationId,
            },
          },
          select: {
            id: true,
          },
        });

      if (existingMembership) {
        throw new InvitationError(
          "You are already a member of this organization",
          409
        );
      }

      const claim = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: "pending",
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: "accepted",
        },
      });

      if (claim.count !== 1) {
        throw new InvitationError(
          "This invitation has already been used, revoked, or expired",
          409
        );
      }

      await tx.organizationMember.create({
        data: {
          userId: session.user.id,
          organizationId: invitation.organizationId,
          role: acceptedRole,
        },
      });
    });

    // Set active organization only after successful acceptance.
    const cookieStore = await cookies();

    cookieStore.set(
      ACTIVE_ORG_COOKIE_NAME,
      invitation.organizationId,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully joined ${invitation.organization.name}`,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
        role: acceptedRole,
      },
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Accept invitation error:", error);

    return NextResponse.json(
      { message: "Failed to accept invitation" },
      { status: 500 }
    );
  }
});

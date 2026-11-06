import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";
import { emailService } from "@/lib/email";
import crypto from "crypto";
import { z } from "zod";

const createInvitationSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  role: z.enum(["admin", "viewer"]),
});

// GET /api/organization/invitations - List invitations for current org
export const GET = auth(async function GET(req) {
  try {
    const session = req.auth;
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const org = await getCurrentOrganization();
    if (!org) {
      return NextResponse.json(
        { message: "No active organization" },
        { status: 400 }
      );
    }

    const invitations = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.invitation.findMany({
          where: {
            organizationId: org.id,
          },
          include: {
            invitedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      }
    );

    const safeInvitations = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      invitedBy: inv.invitedBy,
    }));

    return NextResponse.json({ invitations: safeInvitations });
  } catch (error) {
    console.error("List invitations error:", error);
    return NextResponse.json(
      { message: "Failed to list invitations" },
      { status: 500 }
    );
  }
});

// POST /api/organization/invitations - Create and send invitation
export const POST = auth(async function POST(req) {
  try {
    const session = req.auth;
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const org = await getCurrentOrganization();
    if (!org) {
      return NextResponse.json(
        { message: "No active organization" },
        { status: 400 }
      );
    }

    // Role check: must have 'member:invite' permission
    const perm = await requireOrgPermission(session.user.id, org.id, "member:invite");
    if (!perm.allowed) {
      return NextResponse.json({ message: perm.error }, { status: 403 });
    }

    const body = await req.json();
    const validation = createInvitationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { email: rawEmail, role } = validation.data;
    if (role === "admin" && perm.role !== "owner") {
      return NextResponse.json(
        { message: "Only the organization owner can invite an admin" },
        { status: 403 },
      );
    }

    const email = rawEmail.toLowerCase();

    // Check if user is already a member
    const existingMember = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.organizationMember.findFirst({
          where: {
            organizationId: org.id,
            user: {
              email,
            },
          },
        });
      }
    );

    if (existingMember) {
      return NextResponse.json(
        { message: "User is already a member of this organization" },
        { status: 409 }
      );
    }

    // Check for an existing pending invitation
    const existingPending = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.invitation.findFirst({
          where: {
            organizationId: org.id,
            email,
            status: "pending",
            expiresAt: {
              gt: new Date(),
            },
          },
        });
      }
    );

    if (existingPending) {
      return NextResponse.json(
        { message: "An active invitation for this email already exists" },
        { status: 409 }
      );
    }

    // Generate token and expiration (7 days)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.invitation.create({
          data: {
            organizationId: org.id,
            email,
            role,
            tokenHash,
            expiresAt,
            status: "pending",
            invitedById: session.user.id,
          },
        });
      }
    );

    // Send invitation email
    await emailService.sendInvitationEmail({
      to: email,
      organizationName: org.name,
      inviterName: session.user.name || "A team member",
      role,
      inviteToken: rawToken,
      expiresAt,
    });

    return NextResponse.json(
      {
        message: "Invitation created and sent successfully",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create invitation error:", error);
    return NextResponse.json(
      { message: "Failed to create invitation" },
      { status: 500 }
    );
  }
});

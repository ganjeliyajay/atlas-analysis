import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db-context";
import { ACTIVE_ORG_COOKIE_NAME } from "@/lib/organization";
import { cookies } from "next/headers";
import { z } from "zod";

const switchSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization ID is required").max(128),
});

export const POST = auth(async function POST(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const validation = switchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { organizationId } = validation.data;

    // Verify user is actually a member of target organization (prevent IDOR)
    const membership = await withUserContext(session.user.id, async (tx) => {
      return tx.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: session.user.id,
            organizationId,
          },
        },
        include: {
          organization: true,
        },
      });
    });

    if (!membership) {
      return NextResponse.json(
        { message: "You do not have access to this organization" },
        { status: 403 }
      );
    }

    // Set HTTP-only selection hint cookie
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE_NAME, organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("Switch organization error:", error);
    return NextResponse.json(
      { message: "Failed to switch organization" },
      { status: 500 }
    );
  }
});


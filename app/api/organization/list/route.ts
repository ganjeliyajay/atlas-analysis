import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db-context";
import { getCurrentOrganization } from "@/lib/organization";

export const GET = auth(async function GET(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const currentOrg = await getCurrentOrganization();

    const memberships = await withUserContext(session.user.id, async (tx) => {
      return tx.organizationMember.findMany({
        where: {
          userId: session.user.id,
        },
        include: {
          organization: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    });

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      isCurrent: m.organization.id === currentOrg?.id,
    }));

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("List organizations error:", error);
    return NextResponse.json(
      { message: "Unable to load organizations" },
      { status: 500 }
    );
  }
});


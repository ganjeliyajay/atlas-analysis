import { auth } from "@/auth";
import { withUserContext } from "@/lib/db-context";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE_NAME = "atlas_active_org_id";

export interface OrganizationContext {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export async function getCurrentOrganization(): Promise<OrganizationContext | null> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  let preferredOrgId: string | undefined;
  try {
    const cookieStore = await cookies();
    preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
  } catch {
    // In contexts where cookies() is not available (e.g. non-request scopes)
  }

  return getActiveOrganization(session.user.id, preferredOrgId);
}

export async function getActiveOrganization(
  userId: string,
  preferredOrgId?: string
): Promise<OrganizationContext | null> {
  return withUserContext(userId, async (tx) => {
    // 1. If preferredOrgId is provided as a hint, verify membership against DB
    if (preferredOrgId?.trim()) {
      const preferredMembership = await tx.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: preferredOrgId.trim(),
          },
        },
        include: {
          organization: true,
        },
      });

      if (preferredMembership) {
        return {
          id: preferredMembership.organization.id,
          name: preferredMembership.organization.name,
          slug: preferredMembership.organization.slug,
          role: preferredMembership.role,
        };
      }
    }

    // 2. Fall back to the user's primary/first organization
    const defaultMembership = await tx.organizationMember.findFirst({
      where: {
        userId,
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!defaultMembership) {
      return null;
    }

    return {
      id: defaultMembership.organization.id,
      name: defaultMembership.organization.name,
      slug: defaultMembership.organization.slug,
      role: defaultMembership.role,
    };
  });
}

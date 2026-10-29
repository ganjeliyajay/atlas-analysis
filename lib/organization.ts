import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function getCurrentOrganization() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const membership = await prisma.organizationMember.findFirst({
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

  if (!membership) {
    return null;
  }

  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  };
}
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { withUserContext } from "@/lib/db-context"
import { redirect } from "next/navigation"

export async function getCurrentOrganization() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const membership = await withUserContext(session.user.id, async (tx) => {
    return tx.organizationMember.findFirst({
      where: {
        userId: session.user.id,
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  })

  if (!membership) {
    return null
  }

  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  }
}

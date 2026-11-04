import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { withUserContext } from "@/lib/db-context"

export const GET = auth(async function GET(req) {
  try {
    const session = req.auth

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
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
      return NextResponse.json({ organization: null }, { status: 200 })
    }

    return NextResponse.json({
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      },
    })
  } catch (error) {
    console.error("Current organization error:", error)

    return NextResponse.json(
      { message: "Unable to load organization" },
      { status: 500 },  
    )
  } 
})


import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";

function createSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function getUserOrganization(userId: string) {
  return prisma.organizationMember.findFirst({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      organization: true,
    },
  });
}

// ============================================
// GET: Fetch projects for current organization
// ============================================

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await getUserOrganization(
      session.user.id
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const projects = await prisma.project.findMany({
      where: {
        organizationId: membership.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    const formattedProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      websiteUrl: project.websiteUrl,
      platform: project.platform,
      description: project.description,
      environment: project.environment,
      createdAt: project.createdAt,
      eventCount: project._count.events,
      apiKeyPrefix: project.apiKeyPrefix,
    }));

    return NextResponse.json({
      projects: formattedProjects,
    });

    return NextResponse.json({
      projects: formattedProjects,
    });
  } catch (error) {
    console.error("GET projects error:", error);

    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// ============================================
// POST: Create a new project
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await getUserOrganization(
      session.user.id
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const websiteUrl =
      typeof body.websiteUrl === "string"
        ? body.websiteUrl.trim()
        : "";

    const platform =
      typeof body.platform === "string"
        ? body.platform
        : "Next.js";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : null;

    const environment =
      typeof body.environment === "string"
        ? body.environment
        : "production";

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const slug = createSlug(name);

    if (!slug) {
      return NextResponse.json(
        { error: "Invalid project name" },
        { status: 400 }
      );
    }

    // Generate a raw API key.
    // Store only its hash in the database.
    const apiKey = `atl_live_${randomBytes(32).toString("hex")}`;

    const apiKeyHash = hashApiKey(apiKey);

    const apiKeyPrefix = apiKey.slice(0, 16);

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        websiteUrl: websiteUrl || null,
        platform,
        description,
        environment,
        apiKeyHash,
        apiKeyPrefix,
        organizationId: membership.organizationId,
      },
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          websiteUrl: project.websiteUrl,
          platform: project.platform,
          description: project.description,
          environment: project.environment,
          createdAt: project.createdAt,
          eventCount: 0,
          apiKeyPrefix: project.apiKeyPrefix,
        },

        // Raw API key is returned only once at creation.
        apiKey,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST project error:", error);

    // Prisma unique constraint violation.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "A project with this name already exists",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH: Update an existing project
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await getUserOrganization(
      session.user.id
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const projectId =
      typeof body.projectId === "string"
        ? body.projectId
        : "";

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const existingProject =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
      });

    if (!existingProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : existingProject.name;

    const websiteUrl =
      typeof body.websiteUrl === "string"
        ? body.websiteUrl.trim()
        : existingProject.websiteUrl;

    const platform =
      typeof body.platform === "string"
        ? body.platform
        : existingProject.platform;

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : existingProject.description;

    if (!name) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const updatedProject =
      await prisma.project.update({
        where: {
          id: existingProject.id,
        },
        data: {
          name,
          slug: createSlug(name),
          websiteUrl: websiteUrl || null,
          platform,
          description,
        },
      });

    return NextResponse.json({
      project: updatedProject,
    });
  } catch (error) {
    console.error("PATCH project error:", error);

    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: Delete a project
// ============================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await getUserOrganization(
      session.user.id
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const projectId =
      request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
      });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    await prisma.project.delete({
      where: {
        id: project.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("DELETE project error:", error);

    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}

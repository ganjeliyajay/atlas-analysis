
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";
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
  return withUserContext(userId, (tx) =>
    tx.organizationMember.findFirst({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        organization: true,
      },
    })
  );
}

// ============================================
// GET: Fetch projects for current organization
// ============================================

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const membership = await getUserOrganization(userId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const projects = await withTenantContext(
      userId,
      membership.organizationId,
      (tx) =>
        tx.project.findMany({
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
        })
    );

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
  } catch (error) {
    console.error("GET projects error:", error);

    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
});

// ============================================
// POST: Create a new project
// ============================================

export const POST = auth(async function POST(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const membership = await getUserOrganization(userId);

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

    const project = await withTenantContext(
      userId,
      membership.organizationId,
      (tx) =>
        tx.project.create({
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
        })
    );

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
});

// ============================================
// PATCH: Update an existing project
// ============================================

export const PATCH = auth(async function PATCH(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();

    const {
      projectId,
      name,
      websiteUrl,
      platform,
      description,
      regenerateApiKey,
    } = body;

    if (
      typeof projectId !== "string" ||
      !projectId.trim()
    ) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const membership = await getUserOrganization(userId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization membership not found" },
        { status: 403 }
      );
    }

    // Generate a new API key only when requested.
    const newApiKey = regenerateApiKey
      ? `atl_live_${randomBytes(32).toString("hex")}`
      : null;

    const result = await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        // Verify project belongs to user's organization.
        const existingProject = await tx.project.findFirst({
          where: {
            id: projectId,
            organizationId: membership.organizationId,
          },
          select: {
            id: true,
          },
        });

        if (!existingProject) {
          return { notFound: true as const };
        }

        const updatedProject = await tx.project.update({
          where: {
            id: existingProject.id,
          },
          data: {
            ...(name !== undefined && {
              name,
              slug: createSlug(name),
            }),
            ...(websiteUrl !== undefined && {
              websiteUrl: websiteUrl || null,
            }),
            ...(platform !== undefined && { platform }),
            ...(description !== undefined && {
              description: description || null,
            }),
            ...(newApiKey && {
              apiKeyHash: hashApiKey(newApiKey),
              apiKeyPrefix: newApiKey.slice(0, 16),
            }),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            websiteUrl: true,
            platform: true,
            description: true,
            environment: true,
            apiKeyPrefix: true,
            createdAt: true,
          },
        });

        return {
          notFound: false as const,
          project: updatedProject,
        };
      }
    );

    if (result.notFound) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      project: result.project,
      ...(newApiKey && { apiKey: newApiKey }),
    });
  } catch (error) {
    console.error("Update project error:", error);

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
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
});

// ============================================
// DELETE: Delete a project
// ============================================

export const DELETE = auth(async function DELETE(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const membership = await getUserOrganization(userId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const deleted = await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            organizationId: membership.organizationId,
          },
          select: {
            id: true,
          },
        });

        if (!project) {
          return false;
        }

        await tx.project.delete({
          where: {
            id: project.id,
          },
        });

        return true;
      }
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

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
});

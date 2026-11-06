
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
} from "@/lib/db-context";
import { getCurrentOrganization } from "@/lib/organization";
import { requireOrgPermission } from "@/lib/permissions";
import { generateApiKey } from "@/lib/api-keys";
import { z } from "zod";
function createSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  websiteUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  platform: z.string().trim().min(1).max(50).default("Next.js"),
  description: z.string().trim().max(1000).nullable().optional(),
  environment: z.enum(["development", "staging", "production"]).default("production"),
});

const updateProjectSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  websiteUrl: z.union([z.string().trim().url(), z.literal("")]).nullable().optional(),
  platform: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  regenerateApiKey: z.boolean().optional(),
});


async function getUserOrganization() {
  const currentOrg = await getCurrentOrganization();
  if (!currentOrg) return null;
  return {
    organizationId: currentOrg.id,
    organization: currentOrg,
  };
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

    const membership = await getUserOrganization();

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

    const membership = await getUserOrganization();

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const permission = await requireOrgPermission(
      userId,
      membership.organizationId,
      "project:create",
    );
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const validation = createProjectSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid project input" },
        { status: 400 },
      );
    }

    const {
      name,
      websiteUrl = "",
      platform,
      description = null,
      environment,
    } = validation.data;

    const slug = createSlug(name);

    if (!slug) {
      return NextResponse.json(
        { error: "Invalid project name" },
        { status: 400 }
      );
    }

    // Issue a dedicated, one-time API key. Only its salted scrypt hash is stored.
    const generatedKey = generateApiKey();

    const result = await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        const project = await tx.project.create({
          data: {
            name,
            slug,
            websiteUrl: websiteUrl || null,
            platform,
            description,
            environment,
            apiKeyPrefix: generatedKey.keyPrefix,
            apiKeyHash: null,
            organizationId: membership.organizationId,
          },
        });

        await tx.apiKey.create({
          data: {
            organizationId: membership.organizationId,
            projectId: project.id,
            name: `${name} API key`,
            keyPrefix: generatedKey.keyPrefix,
            keyHash: generatedKey.keyHash,
            createdById: userId,
          },
        });

        return project;
      },
    );

    const project = result;

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
        apiKey: generatedKey.rawKey,
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const validation = updateProjectSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? "Invalid project input" },
        { status: 400 },
      );
    }

    const {
      projectId,
      name,
      websiteUrl,
      platform,
      description,
      regenerateApiKey,
    } = validation.data;

    const membership = await getUserOrganization();

    if (!membership) {
      return NextResponse.json(
        { error: "Organization membership not found" },
        { status: 403 }
      );
    }

    const permission = await requireOrgPermission(
      userId,
      membership.organizationId,
      "project:update",
    );
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: 403 });
    }

    if (name !== undefined && !createSlug(name)) {
      return NextResponse.json({ error: "Project name must contain letters or numbers" }, { status: 400 });
    }

    const generatedKey = regenerateApiKey ? generateApiKey() : null;

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
            ...(generatedKey && {
              apiKeyHash: null,
              apiKeyPrefix: generatedKey.keyPrefix,
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

        if (generatedKey) {
          await tx.apiKey.updateMany({
            where: {
              projectId: existingProject.id,
              organizationId: membership.organizationId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });

          await tx.apiKey.create({
            data: {
              organizationId: membership.organizationId,
              projectId: existingProject.id,
              name: `${updatedProject.name} API key`,
              keyPrefix: generatedKey.keyPrefix,
              keyHash: generatedKey.keyHash,
              createdById: userId,
            },
          });
        }

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
      ...(generatedKey && { apiKey: generatedKey.rawKey }),
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

    const membership = await getUserOrganization();

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const permission = await requireOrgPermission(
      userId,
      membership.organizationId,
      "project:delete",
    );
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projectIdValidation = z.string().trim().min(1).safeParse(
      searchParams.get("projectId"),
    );

    if (!projectIdValidation.success) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const projectId = projectIdValidation.data;

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

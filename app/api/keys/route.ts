
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";
import { generateApiKey } from "@/lib/api-keys";
import { z } from "zod";

const createKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name is required")
    .max(100, "Name too long"),

  projectId: z.string().trim().optional().nullable(),

  expiresInDays: z
    .number()
    .int()
    .positive()
    .max(3650, "API key expiry cannot exceed 3650 days")
    .optional()
    .nullable(),
});

// GET /api/keys
export const GET = auth(async function GET(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const org = await getCurrentOrganization();

    if (!org) {
      return NextResponse.json(
        { message: "No active organization" },
        { status: 400 },
      );
    }

    const permission = await requireOrgPermission(
      session.user.id,
      org.id,
      "settings:read",
    );

    if (!permission.allowed) {
      return NextResponse.json(
        { message: permission.error },
        { status: 403 },
      );
    }

    const keys = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.apiKey.findMany({
          where: {
            organizationId: org.id,
          },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            projectId: true,
            createdAt: true,
            expiresAt: true,
            lastUsedAt: true,
            revokedAt: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      },
    );

    const now = Date.now();

    const safeKeys = keys.map((key) => {
      let status: "active" | "expired" | "revoked" = "active";

      if (key.revokedAt) {
        status = "revoked";
      } else if (
        key.expiresAt &&
        key.expiresAt.getTime() <= now
      ) {
        status = "expired";
      }

      return {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        projectId: key.projectId,
        project: key.project?.name ?? "All Projects",
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt?.toISOString() ?? null,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        revokedAt: key.revokedAt?.toISOString() ?? null,
        status,
        createdBy: key.createdBy?.name ?? "System",
      };
    });

    return NextResponse.json({
      keys: safeKeys,
    });
  } catch (error) {
    console.error("List API keys error:", error);

    return NextResponse.json(
      { message: "Failed to list API keys" },
      { status: 500 },
    );
  }
});

// POST /api/keys
// Create a new API key. The raw secret is returned only once.
export const POST = auth(async function POST(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 },
      );
    }

    const org = await getCurrentOrganization();

    if (!org) {
      return NextResponse.json(
        { message: "No active organization" },
        { status: 400 },
      );
    }

    const permission = await requireOrgPermission(
      session.user.id,
      org.id,
      "api_key:create",
    );

    if (!permission.allowed) {
      return NextResponse.json(
        { message: permission.error },
        { status: 403 },
      );
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

    const validation = createKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message:
            validation.error.issues[0]?.message ??
            "Invalid input",
        },
        { status: 400 },
      );
    }

    const { name, projectId, expiresInDays } = validation.data;

    if (projectId) {
      const projectExists = await withTenantContext(
        session.user.id,
        org.id,
        async (tx) => {
          return tx.project.findFirst({
            where: {
              id: projectId,
              organizationId: org.id,
            },
            select: {
              id: true,
            },
          });
        },
      );

      if (!projectExists) {
        return NextResponse.json(
          {
            message: "Specified project not found in organization",
          },
          { status: 404 },
        );
      }
    }

    const { rawKey, keyPrefix, keyHash } = generateApiKey();

    const expiresAt =
      expiresInDays != null
        ? new Date(
            Date.now() +
              expiresInDays * 24 * 60 * 60 * 1000,
          )
        : null;

    const createdKey = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.apiKey.create({
          data: {
            organizationId: org.id,
            projectId: projectId || null,
            name,
            keyPrefix,
            keyHash,
            expiresAt,
            createdById: session.user.id,
          },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            projectId: true,
            expiresAt: true,
            createdAt: true,
          },
        });
      },
    );

    return NextResponse.json(
      {
        message:
          "API key created successfully. Save your secret key now; you will not be able to view it again.",
        key: {
          ...createdKey,
          expiresAt: createdKey.expiresAt?.toISOString() ?? null,
          createdAt: createdKey.createdAt.toISOString(),
          secretKey: rawKey,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create API key error:", error);

    return NextResponse.json(
      { message: "Failed to create API key" },
      { status: 500 },
    );
  }
});

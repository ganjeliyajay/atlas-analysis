import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db-context";
import { getCurrentOrganization } from "@/lib/organization";
import { requireOrgPermission } from "@/lib/permissions";
import { generateApiKey } from "@/lib/api-keys";

const projectIdSchema = z.string().trim().min(1);

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export const POST = auth(async function POST(request, context) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await (context as RouteContext).params;
    const projectIdResult = projectIdSchema.safeParse(params.projectId);

    if (!projectIdResult.success) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const organization = await getCurrentOrganization();
    if (!organization) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const permission = await requireOrgPermission(
      session.user.id,
      organization.id,
      "api_key:create",
    );

    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: 403 });
    }

    const generatedKey = generateApiKey();

    const result = await withTenantContext(
      session.user.id,
      organization.id,
      async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: projectIdResult.data,
            organizationId: organization.id,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!project) {
          return null;
        }

        await tx.apiKey.updateMany({
          where: {
            projectId: project.id,
            organizationId: organization.id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        await tx.apiKey.create({
          data: {
            organizationId: organization.id,
            projectId: project.id,
            name: `${project.name} API key`,
            keyPrefix: generatedKey.keyPrefix,
            keyHash: generatedKey.keyHash,
            createdById: session.user.id,
          },
        });

        await tx.project.update({
          where: { id: project.id },
          data: {
            apiKeyHash: null,
            apiKeyPrefix: generatedKey.keyPrefix,
          },
        });

        return project;
      },
    );

    if (!result) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Ingestion API key generated successfully. Save it now; it will not be shown again.",
      apiKey: generatedKey.rawKey,
      keyPrefix: generatedKey.keyPrefix,
    });
  } catch (error) {
    console.error("Ingestion API key generation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

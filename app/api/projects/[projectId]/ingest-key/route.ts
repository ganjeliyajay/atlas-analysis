
import { auth } from "@/auth";
import { withTenantContext, withUserContext } from "@/lib/db-context";
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

export const POST = auth(async function POST(
  request,
  context?: { params?: Promise<{ projectId: string }> | { projectId: string } }
) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const resolvedParams = context?.params
      ? await context.params
      : null;

    const projectId = resolvedParams?.projectId;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // Get all organizations the signed-in user belongs to.
    const memberships = await withUserContext(
      userId,
      async (tx) => {
        return tx.organizationMember.findMany({
          where: { userId },
          select: { organizationId: true },
        });
      }
    );

    if (memberships.length === 0) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Generate a secure API key.
    const rawApiKey = `atl_live_${randomBytes(32).toString("hex")}`;

    // Store only its SHA-256 hash.
    const apiKeyHash = createHash("sha256")
      .update(rawApiKey)
      .digest("hex");

    const apiKeyPrefix = rawApiKey.slice(0, 16);

    // Find and update the project inside its tenant context.
    for (const membership of memberships) {
      const updated = await withTenantContext(
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

          await tx.project.update({
            where: {
              id: project.id,
            },
            data: {
              apiKeyHash,
              apiKeyPrefix,
            },
          });

          return true;
        }
      );

      if (updated) {
        // Return the raw key only once.
        return NextResponse.json({
          message: "Ingestion API key generated successfully",
          apiKey: rawApiKey,
          keyPrefix: apiKeyPrefix,
        });
      }
    }

    return NextResponse.json(
      { error: "Project not found or access denied" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Ingestion API key generation error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

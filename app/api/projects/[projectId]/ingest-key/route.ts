import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { projectId } = await params;

    // Verify that the signed-in user belongs to the project's organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Generate a secure API key
    const rawApiKey = `atl_live_${randomBytes(32).toString("hex")}`;

    // Store only its SHA-256 hash
    const apiKeyHash = createHash("sha256")
      .update(rawApiKey)
      .digest("hex");

    const apiKeyPrefix = rawApiKey.slice(0, 16);

    await prisma.project.update({
      where: {
        id: project.id,
      },
      data: {
        apiKeyHash,
        apiKeyPrefix,
      },
    });

    // Return the raw key only once
    return NextResponse.json({
      message: "Ingestion API key generated successfully",
      apiKey: rawApiKey,
      keyPrefix: apiKeyPrefix,
    });
  } catch (error) {
    console.error("Ingestion API key generation error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
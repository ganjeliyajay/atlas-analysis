import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Read API key from Authorization header
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid API key" },
        { status: 401 }
      );
    }

    const apiKey = authorization.slice(7).trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 401 }
      );
    }

    // Hash API key to match the stored hash
    const apiKeyHash = createHash("sha256")
      .update(apiKey)
      .digest("hex");

    // Resolve the project using its API key
    const project = await prisma.project.findUnique({
      where: {
        apiKeyHash,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();

    const {
      eventName,
      userId,
      sessionId,
      properties,
      pageUrl,
      country,
      device,
      browser,
    } = body;

    // Validate event name
    if (
      typeof eventName !== "string" ||
      eventName.trim().length === 0 ||
      eventName.length > 100
    ) {
      return NextResponse.json(
        { error: "eventName must be a non-empty string up to 100 characters" },
        { status: 400 }
      );
    }

    // Validate optional fields
    if (userId !== undefined && typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId must be a string" },
        { status: 400 }
      );
    }

    if (sessionId !== undefined && typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId must be a string" },
        { status: 400 }
      );
    }

    if (properties !== undefined && properties !== null) {
      if (
        typeof properties !== "object" ||
        Array.isArray(properties)
      ) {
        return NextResponse.json(
          { error: "properties must be a JSON object" },
          { status: 400 }
        );
      }
    }

    // Save event under the project resolved from the API key
    const event = await prisma.analyticsEvent.create({
      data: {
        eventName: eventName.trim(),
        userId: userId ?? null,
        sessionId: sessionId ?? null,
        properties: properties ?? undefined,
        pageUrl: pageUrl ?? null,
        country: country ?? null,
        device: device ?? null,
        browser: browser ?? null,
        projectId: project.id,
      },
      select: {
        id: true,
        eventName: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Event ingested successfully",
        event,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Event ingestion error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
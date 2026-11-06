import { z } from "zod";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/keys/[id]/revoke
export const POST = auth(async function POST(req, context) {
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
      "api_key:revoke",
    );

    if (!permission.allowed) {
      return NextResponse.json(
        { message: permission.error },
        { status: 403 },
      );
    }

    const params = await (
      context as RouteContext
    ).params;

    const keyIdResult = z.string().trim().min(1).safeParse(params.id);

    if (!keyIdResult.success) {
      return NextResponse.json(
        { message: "Key ID is required" },
        { status: 400 },
      );
    }

    const keyId = keyIdResult.data;

    const result = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        const existing = await tx.apiKey.findFirst({
          where: {
            id: keyId,
            organizationId: org.id,
          },
          select: {
            id: true,
            revokedAt: true,
          },
        });

        if (!existing) {
          return { type: "not_found" as const };
        }

        if (existing.revokedAt) {
          return {
            type: "already_revoked" as const,
            id: existing.id,
            revokedAt: existing.revokedAt,
          };
        }

        const revokedAt = new Date();

        const update = await tx.apiKey.updateMany({
          where: {
            id: keyId,
            organizationId: org.id,
            revokedAt: null,
          },
          data: {
            revokedAt,
          },
        });

        if (update.count !== 1) {
          const latest = await tx.apiKey.findFirst({
            where: {
              id: keyId,
              organizationId: org.id,
            },
            select: {
              id: true,
              revokedAt: true,
            },
          });

          if (!latest) {
            return { type: "not_found" as const };
          }

          if (latest.revokedAt) {
            return {
              type: "already_revoked" as const,
              id: latest.id,
              revokedAt: latest.revokedAt,
            };
          }

          return { type: "conflict" as const };
        }

        return {
          type: "success" as const,
          id: keyId,
          revokedAt,
        };
      },
    );

    if (result.type === "not_found") {
      return NextResponse.json(
        { message: "API key not found" },
        { status: 404 },
      );
    }

    if (result.type === "conflict") {
      return NextResponse.json(
        {
          message: "API key was modified by another request. Please retry.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message:
        result.type === "already_revoked"
          ? "API key is already revoked"
          : "API key revoked successfully",
      key: {
        id: result.id,
        revokedAt: result.revokedAt.toISOString(),
        status: "revoked",
      },
    });
  } catch (error) {
    console.error("Revoke API key error:", error);

    return NextResponse.json(
      { message: "Failed to revoke API key" },
      { status: 500 },
    );
  }
});

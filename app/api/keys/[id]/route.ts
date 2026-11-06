import { z } from "zod";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { requireOrgPermission } from "@/lib/permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// DELETE /api/keys/[id]
// Permanently delete an API key.
export const DELETE = auth(async function DELETE(req, context) {
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

    const deleted = await withTenantContext(
      session.user.id,
      org.id,
      async (tx) => {
        return tx.apiKey.deleteMany({
          where: {
            id: keyId,
            organizationId: org.id,
          },
        });
      },
    );

    if (deleted.count === 0) {
      return NextResponse.json(
        { message: "API key not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "API key deleted successfully",
      key: {
        id: keyId,
        status: "deleted",
      },
    });
  } catch (error) {
    console.error("Delete API key error:", error);

    return NextResponse.json(
      { message: "Failed to delete API key" },
      { status: 500 },
    );
  }
});

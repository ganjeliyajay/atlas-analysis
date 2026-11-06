import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrganization } from "@/lib/organization";

export const GET = auth(async function GET(req) {
  try {
    const session = req.auth;

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const org = await getCurrentOrganization();

    return NextResponse.json({
      organization: org,
    });
  } catch (error) {
    console.error("Current organization error:", error);

    return NextResponse.json(
      { message: "Unable to load organization" },
      { status: 500 }
    );
  }
});

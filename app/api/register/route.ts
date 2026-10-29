import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters"),
  workEmail: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          message: validation.error.issues[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }

    const { fullName, workEmail, password } = validation.data;

    const email = workEmail.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate a workspace name from the user's name.
    const organizationName = `${fullName}'s Workspace`;

    // Generate a URL-friendly organization slug.
    const baseSlug = fullName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const uniqueSlug = `${baseSlug || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;

    // Create user, organization, and owner membership atomically.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: fullName,
          email,
          password: hashedPassword,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: uniqueSlug,
          ownerId: user.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "owner",
        },
      });

      return { user, organization };
    });

    return NextResponse.json(
      {
        message: "Account and workspace created successfully",
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json(
      { message: "Something went wrong while creating your account" },
      { status: 500 },
    );
  }
}
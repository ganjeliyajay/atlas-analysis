
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { message: 'Unauthorized' },
                { status: 401 },
            );
        }

        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: session.user.id,
            },
            include: {
                organization: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        if (!membership) {
            return NextResponse.json(
                { organization: null },
                { status: 200 },
            );
        }

        return NextResponse.json({
            organization: {
                id: membership.organization.id,
                name: membership.organization.name,
                slug: membership.organization.slug,
                role: membership.role,
            },
        });
    } catch (error) {
        console.error('Current organization error:', error);

        return NextResponse.json(
            { message: 'Unable to load organization' },
            { status: 500 },
        );
    }
}

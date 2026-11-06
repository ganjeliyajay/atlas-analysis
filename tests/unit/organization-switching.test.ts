import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Mock next/navigation redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Mock db-context so withUserContext just calls the callback with the mock tx
vi.mock('@/lib/db-context', () => ({
  withUserContext: vi.fn(
    async (
      _userId: string,
      callback: (tx: MockTx) => Promise<unknown>
    ) => callback(mockTx)
  ),
}));

// Mock prisma (used by permissions, not directly by organization.ts)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organizationMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Define the shape of our mock transaction
interface MockOrg {
  id: string;
  name: string;
  slug: string;
}

interface MockMembership {
  role: string;
  organization: MockOrg;
}

interface MockTx {
  organizationMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
}

// Shared mock transaction object
const mockTx: MockTx = {
  organizationMember: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
};

import { getActiveOrganization } from '@/lib/organization';

describe('getActiveOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the preferred org when a valid org ID is passed and membership exists in DB', async () => {
    const preferredMembership: MockMembership = {
      role: 'admin',
      organization: {
        id: 'org-123',
        name: 'Acme Corp',
        slug: 'acme-corp',
      },
    };

    mockTx.organizationMember.findUnique.mockResolvedValue(preferredMembership);

    const result = await getActiveOrganization('user-1', 'org-123');

    expect(result).toEqual({
      id: 'org-123',
      name: 'Acme Corp',
      slug: 'acme-corp',
      role: 'admin',
    });
    // findUnique was tried for the preferred org
    expect(mockTx.organizationMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: 'user-1',
            organizationId: 'org-123',
          },
        },
      })
    );
  });

  it('falls back to the first org when preferred org membership is not found', async () => {
    // Preferred membership not found
    mockTx.organizationMember.findUnique.mockResolvedValue(null);

    const fallbackMembership: MockMembership = {
      role: 'owner',
      organization: {
        id: 'org-fallback',
        name: 'Default Org',
        slug: 'default-org',
      },
    };
    mockTx.organizationMember.findFirst.mockResolvedValue(fallbackMembership);

    const result = await getActiveOrganization('user-1', 'org-unauthorized');

    expect(result).toEqual({
      id: 'org-fallback',
      name: 'Default Org',
      slug: 'default-org',
      role: 'owner',
    });
  });

  it('returns null when the user has no memberships at all', async () => {
    // No preferred org passed, findFirst returns null
    mockTx.organizationMember.findFirst.mockResolvedValue(null);

    const result = await getActiveOrganization('user-no-orgs');

    expect(result).toBeNull();
  });

  it('the cookie value is used as a hint — DB membership determines access', async () => {
    // Simulate: cookie says org-A, but membership check for org-A fails
    mockTx.organizationMember.findUnique.mockResolvedValue(null);

    const fallbackMembership: MockMembership = {
      role: 'viewer',
      organization: {
        id: 'org-real',
        name: 'Real Org',
        slug: 'real-org',
      },
    };
    mockTx.organizationMember.findFirst.mockResolvedValue(fallbackMembership);

    // Even though cookie hints "org-cookie-hint", DB says no membership → falls back
    const result = await getActiveOrganization('user-1', 'org-cookie-hint');

    expect(result).toEqual({
      id: 'org-real',
      name: 'Real Org',
      slug: 'real-org',
      role: 'viewer',
    });
    // The DB was actually checked (not just trusting the cookie)
    expect(mockTx.organizationMember.findUnique).toHaveBeenCalled();
  });
});

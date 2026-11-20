-- Migration: Normalize legacy 'member' role to 'viewer'
UPDATE "OrganizationMember"
SET "role" = 'viewer'
WHERE "role" = 'member';

ALTER TABLE "OrganizationMember"
ALTER COLUMN "role" SET DEFAULT 'viewer';

-- In invitations, update any pending 'member' invitations to 'viewer'
UPDATE "invitations"
SET "role" = 'viewer'
WHERE "role" = 'member';

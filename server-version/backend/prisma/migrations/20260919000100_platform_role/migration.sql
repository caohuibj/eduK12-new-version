-- Organization / Reporting V2.1 PR1-C01
-- Additive platform authority. Legacy users.role remains intact for existing
-- product compatibility and must not be reused as Organization authority.

CREATE TYPE "PlatformRole" AS ENUM ('SYSTEM_ADMIN', 'STANDARD');

ALTER TABLE "users"
  ADD COLUMN "platform_role" "PlatformRole" NOT NULL DEFAULT 'STANDARD';

-- One-time compatibility promotion only. Future seed runs must never repeat
-- this mapping, so an explicit SYSTEM_ADMIN -> STANDARD demotion remains
-- authoritative.
UPDATE "users"
SET "platform_role" = 'SYSTEM_ADMIN'
WHERE "role" = 'ADMIN';

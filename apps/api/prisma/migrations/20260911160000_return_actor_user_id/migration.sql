-- (owner, 11 Sep 2026) Self-approval is judged on WHO, not on a display name.
-- Two staff members can share a name, and a renamed account stopped matching
-- its own returns. Nullable: rows written before today keep their name only,
-- and the name comparison stays as the fallback for exactly those.
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;

-- SectionText was created without `deletedAt`, and the soft-delete extension
-- adds `deletedAt: null` to every findMany — so the first read threw
-- "Unknown argument `deletedAt`" and the API refused to start.
--
-- A separate migration rather than an edit to the previous one, because that
-- one has already been applied here: changing an applied migration leaves the
-- database and the migration history disagreeing about what happened.
--
-- IF NOT EXISTS so it is harmless on a database created after the fix.
ALTER TABLE "SectionText" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

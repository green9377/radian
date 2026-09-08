-- Somebody can sign in with Google before they have ever ordered (owner,
-- 8 Sep 2026: "login kre dhuke pore order dite parbe, somossa nai"), and such
-- a person has no phone number yet. Postgres allows many NULLs under a unique
-- index, so the number stays the identity for everyone who has one.
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;

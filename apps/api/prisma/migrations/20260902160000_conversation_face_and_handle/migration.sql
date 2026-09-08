-- DEC-INB-009 — the face and the handle beside the name in the Inbox.
--
-- Both are a CACHE of what Meta returned, never the source of truth: the URLs
-- Meta hands out expire, so a null here is normal and the screen falls back to
-- the customer's initials.
--
-- WhatsApp fills neither. Cloud API does not expose a customer's profile photo
-- or handle to businesses — that is Meta's own restriction, not ours, and the
-- unofficial services that claim otherwise risk the number being banned.

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "guestAvatarUrl" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "guestHandle" TEXT;

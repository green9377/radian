-- DEC-INB-010 — the picture, the voice note, the file itself.
--
-- Meta hands out media URLs that need the access token and expire within
-- minutes, so they can never be given to a browser. The file is copied once
-- into our own media store and that copy is what staff open.
--
-- All four are nullable on purpose: a plain text message has none, and a
-- message whose media could not be copied still keeps its text. Losing the
-- message to save the picture would be the worse trade.

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaUrl"  TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaMime" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaKind" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaName" TEXT;

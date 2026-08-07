-- One live thread per (channel, externalIdentity).
--
-- Find-then-create let concurrent webhook deliveries create duplicate threads,
-- and a dedupe failure after thread creation left empty ones. Merge first,
-- then let the database forbid the duplicates outright.

-- 1. For every (channel, externalIdentity) keep the OLDEST live thread.
CREATE TEMP TABLE _keep AS
SELECT DISTINCT ON (channel, "externalIdentity")
       id, channel, "externalIdentity"
FROM "Conversation"
WHERE "externalIdentity" IS NOT NULL AND "deletedAt" IS NULL
ORDER BY channel, "externalIdentity", "createdAt" ASC;

-- 2. Move every message from the duplicates onto the keeper.
UPDATE "Message" m
SET "conversationId" = k.id
FROM "Conversation" c
JOIN _keep k
  ON k.channel = c.channel AND k."externalIdentity" = c."externalIdentity"
WHERE m."conversationId" = c.id
  AND c."deletedAt" IS NULL
  AND c.id <> k.id;

-- 3. The keeper inherits a name if only a duplicate had one.
UPDATE "Conversation" k
SET "guestName" = d."guestName"
FROM "Conversation" d
WHERE k.id IN (SELECT id FROM _keep)
  AND k."guestName" IS NULL
  AND d."guestName" IS NOT NULL
  AND d.channel = k.channel
  AND d."externalIdentity" = k."externalIdentity"
  AND d.id <> k.id;

-- 4. Soft delete the now-empty duplicates (project rule: never hard DELETE).
UPDATE "Conversation" c
SET "deletedAt" = NOW()
FROM _keep k
WHERE c.channel = k.channel
  AND c."externalIdentity" = k."externalIdentity"
  AND c."deletedAt" IS NULL
  AND c.id <> k.id;

-- 5. The keeper's lastMessageAt reflects the merged history.
UPDATE "Conversation" c
SET "lastMessageAt" = m.latest
FROM (
  SELECT "conversationId", MAX("createdAt") AS latest
  FROM "Message"
  GROUP BY "conversationId"
) m
WHERE m."conversationId" = c.id
  AND c.id IN (SELECT id FROM _keep);

DROP TABLE _keep;

-- 6. From now on the database refuses a second live thread. Partial index:
--    soft-deleted rows and WEB_CHAT (null identity) stay out of its way.
CREATE UNIQUE INDEX "Conversation_channel_externalIdentity_live_key"
ON "Conversation" (channel, "externalIdentity")
WHERE "externalIdentity" IS NOT NULL AND "deletedAt" IS NULL;

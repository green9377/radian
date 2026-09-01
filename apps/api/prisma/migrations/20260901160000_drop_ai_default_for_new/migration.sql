-- DEC-INB-011 (owner, 1 Sep 2026) — one AI switch, and it is the global one.
--
-- `aiDefaultForNew` seeded `Conversation.aiEnabled` on a new thread. The
-- per-thread toggle was withdrawn, so nothing reads that column any more:
-- this setting could only ever write a value no code would look at, while
-- still sitting on the settings screen looking like it did something.
--
-- `Conversation.aiEnabled` itself stays — nothing is destroyed, and it is the
-- record of what a thread was once set to.
ALTER TABLE "InboxSetting" DROP COLUMN IF EXISTS "aiDefaultForNew";

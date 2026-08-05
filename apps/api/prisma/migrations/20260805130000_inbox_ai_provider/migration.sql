-- Inbox Phase 2 — provider seam (মালিকের রায় ৫ আগস্ট: দুটোর জন্য বানানো, আপাতত Anthropic)
-- Key কখনো DB-তে নয় — env-এ। এখানে শুধু কোন provider/model চলবে সেই পছন্দ।

ALTER TABLE "InboxSetting" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'ANTHROPIC';
ALTER TABLE "InboxSetting" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001';

-- Click-to-WhatsApp attribution on a conversation.
-- Without the click id, "which ad produced this order" cannot be answered.
-- Only adds nullable columns; no existing row is touched.

ALTER TABLE "Conversation"
  ADD COLUMN "ctwaClid"           TEXT,
  ADD COLUMN "adReferralSourceId" TEXT,
  ADD COLUMN "adReferralHeadline" TEXT;

CREATE INDEX "Conversation_ctwaClid_idx" ON "Conversation"("ctwaClid");

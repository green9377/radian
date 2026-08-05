-- Inbox Phase 1 — RADIAN_INBOX_MODULE_ARCHITECTURE.md (DEC-INB-001…006)
-- সব channel-এর কথোপকথন এক inbox-এ। Phase 1 = WEB_CHAT; বাকিরা একই টেবিলে নামবে।

CREATE TYPE "InboxChannel" AS ENUM ('WEB_CHAT', 'MESSENGER', 'INSTAGRAM', 'WHATSAPP', 'SMS');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING_CUSTOMER', 'RESOLVED');
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "MessageAuthor" AS ENUM ('CUSTOMER', 'AI', 'STAFF', 'SYSTEM');
CREATE TYPE "EscalationReason" AS ENUM ('MONEY_TOPIC', 'LOW_CONFIDENCE', 'CUSTOMER_ASKED_HUMAN', 'ANGRY_CUSTOMER', 'OFF_SCRIPT', 'MANUAL');

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" "InboxChannel" NOT NULL DEFAULT 'WEB_CHAT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "customerId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "clientKey" TEXT NOT NULL,
    "externalIdentity" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assigneeId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escalatedAt" TIMESTAMP(3),
    "unreadForStaff" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_clientKey_key" ON "Conversation"("clientKey");
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt");
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");
CREATE INDEX "Conversation_guestPhone_idx" ON "Conversation"("guestPhone");
CREATE INDEX "Conversation_channel_externalIdentity_idx" ON "Conversation"("channel", "externalIdentity");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "authorType" "MessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "aiMeta" JSONB,
    "readByStaffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Message_externalMessageId_key" ON "Message"("externalMessageId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only (AuditLog-এর মতো) — deletedAt নেই, ইচ্ছাকৃত।
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reason" "EscalationReason" NOT NULL,
    "notifiedUserIds" JSONB NOT NULL DEFAULT '[]',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EscalationEvent_conversationId_idx" ON "EscalationEvent"("conversationId");
CREATE INDEX "EscalationEvent_createdAt_idx" ON "EscalationEvent"("createdAt");

ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Singleton — deletedAt নেই (IntelligenceSetting-এর ধাঁচ)।
CREATE TABLE "InboxSetting" (
    "id" TEXT NOT NULL,
    "aiGloballyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiDefaultForNew" BOOLEAN NOT NULL DEFAULT true,
    "escalationAssigneeIds" JSONB NOT NULL DEFAULT '[]',
    "supportOpenMin" INTEGER NOT NULL DEFAULT 540,
    "supportCloseMin" INTEGER NOT NULL DEFAULT 1320,
    "offHoursMessage" TEXT NOT NULL DEFAULT 'We are closed right now — we will reply in the morning, usually by 9 AM.',
    "reopenWindowDays" INTEGER NOT NULL DEFAULT 30,
    "webChatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxSetting_pkey" PRIMARY KEY ("id")
);

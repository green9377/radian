-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "MessagingSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailProvider" TEXT NOT NULL DEFAULT 'BREVO',
    "emailApiKey" TEXT,
    "emailFromName" TEXT DEFAULT 'Radian',
    "emailFromAddress" TEXT,
    "emailReplyTo" TEXT,
    "emailDomain" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'BULKSMSBD',
    "smsApiKey" TEXT,
    "smsSenderId" TEXT,
    "smsCustomUrl" TEXT,
    "testEmail" TEXT,
    "testPhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "providerRef" TEXT,
    "error" TEXT,
    "provider" TEXT,
    "outreachId" TEXT,
    "customerId" TEXT,
    "broadcastId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLog_channel_createdAt_idx" ON "MessageLog"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_customerId_idx" ON "MessageLog"("customerId");

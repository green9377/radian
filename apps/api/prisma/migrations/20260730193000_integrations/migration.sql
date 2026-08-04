-- Integrations, grouped by what they do (ADM-D09)
--
-- One new table, one new enum. Nothing is dropped, nothing is copied.
--
-- WHY GROUPED: the owner's instruction, 30 July — payment gateways in one
-- place, couriers in another. A single flat list of keys makes "this one moves
-- money" and "this one moves a parcel" look identical, and they are nowhere
-- near the same risk.
--
-- WHY ONLY TWO KINDS: WhatsApp/email/SMS keys are in MessagingSetting and the
-- pixels are in TrackingSetting, both owned by Marketing. Copying them here
-- would put the same key in two places with nobody able to say which one the
-- code reads. The screen shows the DOOR to those, not a copy.

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('PAYMENT', 'COURIER');

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "username" TEXT,
    "password" TEXT,
    "apiKey" TEXT,
    "baseUrl" TEXT,
    "webhookSecret" TEXT,
    "courierId" TEXT,
    "note" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheckNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_kind_idx" ON "Integration"("kind");

-- CreateIndex
-- One row per service. Two rows for SSLCommerz would bring back the question
-- this table exists to answer: which of these is the real one?
CREATE UNIQUE INDEX "Integration_kind_provider_key" ON "Integration"("kind", "provider");

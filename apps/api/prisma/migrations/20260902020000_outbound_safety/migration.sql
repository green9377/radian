-- Outbound safety (owner's locked decisions, 2 Sep 2026).
--
-- Three tables and five columns. Nothing here changes existing rows: every
-- added column is nullable or carries a default, so an API that has not been
-- rebuilt keeps working while this lands.

-- ── enums ────────────────────────────────────────────────────────────────
CREATE TYPE "OutboundLimitScope"   AS ENUM ('GLOBAL', 'CHANNEL', 'ORIGIN');
CREATE TYPE "OutboundLimitMetric"  AS ENUM ('TOTAL', 'DISTINCT', 'REPEAT');
CREATE TYPE "OutboundBreachAction" AS ENUM ('WARN', 'BLOCK', 'TRIP');
CREATE TYPE "OutboundBatchStatus"  AS ENUM ('DRAFT', 'CONFIRMED', 'RUNNING', 'DONE', 'STOPPED', 'OVERFLOW');

-- ── the configurable limits ──────────────────────────────────────────────
CREATE TABLE "OutboundLimit" (
    "id"            TEXT NOT NULL,
    "scope"         "OutboundLimitScope" NOT NULL,
    "key"           TEXT NOT NULL DEFAULT '',
    "metric"        "OutboundLimitMetric" NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "value"         INTEGER NOT NULL,
    "onBreach"      "OutboundBreachAction" NOT NULL DEFAULT 'TRIP',
    "updatedById"   TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"     TIMESTAMP(3),
    CONSTRAINT "OutboundLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboundLimit_scope_key_metric_key" ON "OutboundLimit"("scope", "key", "metric");

-- ── the two switches ─────────────────────────────────────────────────────
CREATE TABLE "OutboundSetting" (
    "id"                      TEXT NOT NULL DEFAULT 'singleton',
    "manualKill"              BOOLEAN NOT NULL DEFAULT false,
    "manualKillById"          TEXT,
    "manualKillAt"            TIMESTAMP(3),
    "manualKillReason"        TEXT,
    "manualKillClearedById"   TEXT,
    "manualKillClearedAt"     TIMESTAMP(3),
    "manualKillClearedReason" TEXT,
    "breakerTrippedAt"        TIMESTAMP(3),
    "breakerTrippedReason"    TEXT,
    "breakerTrippedMetric"    TEXT,
    "breakerResetById"        TEXT,
    "breakerResetAt"          TIMESTAMP(3),
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutboundSetting_pkey" PRIMARY KEY ("id")
);

-- ── declared batches ─────────────────────────────────────────────────────
CREATE TABLE "OutboundBatch" (
    "id"            TEXT NOT NULL,
    "channel"       TEXT NOT NULL,
    "origin"        TEXT NOT NULL,
    "declaredCount" INTEGER NOT NULL,
    "actualCount"   INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt"   TIMESTAMP(3),
    "status"        "OutboundBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "sampleJson"    JSONB,
    "note"          TEXT,
    "startedAt"     TIMESTAMP(3),
    "finishedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboundBatch_status_createdAt_idx" ON "OutboundBatch"("status", "createdAt");

-- ── escalation: who was told, when, and how it went ──────────────────────
ALTER TABLE "EscalationEvent"
  ADD COLUMN "employeeNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "employeeNotifiedTo" TEXT,
  ADD COLUMN "ownerNotifiedAt"    TIMESTAMP(3),
  ADD COLUMN "notifiedMap"        JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "notifyAttempts"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastNotifyError"    TEXT;

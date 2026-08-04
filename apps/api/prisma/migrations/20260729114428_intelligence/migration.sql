-- CreateEnum
CREATE TYPE "KpiName" AS ENUM ('MONTHLY_SALES', 'GROSS_MARGIN', 'ON_TIME_DELIVERY');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "promisedBy" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DailySnapshot" (
    "id" TEXT NOT NULL,
    "onDate" TIMESTAMP(3) NOT NULL,
    "revenuePaisa" INTEGER NOT NULL DEFAULT 0,
    "cogsPaisa" INTEGER NOT NULL DEFAULT 0,
    "grossProfitPaisa" INTEGER NOT NULL DEFAULT 0,
    "grossMarginBp" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "avgOrderValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "onTimeCount" INTEGER NOT NULL DEFAULT 0,
    "measurableDeliveries" INTEGER NOT NULL DEFAULT 0,
    "inventoryValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "cashBalancePaisa" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTarget" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kpi" "KpiName" NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "amberAtBp" INTEGER NOT NULL DEFAULT 9000,
    "redBelowBp" INTEGER NOT NULL DEFAULT 7500,
    "forecastMinDays" INTEGER NOT NULL DEFAULT 365,
    "snapshotBackfillDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelligenceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySnapshot_onDate_key" ON "DailySnapshot"("onDate");

-- CreateIndex
CREATE INDEX "DailySnapshot_onDate_idx" ON "DailySnapshot"("onDate");

-- CreateIndex
CREATE INDEX "KpiTarget_year_month_idx" ON "KpiTarget"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTarget_year_month_kpi_key" ON "KpiTarget"("year", "month", "kpi");

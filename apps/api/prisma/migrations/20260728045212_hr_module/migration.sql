-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'HALF_DAY', 'LEAVE', 'ABSENT');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "altPhone" TEXT,
    "nid" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" TEXT,
    "photoUrl" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "designation" TEXT,
    "joinedOn" TIMESTAMP(3) NOT NULL,
    "leftOn" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "payType" "PayType" NOT NULL DEFAULT 'MONTHLY',
    "ratePaisa" INTEGER NOT NULL DEFAULT 0,
    "appUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "onDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "isPaidLeave" BOOLEAN NOT NULL DEFAULT true,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "markedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "payrollNo" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "grossPaisa" INTEGER NOT NULL DEFAULT 0,
    "extraPaisa" INTEGER NOT NULL DEFAULT 0,
    "deductionPaisa" INTEGER NOT NULL DEFAULT 0,
    "advanceRecoveredPaisa" INTEGER NOT NULL DEFAULT 0,
    "netPaisa" INTEGER NOT NULL DEFAULT 0,
    "paidFromId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "journalEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payType" "PayType" NOT NULL,
    "ratePaisa" INTEGER NOT NULL,
    "daysWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minutesWorked" INTEGER NOT NULL DEFAULT 0,
    "basePaisa" INTEGER NOT NULL DEFAULT 0,
    "extraPaisa" INTEGER NOT NULL DEFAULT 0,
    "extraNote" TEXT,
    "deductionPaisa" INTEGER NOT NULL DEFAULT 0,
    "deductionNote" TEXT,
    "advanceRecoveredPaisa" INTEGER NOT NULL DEFAULT 0,
    "netPaisa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_appUserId_key" ON "Employee"("appUserId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "Employee_payType_idx" ON "Employee"("payType");

-- CreateIndex
CREATE INDEX "Attendance_onDate_idx" ON "Attendance"("onDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_onDate_key" ON "Attendance"("employeeId", "onDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_payrollNo_key" ON "Payroll"("payrollNo");

-- CreateIndex
CREATE INDEX "Payroll_period_idx" ON "Payroll"("period");

-- CreateIndex
CREATE INDEX "Payroll_status_idx" ON "Payroll"("status");

-- CreateIndex
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_payrollId_employeeId_key" ON "PayrollLine"("payrollId", "employeeId");

-- CreateIndex
CREATE INDEX "JournalLine_employeeId_idx" ON "JournalLine"("employeeId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

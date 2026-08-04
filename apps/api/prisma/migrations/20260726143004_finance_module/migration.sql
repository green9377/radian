-- CreateEnum
CREATE TYPE "FinAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "CostBehavior" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "FinSourceType" AS ENUM ('ORDER', 'PAYMENT', 'RETURN', 'POS_SHIFT', 'INVENTORY', 'PURCHASE', 'SUPPLIER_PAYMENT', 'DELIVERY', 'REMITTANCE', 'EXPENSE', 'INCOME', 'TRANSFER', 'PARTNER', 'ASSET', 'PREPAID', 'LOAN', 'RECONCILE', 'PROFIT_DIST', 'VAT', 'OPENING', 'MANUAL');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('CAPITAL', 'LABOUR', 'BOTH');

-- CreateEnum
CREATE TYPE "PartnerTxnKind" AS ENUM ('CAPITAL_IN', 'CAPITAL_RETURN', 'DRAWING', 'SALARY', 'PROFIT_SHARE', 'BONUS');

-- CreateEnum
CREATE TYPE "FinApprovalState" AS ENUM ('AUTO', 'PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PostingState" AS ENUM ('FAILED', 'REPLAYED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CarrierType" AS ENUM ('RIDER', 'COURIER');

-- CreateEnum
CREATE TYPE "LoanKind" AS ENUM ('BANK', 'FAMILY', 'OTHER');

-- AlterTable
ALTER TABLE "DeliveryAssignment" ADD COLUMN     "codHandedOver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "costPaisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "financePostedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerBin" TEXT,
ADD COLUMN     "financePostedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "financePostedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockIssue" ADD COLUMN     "financePostedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "financePostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinAccountType" NOT NULL,
    "isMoneyAccount" BOOLEAN NOT NULL DEFAULT false,
    "payMethod" TEXT,
    "costBehavior" "CostBehavior",
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openingBalancePaisa" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNo" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "sourceType" "FinSourceType" NOT NULL,
    "sourceId" TEXT,
    "sourceKey" TEXT,
    "narration" TEXT NOT NULL,
    "branchId" TEXT,
    "carrierId" TEXT,
    "reversesId" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitPaisa" INTEGER NOT NULL DEFAULT 0,
    "creditPaisa" INTEGER NOT NULL DEFAULT 0,
    "partnerId" TEXT,
    "orderId" TEXT,
    "itemId" TEXT,
    "occasion" TEXT,
    "zone" TEXT,
    "channelId" TEXT,
    "note" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "expenseNo" TEXT NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "paidFromId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "payeeName" TEXT,
    "note" TEXT,
    "attachmentUrl" TEXT,
    "approval" "FinApprovalState" NOT NULL DEFAULT 'AUTO',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "branchId" TEXT,
    "partnerId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "incomeNo" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "receivedInId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "payerName" TEXT,
    "note" TEXT,
    "journalEntryId" TEXT,
    "branchId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "feePaisa" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "journalEntryId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "sharePercentBp" INTEGER NOT NULL DEFAULT 0,
    "monthlySalaryPaisa" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT,
    "note" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTransaction" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerTxnKind" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromAccountId" TEXT,
    "journalEntryId" TEXT,
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "assetNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "costPaisa" INTEGER NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 48,
    "salvagePaisa" INTEGER NOT NULL DEFAULT 0,
    "paidFromId" TEXT,
    "lastDepreciatedOn" TIMESTAMP(3),
    "accumDepPaisa" INTEGER NOT NULL DEFAULT 0,
    "disposedAt" TIMESTAMP(3),
    "disposalValuePaisa" INTEGER,
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepaidItem" (
    "id" TEXT NOT NULL,
    "prepaidNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalPaisa" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 0,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "expenseAccountId" TEXT,
    "amortizedPaisa" INTEGER NOT NULL DEFAULT 0,
    "lastAmortizedOn" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrepaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "kind" "LoanKind" NOT NULL DEFAULT 'FAMILY',
    "principalPaisa" INTEGER NOT NULL,
    "interestRateBp" INTEGER NOT NULL DEFAULT 0,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "termMonths" INTEGER,
    "intoAccountId" TEXT,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "principalPaisa" INTEGER NOT NULL DEFAULT 0,
    "interestPaisa" INTEGER NOT NULL DEFAULT 0,
    "fromAccountId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierRemittance" (
    "id" TEXT NOT NULL,
    "remittanceNo" TEXT NOT NULL,
    "carrierType" "CarrierType" NOT NULL,
    "carrierId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grossPaisa" INTEGER NOT NULL,
    "chargePaisa" INTEGER NOT NULL DEFAULT 0,
    "netPaisa" INTEGER NOT NULL,
    "intoAccountId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CarrierRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReconciliation" (
    "id" TEXT NOT NULL,
    "reconNo" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "systemBalancePaisa" INTEGER NOT NULL,
    "countedBalancePaisa" INTEGER NOT NULL,
    "differencePaisa" INTEGER NOT NULL,
    "journalEntryId" TEXT,
    "note" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePostingFailure" (
    "id" TEXT NOT NULL,
    "sourceType" "FinSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "state" "PostingState" NOT NULL DEFAULT 'FAILED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePostingFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "goLiveDate" TIMESTAMP(3),
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 7,
    "defaultCashAccountId" TEXT,
    "expenseApprovalThresholdPaisa" INTEGER NOT NULL DEFAULT 5000000,
    "paymentApprovalThresholdPaisa" INTEGER NOT NULL DEFAULT 5000000,
    "refundApprovalThresholdPaisa" INTEGER NOT NULL DEFAULT 1000000,
    "wastageApprovalThresholdPaisa" INTEGER NOT NULL DEFAULT 500000,
    "labourBonusPercentBp" INTEGER NOT NULL DEFAULT 0,
    "assetThresholdPaisa" INTEGER NOT NULL DEFAULT 1000000,
    "revenueRecognition" TEXT NOT NULL DEFAULT 'DELIVERED',
    "autoPostEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastClosedDate" TIMESTAMP(3),
    "openingPostedAt" TIMESTAMP(3),
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatRateBps" INTEGER NOT NULL DEFAULT 1500,
    "vatInclusivePricing" BOOLEAN NOT NULL DEFAULT false,
    "businessBin" TEXT,
    "riderCashLimitPaisa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_code_key" ON "FinanceAccount"("code");

-- CreateIndex
CREATE INDEX "FinanceAccount_type_idx" ON "FinanceAccount"("type");

-- CreateIndex
CREATE INDEX "FinanceAccount_isMoneyAccount_idx" ON "FinanceAccount"("isMoneyAccount");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNo_key" ON "JournalEntry"("entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sourceKey_key" ON "JournalEntry"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesId_key" ON "JournalEntry"("reversesId");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_carrierId_idx" ON "JournalEntry"("carrierId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_partnerId_idx" ON "JournalLine"("partnerId");

-- CreateIndex
CREATE INDEX "JournalLine_orderId_idx" ON "JournalLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_expenseNo_key" ON "Expense"("expenseNo");

-- CreateIndex
CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt");

-- CreateIndex
CREATE INDEX "Expense_accountId_idx" ON "Expense"("accountId");

-- CreateIndex
CREATE INDEX "Expense_approval_idx" ON "Expense"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "Income_incomeNo_key" ON "Income"("incomeNo");

-- CreateIndex
CREATE INDEX "Income_earnedAt_idx" ON "Income"("earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_transferNo_key" ON "Transfer"("transferNo");

-- CreateIndex
CREATE INDEX "Transfer_movedAt_idx" ON "Transfer"("movedAt");

-- CreateIndex
CREATE INDEX "PartnerTransaction_partnerId_idx" ON "PartnerTransaction"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerTransaction_kind_idx" ON "PartnerTransaction"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_assetNo_key" ON "FixedAsset"("assetNo");

-- CreateIndex
CREATE UNIQUE INDEX "PrepaidItem_prepaidNo_key" ON "PrepaidItem"("prepaidNo");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanNo_key" ON "Loan"("loanNo");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_idx" ON "LoanPayment"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierRemittance_remittanceNo_key" ON "CarrierRemittance"("remittanceNo");

-- CreateIndex
CREATE INDEX "CarrierRemittance_carrierType_carrierId_idx" ON "CarrierRemittance"("carrierType", "carrierId");

-- CreateIndex
CREATE INDEX "CarrierRemittance_receivedAt_idx" ON "CarrierRemittance"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountReconciliation_reconNo_key" ON "AccountReconciliation"("reconNo");

-- CreateIndex
CREATE INDEX "AccountReconciliation_accountId_idx" ON "AccountReconciliation"("accountId");

-- CreateIndex
CREATE INDEX "AccountReconciliation_asOfDate_idx" ON "AccountReconciliation"("asOfDate");

-- CreateIndex
CREATE INDEX "FinancePostingFailure_state_idx" ON "FinancePostingFailure"("state");

-- CreateIndex
CREATE INDEX "FinancePostingFailure_sourceType_sourceId_idx" ON "FinancePostingFailure"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidFromId_fkey" FOREIGN KEY ("paidFromId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_receivedInId_fkey" FOREIGN KEY ("receivedInId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTransaction" ADD CONSTRAINT "PartnerTransaction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_paidFromId_fkey" FOREIGN KEY ("paidFromId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepaidItem" ADD CONSTRAINT "PrepaidItem_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierRemittance" ADD CONSTRAINT "CarrierRemittance_intoAccountId_fkey" FOREIGN KEY ("intoAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

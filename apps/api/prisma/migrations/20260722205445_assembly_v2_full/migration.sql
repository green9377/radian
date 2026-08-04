-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ORDERED', 'ADVANCE_PAID', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'TRANSFER', 'WASTAGE', 'ADJUSTMENT', 'GIFT', 'ASSEMBLY', 'UNBUILD');

-- CreateEnum
CREATE TYPE "IssueKind" AS ENUM ('WASTAGE', 'GIFT');

-- CreateEnum
CREATE TYPE "NegativeStockPolicy" AS ENUM ('ALLOW_WARN', 'BLOCK');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'TRANSFERRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "familyKey" TEXT,
ADD COLUMN     "itemTypeId" TEXT,
ADD COLUMN     "maxDiscountBp" INTEGER,
ADD COLUMN     "minMarginBp" INTEGER,
ADD COLUMN     "minMarginPaisa" INTEGER,
ADD COLUMN     "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRateBp" INTEGER;

-- CreateTable
CREATE TABLE "ItemTypeMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "behaviour" "ItemType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "colour" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ItemTypeMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "purchaseNo" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RECEIVED',
    "supplierName" TEXT NOT NULL,
    "supplierPhone" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "supplierReceiptNo" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "subTotalPaisa" INTEGER NOT NULL DEFAULT 0,
    "discountPaisa" INTEGER NOT NULL DEFAULT 0,
    "adjustmentPaisa" INTEGER NOT NULL DEFAULT 0,
    "grandTotalPaisa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "factorSnapshot" INTEGER NOT NULL DEFAULT 1,
    "qtyMilli" INTEGER NOT NULL,
    "receivedQtyMilli" INTEGER NOT NULL DEFAULT 0,
    "unitPricePaisa" INTEGER NOT NULL,
    "lineTotalPaisa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "method" "PayMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "totalPaisa" INTEGER NOT NULL DEFAULT 0,
    "dueCutPaisa" INTEGER NOT NULL DEFAULT 0,
    "creditPaisa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "valuePaisa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCredit" (
    "id" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "sourceReturnId" TEXT,
    "appliedPurchaseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStock" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "reason" "MovementReason" NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "unitCostPaisa" INTEGER NOT NULL DEFAULT 0,
    "valuePaisa" INTEGER NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    "groupId" TEXT,
    "reversesId" TEXT,
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssue" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "kind" "IssueKind" NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "totalValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueLine" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "unitCostPaisa" INTEGER NOT NULL DEFAULT 0,
    "valuePaisa" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockIssueLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "stocktakeNo" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ledgerQtyMilli" INTEGER NOT NULL,
    "countedQtyMilli" INTEGER NOT NULL,
    "diffValuePaisa" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemExpiryLot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "qtyMilli" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemExpiryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultSaleWarehouseId" TEXT,
    "defaultReceiveWarehouseId" TEXT,
    "allowPerOrderWarehouse" BOOLEAN NOT NULL DEFAULT false,
    "negativeStockPolicy" "NegativeStockPolicy" NOT NULL DEFAULT 'ALLOW_WARN',
    "defaultAssemblyComponentWarehouseId" TEXT,
    "defaultAssemblyFinishedWarehouseId" TEXT,
    "assemblyFloorWarehouseId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssemblyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyTemplateLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssemblyTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyProduction" (
    "id" TEXT NOT NULL,
    "productionNo" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "finishedQtyMilli" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "assignedTo" TEXT,
    "actor" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMin" INTEGER,
    "sourceWarehouseId" TEXT NOT NULL,
    "floorWarehouseId" TEXT NOT NULL,
    "totalUsedValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "totalWastedValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaisa" INTEGER NOT NULL DEFAULT 0,
    "issueId" TEXT,
    "targetItemId" TEXT,
    "transferWarehouseId" TEXT,
    "transferredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AssemblyProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyProductionLine" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "plannedQtyMilli" INTEGER NOT NULL,
    "pickedQtyMilli" INTEGER NOT NULL,
    "usedQtyMilli" INTEGER NOT NULL DEFAULT 0,
    "wastedQtyMilli" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaisa" INTEGER NOT NULL DEFAULT 0,
    "usedValuePaisa" INTEGER NOT NULL DEFAULT 0,
    "wastedValuePaisa" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssemblyProductionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemTypeMaster_name_key" ON "ItemTypeMaster"("name");

-- CreateIndex
CREATE INDEX "ItemTypeMaster_behaviour_idx" ON "ItemTypeMaster"("behaviour");

-- CreateIndex
CREATE INDEX "ItemTypeMaster_isActive_idx" ON "ItemTypeMaster"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNo_key" ON "Purchase"("purchaseNo");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_supplierName_idx" ON "Purchase"("supplierName");

-- CreateIndex
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "PurchaseLine"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseLine_itemId_idx" ON "PurchaseLine"("itemId");

-- CreateIndex
CREATE INDEX "PurchasePayment_purchaseId_idx" ON "PurchasePayment"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_returnNo_key" ON "PurchaseReturn"("returnNo");

-- CreateIndex
CREATE INDEX "PurchaseReturn_purchaseId_idx" ON "PurchaseReturn"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseReturnLine_returnId_idx" ON "PurchaseReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "SupplierCredit_supplierName_idx" ON "SupplierCredit"("supplierName");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "InventoryStock_warehouseId_idx" ON "InventoryStock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStock_itemId_warehouseId_key" ON "InventoryStock"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_reversesId_key" ON "InventoryMovement"("reversesId");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_warehouseId_idx" ON "InventoryMovement"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryMovement_reason_idx" ON "InventoryMovement"("reason");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_refType_refId_idx" ON "InventoryMovement"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_transferNo_key" ON "StockTransfer"("transferNo");

-- CreateIndex
CREATE INDEX "StockTransferLine_transferId_idx" ON "StockTransferLine"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "StockIssue_issueNo_key" ON "StockIssue"("issueNo");

-- CreateIndex
CREATE INDEX "StockIssueLine_issueId_idx" ON "StockIssueLine"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_stocktakeNo_key" ON "Stocktake"("stocktakeNo");

-- CreateIndex
CREATE INDEX "StocktakeLine_stocktakeId_idx" ON "StocktakeLine"("stocktakeId");

-- CreateIndex
CREATE INDEX "ItemExpiryLot_itemId_warehouseId_idx" ON "ItemExpiryLot"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "ItemExpiryLot_expiryDate_idx" ON "ItemExpiryLot"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyTemplate_name_key" ON "AssemblyTemplate"("name");

-- CreateIndex
CREATE INDEX "AssemblyTemplateLine_templateId_idx" ON "AssemblyTemplateLine"("templateId");

-- CreateIndex
CREATE INDEX "AssemblyTemplateLine_componentItemId_idx" ON "AssemblyTemplateLine"("componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyProduction_productionNo_key" ON "AssemblyProduction"("productionNo");

-- CreateIndex
CREATE INDEX "AssemblyProduction_status_idx" ON "AssemblyProduction"("status");

-- CreateIndex
CREATE INDEX "AssemblyProduction_templateId_idx" ON "AssemblyProduction"("templateId");

-- CreateIndex
CREATE INDEX "AssemblyProduction_startedAt_idx" ON "AssemblyProduction"("startedAt");

-- CreateIndex
CREATE INDEX "AssemblyProductionLine_productionId_idx" ON "AssemblyProductionLine"("productionId");

-- CreateIndex
CREATE INDEX "AssemblyProductionLine_componentItemId_idx" ON "AssemblyProductionLine"("componentItemId");

-- CreateIndex
CREATE INDEX "Item_itemTypeId_idx" ON "Item"("itemTypeId");

-- CreateIndex
CREATE INDEX "Item_familyKey_idx" ON "Item"("familyKey");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemTypeMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PurchaseReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnLine" ADD CONSTRAINT "PurchaseReturnLine_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "StockIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemExpiryLot" ADD CONSTRAINT "ItemExpiryLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyTemplateLine" ADD CONSTRAINT "AssemblyTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssemblyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyTemplateLine" ADD CONSTRAINT "AssemblyTemplateLine_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyProduction" ADD CONSTRAINT "AssemblyProduction_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssemblyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyProduction" ADD CONSTRAINT "AssemblyProduction_targetItemId_fkey" FOREIGN KEY ("targetItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyProductionLine" ADD CONSTRAINT "AssemblyProductionLine_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "AssemblyProduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyProductionLine" ADD CONSTRAINT "AssemblyProductionLine_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

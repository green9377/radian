-- CreateEnum
CREATE TYPE "AddOnRuleField" AS ENUM ('CATEGORY', 'OCCASION', 'ZONE', 'PRODUCT_TYPE');

-- CreateEnum
CREATE TYPE "AddedFrom" AS ENUM ('PRODUCT', 'CART', 'CHECKOUT');

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "addedFrom" "AddedFrom" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "upgradeOfProductId" TEXT,
ADD COLUMN     "upgradeSortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "imageUrl" TEXT,
    "pricePaisa" INTEGER NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "stockQty" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AddOnGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnGroupItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AddOnGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnRule" (
    "id" TEXT NOT NULL,
    "field" "AddOnRuleField" NOT NULL,
    "values" TEXT[],
    "groupId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AddOnRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttribute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VariantAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantValue" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "swatch" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VariantValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddOn_sku_key" ON "AddOn"("sku");

-- CreateIndex
CREATE INDEX "AddOnGroupItem_addOnId_idx" ON "AddOnGroupItem"("addOnId");

-- CreateIndex
CREATE UNIQUE INDEX "AddOnGroupItem_groupId_addOnId_key" ON "AddOnGroupItem"("groupId", "addOnId");

-- CreateIndex
CREATE INDEX "AddOnRule_groupId_idx" ON "AddOnRule"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_name_key" ON "VariantAttribute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VariantValue_attributeId_label_key" ON "VariantValue"("attributeId", "label");

-- CreateIndex
CREATE INDEX "Product_upgradeOfProductId_idx" ON "Product"("upgradeOfProductId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_upgradeOfProductId_fkey" FOREIGN KEY ("upgradeOfProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnGroupItem" ADD CONSTRAINT "AddOnGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AddOnGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnGroupItem" ADD CONSTRAINT "AddOnGroupItem_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnRule" ADD CONSTRAINT "AddOnRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AddOnGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantValue" ADD CONSTRAINT "VariantValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `itemGroupId` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the `ItemGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_itemGroupId_fkey";

-- DropForeignKey
ALTER TABLE "ItemGroup" DROP CONSTRAINT "ItemGroup_parentId_fkey";

-- DropIndex
DROP INDEX "Item_itemGroupId_idx";

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "itemGroupId",
ADD COLUMN     "itemCategoryId" TEXT;

-- DropTable
DROP TABLE "ItemGroup";

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAttribute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ItemAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAttributeValue" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "swatch" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ItemAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ItemAttributeValues" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ItemAttributeValues_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ItemCategory_parentId_idx" ON "ItemCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAttribute_name_key" ON "ItemAttribute"("name");

-- CreateIndex
CREATE INDEX "ItemAttributeValue_attributeId_idx" ON "ItemAttributeValue"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAttributeValue_attributeId_label_key" ON "ItemAttributeValue"("attributeId", "label");

-- CreateIndex
CREATE INDEX "_ItemAttributeValues_B_index" ON "_ItemAttributeValues"("B");

-- CreateIndex
CREATE INDEX "Item_itemCategoryId_idx" ON "Item"("itemCategoryId");

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttributeValue" ADD CONSTRAINT "ItemAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ItemAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_itemCategoryId_fkey" FOREIGN KEY ("itemCategoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemAttributeValues" ADD CONSTRAINT "_ItemAttributeValues_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemAttributeValues" ADD CONSTRAINT "_ItemAttributeValues_B_fkey" FOREIGN KEY ("B") REFERENCES "ItemAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

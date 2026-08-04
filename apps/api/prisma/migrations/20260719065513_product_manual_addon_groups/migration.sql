-- CreateTable
CREATE TABLE "_ProductManualAddOns" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductManualAddOns_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProductManualAddOns_B_index" ON "_ProductManualAddOns"("B");

-- AddForeignKey
ALTER TABLE "_ProductManualAddOns" ADD CONSTRAINT "_ProductManualAddOns_A_fkey" FOREIGN KEY ("A") REFERENCES "AddOnGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductManualAddOns" ADD CONSTRAINT "_ProductManualAddOns_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('placed', 'confirmed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('unassigned', 'preparing', 'out_for_delivery', 'delivered', 'failed', 'stock_reverted');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('online', 'cod');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'advance_paid', 'paid', 'cod_collected', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentTxnKind" AS ENUM ('ADVANCE', 'PAYMENT', 'COD_COLLECTED', 'REFUND');

-- CreateEnum
CREATE TYPE "OrderPhotoKind" AS ENUM ('PREP', 'DELIVERY');

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channelId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderEmail" TEXT,
    "isGift" BOOLEAN NOT NULL DEFAULT false,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "recipientCustomerId" TEXT,
    "giftMessage" TEXT,
    "anonymousGift" BOOLEAN NOT NULL DEFAULT false,
    "photoUpdates" BOOLEAN NOT NULL DEFAULT true,
    "salesStatus" "SalesStatus" NOT NULL DEFAULT 'placed',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'unassigned',
    "zone" "DeliveryZone" NOT NULL,
    "address" TEXT NOT NULL,
    "deliveryNotes" TEXT,
    "methodLabel" TEXT,
    "date" TEXT,
    "slotLabel" TEXT,
    "etaLabel" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'online',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "paidPaisa" INTEGER NOT NULL DEFAULT 0,
    "duePaisa" INTEGER NOT NULL DEFAULT 0,
    "refundPaisa" INTEGER NOT NULL DEFAULT 0,
    "subtotalPaisa" INTEGER NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "discountPaisa" INTEGER NOT NULL DEFAULT 0,
    "deliveryPaisa" INTEGER NOT NULL DEFAULT 0,
    "deliveryWaivedPaisa" INTEGER NOT NULL DEFAULT 0,
    "adjustmentPaisa" INTEGER NOT NULL DEFAULT 0,
    "totalPaisa" INTEGER NOT NULL DEFAULT 0,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bg" TEXT,
    "sizeLabel" TEXT,
    "bundleLabel" TEXT,
    "addonLabels" TEXT[],
    "persoText" TEXT,
    "productType" "ProductType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPaisa" INTEGER NOT NULL,
    "linePaisa" INTEGER NOT NULL,
    "discountPaisa" INTEGER NOT NULL DEFAULT 0,
    "refundPaisa" INTEGER,
    "refundNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "PaymentTxnKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderPhotoKind" NOT NULL,
    "url" TEXT,
    "bg" TEXT,
    "caption" TEXT,
    "capturedBy" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrderPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_channelId_idx" ON "Order"("channelId");

-- CreateIndex
CREATE INDEX "Order_salesStatus_idx" ON "Order"("salesStatus");

-- CreateIndex
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "OrderPhoto_orderId_idx" ON "OrderPhoto"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPhoto" ADD CONSTRAINT "OrderPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

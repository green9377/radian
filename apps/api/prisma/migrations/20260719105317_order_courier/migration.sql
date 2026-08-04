-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierAssignedAt" TIMESTAMP(3),
ADD COLUMN     "courierConsignment" TEXT,
ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "courierTrackingUrl" TEXT;

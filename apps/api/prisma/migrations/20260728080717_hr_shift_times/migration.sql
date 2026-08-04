-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "inTime" TEXT,
ADD COLUMN     "outTime" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "shiftEnd" TEXT,
ADD COLUMN     "shiftStart" TEXT;

-- Administration (ADM-D01..D07) — RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md
--
-- Written by hand instead of by `prisma migrate dev`, on purpose.
-- `migrate dev` wants to ASK about the new unique index on AppUser.email, and
-- nothing inside a Docker container can answer it. Handwriting the SQL also
-- means the exact statements that touch AppUser can be read before they run.
--
-- Nothing is dropped. Nothing is emptied. Existing passwords are untouched —
-- DROP NOT NULL removes a rule, never a value.

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('MODULE', 'SCREEN');

-- CreateEnum
CREATE TYPE "AuthTokenKind" AS ENUM ('INVITE', 'RESET');

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "email" TEXT,
                      ADD COLUMN     "positionId" TEXT,
                      ALTER COLUMN   "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccessNode" (
    "key" TEXT NOT NULL,
    "parentKey" TEXT,
    "kind" "NodeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "href" TEXT,
    "routes" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "AccessNode_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionAccess" (
    "positionId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "PositionAccess_pkey" PRIMARY KEY ("positionId","nodeKey")
);

-- CreateTable
CREATE TABLE "UserAccessOverride" (
    "userId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "UserAccessOverride_pkey" PRIMARY KEY ("userId","nodeKey")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessNode_parentKey_idx" ON "AccessNode"("parentKey");

-- CreateIndex
CREATE INDEX "AccessNode_retiredAt_idx" ON "AccessNode"("retiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");

-- CreateIndex
CREATE INDEX "PositionAccess_nodeKey_idx" ON "PositionAccess"("nodeKey");

-- CreateIndex
CREATE INDEX "UserAccessOverride_nodeKey_idx" ON "UserAccessOverride"("nodeKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "AuthToken"("userId");

-- CreateIndex
-- Safe on today's data: every AppUser.email is NULL, and Postgres does not
-- treat NULLs as duplicates of one another.
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAccess" ADD CONSTRAINT "PositionAccess_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAccess" ADD CONSTRAINT "PositionAccess_nodeKey_fkey" FOREIGN KEY ("nodeKey") REFERENCES "AccessNode"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessOverride" ADD CONSTRAINT "UserAccessOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessOverride" ADD CONSTRAINT "UserAccessOverride_nodeKey_fkey" FOREIGN KEY ("nodeKey") REFERENCES "AccessNode"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

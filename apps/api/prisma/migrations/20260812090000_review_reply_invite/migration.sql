-- DEC-WEB-008 — a new message kind: the review request that goes out 24h after delivery
ALTER TYPE "OrderMessageKind" ADD VALUE 'REVIEW_REQUEST';

-- DEC-WEB-007 — shop reply under a review
ALTER TABLE "Review" ADD COLUMN "replyText" TEXT;
ALTER TABLE "Review" ADD COLUMN "replyAt" TIMESTAMP(3);

-- DEC-WEB-008 — WhatsApp review invite (delivered + 24h, single-use token)
CREATE TABLE "ReviewInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewInvite_token_key" ON "ReviewInvite"("token");
CREATE INDEX "ReviewInvite_sentAt_dueAt_idx" ON "ReviewInvite"("sentAt", "dueAt");
CREATE INDEX "ReviewInvite_orderId_idx" ON "ReviewInvite"("orderId");

ALTER TABLE "ReviewInvite" ADD CONSTRAINT "ReviewInvite_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewInvite" ADD CONSTRAINT "ReviewInvite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewInvite" ADD CONSTRAINT "ReviewInvite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

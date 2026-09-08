-- The storefront account becomes real (owner, 8 Sep 2026).
-- Until now "signed in" was a note the browser wrote to itself, so the account
-- could only show invented data. These three changes are what a real one needs:
-- a server-side session, a wishlist that belongs to the person rather than the
-- browser, and the two profile fields the account screen asks for.

-- 1 · the session. Only the SHA-256 of the token is kept, never the token.
CREATE TABLE "CustomerSession" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent"  TEXT,
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");
ALTER TABLE "CustomerSession"
  ADD CONSTRAINT "CustomerSession_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2 · the wishlist, on the account instead of in one browser
CREATE TABLE "WishlistItem" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId", "productId");
CREATE INDEX "WishlistItem_customerId_idx" ON "WishlistItem"("customerId");
ALTER TABLE "WishlistItem"
  ADD CONSTRAINT "WishlistItem_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WishlistItem"
  ADD CONSTRAINT "WishlistItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3 · the profile's own two fields. The customer's OWN address stays apart
--     from the delivery addresses (Recipient) — the owner's rule.
ALTER TABLE "Customer"
  ADD COLUMN "ownAddressZone" "DeliveryZone",
  ADD COLUMN "birthday" TEXT;

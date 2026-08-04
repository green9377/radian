-- Collections — the "Gifts for Every Budget" cards, and any other named shelf.

CREATE TYPE "CollectionMode" AS ENUM ('PRICE_RANGE', 'MANUAL');

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kicker" TEXT,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "mode" "CollectionMode" NOT NULL DEFAULT 'MANUAL',
    "minPaisa" INTEGER,
    "maxPaisa" INTEGER,
    "accent" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "zone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- the soft-delete extension puts `deletedAt: null` into every findMany;
    -- a table without the column stops the API booting at all
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE INDEX "Collection_isActive_sortOrder_idx" ON "Collection"("isActive", "sortOrder");

CREATE TABLE "CollectionProduct" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The four budget cards exactly as they are on the site today, so the homepage
-- does not change the moment it starts reading from here.
--
-- The first three are price windows: a new product priced at ৳800 joins "Under
-- ৳1,000" by itself. "Premium Collection" is MANUAL — no price decides what is
-- premium, and the rose-gold treatment on that card is the `accent` flag.
INSERT INTO "Collection" ("id","slug","name","kicker","subtitle","mode","minPaisa","maxPaisa","accent","isFeatured","sortOrder","updatedAt") VALUES
('col_under_1000','under-1000','Under ৳1,000','Sweet & simple','Little gestures, big smiles','PRICE_RANGE',NULL,99999,false,true,0,CURRENT_TIMESTAMP),
('col_1000_2000','1000-2000','৳1,000 – ৳2,000','The favourites','Our most-loved range','PRICE_RANGE',100000,200000,false,true,1,CURRENT_TIMESTAMP),
('col_2000_5000','2000-5000','৳2,000 – ৳5,000','Go grand','For moments that matter','PRICE_RANGE',200000,500000,false,true,2,CURRENT_TIMESTAMP),
('col_premium','premium','Premium Collection','Rose gold tier','Luxury, hand-finished','MANUAL',NULL,NULL,true,true,3,CURRENT_TIMESTAMP);

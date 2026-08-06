-- OrderMessage — এক order নিয়ে গ্রাহককে পাঠানো বার্তার হিসাব। ৬ আগস্ট ২০২৬।
-- DEC-WA-002…005। বিস্তারিত schema.prisma-র মন্তব্যে।
--
-- নিরাপদ: শুধু নতুন enum আর নতুন টেবিল। কোনো পুরনো সারি ছোঁয়া হচ্ছে না।

CREATE TYPE "OrderMessageKind" AS ENUM (
  'ORDER_CONFIRMATION',
  'ORDER_CONFIRMATION_COD',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'PAYMENT_FAILED'
);

CREATE TYPE "OrderMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- NotifyChannel পুনর্ব্যবহার করা হয়নি — ওতে 'OFF' আছে, যেটা supplier-কে
-- জানানোর সেটিং। পাঠানো বার্তার সারিতে "মাধ্যম = OFF" অর্থহীন হতো।
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

CREATE TABLE "OrderMessage" (
  "id"                TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "kind"              "OrderMessageKind" NOT NULL,
  "attempt"           INTEGER NOT NULL DEFAULT 1,
  "channel"           "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
  "status"            "OrderMessageStatus" NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "error"             TEXT,
  "templateName"      TEXT,
  "dueAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),

  CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id")
);

-- একই বার্তা দুবার যাওয়া ঠেকানোর একমাত্র ভরসা। কোড নয়, ডেটাবেজ না বলবে।
CREATE UNIQUE INDEX "OrderMessage_orderId_kind_attempt_key"
  ON "OrderMessage"("orderId", "kind", "attempt");

-- scheduler প্রতিবার এই দুটো কলাম ধরেই খোঁজে
CREATE INDEX "OrderMessage_status_dueAt_idx" ON "OrderMessage"("status", "dueAt");
CREATE INDEX "OrderMessage_orderId_idx" ON "OrderMessage"("orderId");

ALTER TABLE "OrderMessage"
  ADD CONSTRAINT "OrderMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- CheckoutLead — checkout-এ নাম-নম্বর দিয়েছেন, order তৈরিই হয়নি। DEC-WA-004।
--
-- ⚠️ এখানে এমন মানুষের ফোন নম্বর জমা হয় যিনি কখনো কিছু কেনেননি। পাঠানোর আগে
-- opt-out তালিকা মানতে হবে, আর সারিগুলো Retention সেটিং অনুযায়ী মুছবে।
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "CheckoutLeadStatus" AS ENUM ('OPEN', 'CONVERTED', 'MESSAGED', 'SKIPPED');
CREATE TYPE "CheckoutStage" AS ENUM ('CART', 'DETAILS', 'DELIVERY', 'PAYMENT');

CREATE TABLE "CheckoutLead" (
  "id"            TEXT NOT NULL,
  "clientKey"     TEXT NOT NULL,
  "name"          TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  -- যা-ই type করা হোক সব এখানে। কার্ড/CVV/OTP কখনো নয় — ওগুলো আমাদের
  -- পাতায় আসেই না, SSLCommerz-এর নিজের পাতায় যায়।
  "draft"         JSONB,
  "stage"         "CheckoutStage" NOT NULL DEFAULT 'CART',
  "cart"          JSONB,
  "itemCount"     INTEGER NOT NULL DEFAULT 0,
  "totalPaisa"    INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderId"       TEXT,
  "status"        "CheckoutLeadStatus" NOT NULL DEFAULT 'OPEN',
  "messageSentAt" TIMESTAMP(3),
  "messageError"  TEXT,
  "skipReason"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),

  CONSTRAINT "CheckoutLead_pkey" PRIMARY KEY ("id")
);

-- একই ব্রাউজার বারবার এলে নতুন সারি নয়, একই সারি হালনাগাদ
CREATE UNIQUE INDEX "CheckoutLead_clientKey_key" ON "CheckoutLead"("clientKey");

-- sweeper প্রতিবার এই দুটো ধরেই খোঁজে ("OPEN, আর ১৫ মিনিট চুপ")
CREATE INDEX "CheckoutLead_status_lastSeenAt_idx" ON "CheckoutLead"("status", "lastSeenAt");
CREATE INDEX "CheckoutLead_phone_idx" ON "CheckoutLead"("phone");
CREATE INDEX "CheckoutLead_orderId_idx" ON "CheckoutLead"("orderId");

ALTER TABLE "CheckoutLead"
  ADD CONSTRAINT "CheckoutLead_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

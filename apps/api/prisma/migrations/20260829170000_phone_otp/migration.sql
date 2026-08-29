-- The one-time code (DEC-WA-010).
--
-- Customer.whatsappVerified has existed since the customer model was written,
-- always false, with a comment saying it turns true "the day WhatsApp OTP
-- runs". This is that day.
--
-- The code is stored as a hash and never in the clear: a leaked database must
-- not hand out live codes, and nobody reading this table can use a customer's
-- code before the customer does.
--
-- Rows are kept after use rather than deleted. Two reasons: "how often does
-- WhatsApp fail and fall through to SMS" is worth being able to answer, and a
-- burst of attempts against one number is what an attack looks like.

CREATE TYPE "OtpChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');
CREATE TYPE "OtpPurpose" AS ENUM ('CHECKOUT', 'LOGIN', 'TRACK');

CREATE TABLE "PhoneOtp" (
  "id"          TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "purpose"     "OtpPurpose" NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "attemptsLog" JSONB NOT NULL DEFAULT '[]',
  "sentVia"     "OtpChannel",
  "sentTo"      TEXT,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "wrongTries"  INTEGER NOT NULL DEFAULT 0,
  "usedAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- Rate limiting reads (phone, purpose, createdAt) on every send request.
CREATE INDEX "PhoneOtp_phone_purpose_createdAt_idx"
  ON "PhoneOtp" ("phone", "purpose", "createdAt");

-- The sweeper walks expired rows.
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp" ("expiresAt");

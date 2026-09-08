-- SMTP beside the HTTP email providers (owner, 8 Sep 2026)
ALTER TABLE "MessagingSetting"
  ADD COLUMN "emailSmtpHost" TEXT,
  ADD COLUMN "emailSmtpPort" INTEGER DEFAULT 587,
  ADD COLUMN "emailSmtpUser" TEXT,
  ADD COLUMN "emailSmtpPass" TEXT,
  ADD COLUMN "emailSmtpSecure" BOOLEAN NOT NULL DEFAULT false;

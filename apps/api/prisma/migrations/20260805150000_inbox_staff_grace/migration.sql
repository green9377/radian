-- DEC-INB-008 (৫ আগস্ট) — staff-অগ্রাধিকারের জানালা, মিনিটে।
-- Staff reply আর AI-কে স্থায়ীভাবে থামায় না; এই ক'মিনিট staff-এর, তারপর AI-র।
ALTER TABLE "InboxSetting" ADD COLUMN "staffGraceMin" INTEGER NOT NULL DEFAULT 3;

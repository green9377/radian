-- The words of every SMS and email about an order or a login code (owner, 8 Sep 2026).
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" "OrderMessageChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageTemplate_kind_channel_isActive_idx" ON "MessageTemplate"("kind", "channel", "isActive");

-- The starting set, so the system speaks from day one. Every row is editable
-- and removable from Admin -> Marketing -> Email & SMS -> Templates.
INSERT INTO "MessageTemplate" ("id","kind","channel","name","subject","body","updatedAt") VALUES
('tpl_conf_sms','ORDER_CONFIRMATION','SMS','Order confirmation',NULL,'Hi {name}, thank you! Your {shop} order {order} ({total}) is confirmed. We will message you when it is on its way. Help: {phone}',now()),
('tpl_conf_email','ORDER_CONFIRMATION','EMAIL','Order confirmation','Your {shop} order {order} is confirmed','Hi {name},

Thank you for your order. Order {order} ({total}) is confirmed and we are getting it ready. We will let you know when it is on its way.

Track it here: {link}

Need help? Call or WhatsApp {phone}.

{shop}',now()),
('tpl_confcod_sms','ORDER_CONFIRMATION_COD','SMS','Order confirmation (cash on delivery)',NULL,'Hi {name}, your {shop} order {order} is confirmed. Please keep {total} ready in cash for our rider. Help: {phone}',now()),
('tpl_confcod_email','ORDER_CONFIRMATION_COD','EMAIL','Order confirmation (cash on delivery)','Your {shop} order {order} is confirmed','Hi {name},

Thank you for your order. Order {order} is confirmed. Please keep {total} ready in cash for our rider.

Track it here: {link}

Need help? Call or WhatsApp {phone}.

{shop}',now()),
('tpl_out_sms','ORDER_OUT_FOR_DELIVERY','SMS','Out for delivery',NULL,'Hi {name}, your {shop} order {order} is on its way. Our rider will call on arrival. Help: {phone}',now()),
('tpl_out_email','ORDER_OUT_FOR_DELIVERY','EMAIL','Out for delivery','Your {shop} order {order} is on its way','Hi {name},

Your order {order} has left us and is on its way. Our rider will call on arrival.

Track it here: {link}

{shop}',now()),
('tpl_deliv_sms','ORDER_DELIVERED','SMS','Delivered',NULL,'Hi {name}, your {shop} order {order} has been delivered. Thank you for choosing us! Help: {phone}',now()),
('tpl_deliv_email','ORDER_DELIVERED','EMAIL','Delivered','Your {shop} order {order} has been delivered','Hi {name},

Your order {order} has been delivered. Thank you for choosing us - we hope it made someone smile.

{shop}',now()),
('tpl_payfail_sms','PAYMENT_FAILED','SMS','Payment failed',NULL,'Hi {name}, the payment for your {shop} order {order} ({total}) did not go through. Pay here to keep it: {link}  Help: {phone}',now()),
('tpl_payfail_email','PAYMENT_FAILED','EMAIL','Payment failed','Payment for order {order} did not go through','Hi {name},

The payment for your order {order} ({total}) did not go through, so it is not confirmed yet.

Pay here to keep it: {link}

Need help? Call or WhatsApp {phone}.

{shop}',now()),
('tpl_review_sms','REVIEW_REQUEST','SMS','Review request',NULL,'Hi {name}, how was {product}? A few words help the next person choose: {link}  - {shop}',now()),
('tpl_review_email','REVIEW_REQUEST','EMAIL','Review request','How was {product}?','Hi {name},

How was {product}? A few words from you help the next person choose.

Write a review: {link}

Thank you,
{shop}',now()),
('tpl_otp_sms','LOGIN_OTP','SMS','Login code',NULL,'{code} is your {shop} verification code. It expires in {minutes} minutes. Do not share it with anyone.',now()),
('tpl_otp_email','LOGIN_OTP','EMAIL','Login code','{code} is your {shop} verification code','Your {shop} verification code is {code}. It expires in {minutes} minutes. If you did not ask for this, ignore this email - nobody can use it without you.',now());

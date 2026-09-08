"use client";

import { useState } from "react";

import {
  useCheckoutStore,
  validateStep,
  type StepErrors,
} from "../../_store/useCheckoutStore";
import { useRecipientBook, type SavedRecipient } from "../../_store/useRecipientBook";
import Icon from "../Pdp/PdpIcons";
import {
  Continue,
  Field,
  PhoneInput,
  QCard,
  Seg,
  Toggle,
  inputClass,
} from "./CheckoutFields";

/*
  Q1 — Your Details   ·   Q2 — Who's Receiving

  ★ The sender's phone takes a country code (locked, 14 July — the owner).
  Many customers live abroad and send flowers to a mother in Dhaka; their own
  number is not +880.

  ★ IT IS "PHONE NUMBER", NOT "WHATSAPP NUMBER" (owner, 8 Sep 2026). The field
  demanded a WhatsApp number and explained itself in a grey line underneath —
  but a Bangladeshi customer is messaged by SMS now (`notify-route.ts` sends
  BD → SMS, foreign → email, WhatsApp last), so the demand was both narrower
  than the truth and one more thing to read at the checkout. What we do with
  the number lives behind the ⓘ.

  ★ The receiver's phone takes no country code — the gift is going to
  Bangladesh, so the receiver is in Bangladesh.

  ★ The card message is NOT here any more. It is step 4, `CheckoutMessage`.

  ★ A red * on a required field — what cannot be skipped, at a glance.
*/

export function Q1Details() {
  const s = useCheckoutStore();
  const [errors, setErrors] = useState<StepErrors>({});

  function onContinue() {
    const e = validateStep(1, s);
    setErrors(e);
    if (Object.keys(e).length === 0) s.completeStep(1);
  }

  return (
    <QCard
      n={1}
      title="Your Details"
      lead="Let us know you better"
      open={s.step === 1}
      done={s.done.includes(1)}
      facts={[
        { label: "Full name", value: s.senderName },
        { label: "Phone", value: `${s.senderDial} ${s.senderPhone}` },
        ...(s.senderEmail ? [{ label: "Email", value: s.senderEmail }] : []),
      ]}
      onOpen={() => s.openStep(1)}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" required error={errors.senderName}>
          <input
            className={inputClass}
            value={s.senderName}
            onChange={(e) => s.set("senderName", e.target.value)}
            placeholder="Rahim Ahmed"
            autoComplete="name"
          />
        </Field>

        <Field
          label="Phone number"
          required
          hint="We send the confirmation, the preparation photo and the delivery photo to this number. Sending from abroad? Pick your country code and we will reach you there."
          error={errors.senderPhone}
        >
          <PhoneInput
            dial={s.senderDial}
            phone={s.senderPhone}
            onDial={(d) => s.set("senderDial", d)}
            onPhone={(p) => s.set("senderPhone", p)}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Email" optional error={errors.senderEmail}>
          <input
            className={inputClass}
            value={s.senderEmail}
            onChange={(e) => s.set("senderEmail", e.target.value)}
            placeholder="you@email.com"
            inputMode="email"
            autoComplete="email"
          />
        </Field>
      </div>

      <Continue onClick={onContinue} />
    </QCard>
  );
}

export function Q2Receiving() {
  const s = useCheckoutStore();
  const [errors, setErrors] = useState<StepErrors>({});

  function onContinue() {
    const e = validateStep(2, s);
    setErrors(e);
    if (Object.keys(e).length === 0) s.completeStep(2);
  }

  const facts = s.isGift
    ? [
        { label: "Receiver", value: s.recipientName },
        { label: "Receiver's phone", value: s.recipientPhone },
        { label: "Photo updates", value: s.photoUpdates ? "On" : "Off" },
      ]
    : [{ label: "Receiver", value: "For me" }];

  return (
    <QCard
      n={2}
      title="Who's Receiving?"
      lead="Who is this for?"
      open={s.step === 2}
      done={s.done.includes(2)}
      facts={facts}
      onOpen={() => s.openStep(2)}
    >
      <Seg
        options={[
          { id: "gift", label: "It's a gift" },
          { id: "self", label: "It's for me" },
        ]}
        value={s.isGift ? "gift" : "self"}
        onChange={(id) => s.set("isGift", id === "gift")}
      />

      {s.isGift && (
        <>
          {/*
            ─── SAVED RECEIVERS — the owner's ruling, 3 Aug 2026 ───
            Anyone this device has sent to before comes back in one tap.
            Picking one fills the two fields below — but they stay editable;
            choosing is not being locked in. "Someone new" simply empties them.
          */}
          <SavedReceivers
            currentPhone={s.recipientPhone}
            onPick={(r) => {
              s.set("recipientName", r.name);
              s.set("recipientPhone", r.phone);
            }}
            onNew={() => {
              s.set("recipientName", "");
              s.set("recipientPhone", "");
            }}
          />

          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <Field label="Receiver's name" required error={errors.recipientName}>
              <input
                className={inputClass}
                value={s.recipientName}
                onChange={(e) => s.set("recipientName", e.target.value)}
                placeholder="Meem Rahman"
              />
            </Field>

            <Field
              label="Receiver's phone"
              required
              hint="A Bangladeshi number — our rider calls it on arrival."
              error={errors.recipientPhone}
            >
              <input
                className={inputClass}
                value={s.recipientPhone}
                onChange={(e) => s.set("recipientPhone", e.target.value)}
                placeholder="01X XXX XXXXX"
                inputMode="tel"
              />
            </Field>
          </div>

          {/*  ⚠️ The card message and "Send anonymously" moved to step 4
               (owner, 8 Sep 2026). Both are about the CARD, and both were
               being skipped down here under a phone field.  */}
          <div className="mt-1">
            <Toggle
              icon="camera"
              title="Photo updates"
              sub="The arrangement and the delivery, sent to you"
              on={s.photoUpdates}
              onChange={(v) => s.set("photoUpdates", v)}
            />
          </div>
        </>
      )}

      {!s.isGift && (
        <div className="mt-5">
          <Toggle
            icon="camera"
            title="Photo updates"
            sub="A photo before it leaves the studio"
            on={s.photoUpdates}
            onChange={(v) => s.set("photoUpdates", v)}
          />
        </div>
      )}

      <Continue onClick={onContinue} />
    </QCard>
  );
}

/* ─────────────────── SAVED RECEIVERS ───────────────────
   The owner's ruling, 3 Aug 2026: previous receivers show as options to pick
   from — or a new receiver.

   ⚠️ THE LIST IS THIS DEVICE'S OWN BOOK (`useRecipientBook`), not the server's.
   Without a login, a bare phone number must never unlock somebody's address
   book. The server's book is filling too — every gift order files its receiver
   in the CRM — and it moves in here the day WhatsApp OTP login lands.

   An empty book draws nothing at all: a first-time customer never learns the
   feature exists, and that is right. A heading over an empty list reads like a
   question with nothing to answer it. */
function SavedReceivers({
  currentPhone,
  onPick,
  onNew,
}: {
  currentPhone: string;
  onPick: (r: SavedRecipient) => void;
  onNew: () => void;
}) {
  const saved = useRecipientBook((s) => s.saved);
  if (saved.length === 0) return null;

  return (
    <div className="mt-5">
      <span className="block text-[13px] font-semibold text-purple mb-2">
        Send again to
      </span>
      <div className="flex flex-wrap gap-2">
        {saved.map((r) => {
          const on = r.phone === currentPhone;
          return (
            <button
              key={r.phone}
              type="button"
              onClick={() => onPick(r)}
              className={`rounded-full border-[1.5px] px-4 py-2 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-orchid bg-orchid-soft text-purple"
                  : "border-lavender-deep bg-white text-body hover:border-orchid-mid"
              }`}
            >
              {r.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          className="rounded-full border-[1.5px] border-dashed border-lavender-deep px-4 py-2 text-[13px] font-semibold text-orchid hover:border-orchid transition-colors"
        >
          + Someone new
        </button>
      </div>
    </div>
  );
}

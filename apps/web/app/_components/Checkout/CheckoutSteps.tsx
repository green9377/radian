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
  Q1 — Your Details   ·   Q2 — Who's Receiving + Gift Touches

  ★ Sender-এর ফোনে country code বাধ্যতামূলক (locked, 14 July — সোবুজ)
  অনেক customer প্রবাসী — ঢাকায় মায়ের জন্য ফুল পাঠান। তাঁর নম্বর +880 নয়।
  আর Radian-এর পুরো communication WhatsApp-এ শুরু হয় (confirmation → prep
  photo → delivery photo), তাই নম্বরটা **WhatsApp হতেই হবে** — ঘরের নিচে
  সেটাই পরিষ্কার লেখা।

  ★ Receiver-এর ফোনে country code নেই — উপহার বাংলাদেশে যাচ্ছে, প্রাপকও
  বাংলাদেশেই। আর তাঁর নম্বর WhatsApp হওয়া বাধ্যতামূলক নয় — রাইডার ফোন করবে।

  ★ বাধ্যতামূলক ঘরে লাল * — কোনটা ছাড়া চলবে না, এক নজরে।
*/

const MSG_MAX = 200;

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
      open={s.step === 1}
      done={s.done.includes(1)}
      summary={
        s.senderName ? `${s.senderName} · ${s.senderDial} ${s.senderPhone}` : undefined
      }
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
          label="WhatsApp number"
          required
          hint="Must be a WhatsApp number — we send confirmation, the preparation photo and the delivery photo there."
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

      <div className="mt-4 rounded-[14px] bg-[#E8F9EE] border border-[#C4EED4] px-4 py-3 flex gap-2.5">
        <Icon name="wa" className="w-[18px] h-[18px] text-[#0E7A3D] shrink-0 mt-[1px]" />
        <p className="text-[12.5px] text-[#25674A] leading-snug">
          Sending from abroad? Pick your country code — we&apos;ll message you on
          WhatsApp wherever you are.
        </p>
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

  const summary = s.isGift
    ? s.recipientName
      ? `Gift for ${s.recipientName}${s.anonymousGift ? " · anonymous" : ""}`
      : undefined
    : "For me";

  return (
    <QCard
      n={2}
      title="Who's Receiving?"
      open={s.step === 2}
      done={s.done.includes(2)}
      summary={summary}
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
            ─── SAVED RECEIVERS — মালিকের রায়, ৩ আগস্ট ২০২৬ ───
            যাদের এই device থেকে আগে পাঠানো হয়েছে, তারা এক tap-এ ফিরে আসে।
            বাছলে নিচের ঘর দুটো ভরে যায় — কিন্তু ঘরগুলো ততক্ষণই সম্পাদনযোগ্য
            থাকে; বাছাই মানে বন্দী নয়। "Someone new" শুধু ঘর খালি করে।
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
              hint="Bangladeshi number. Our rider calls on arrival — WhatsApp isn't needed."
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

          {/* ─── gift message (D14 — PDP/cart থেকে সরানো) ─── */}
          <div className="mt-4">
            <Field
              label="Gift message"
              optional
              hint="Hand-written on a Radian card — the part they keep"
            >
              <textarea
                className={`${inputClass} min-h-[92px] resize-none`}
                value={s.giftMessage}
                maxLength={MSG_MAX}
                onChange={(e) => s.set("giftMessage", e.target.value)}
                placeholder="Happy birthday, Meem. Ten years and I'd still pick you."
              />
            </Field>
            <div className="text-right text-[11.5px] text-body-soft mt-1">
              {s.giftMessage.length}/{MSG_MAX}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <Toggle
              icon="eye-off"
              title="Send anonymously"
              sub="Your name won't appear on the card"
              on={s.anonymousGift}
              onChange={(v) => s.set("anonymousGift", v)}
            />
            <Toggle
              icon="camera"
              title="Photo updates"
              sub="We WhatsApp you the arrangement and the delivery"
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
            sub="We WhatsApp you a photo before it leaves the studio"
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
   মালিকের রায়, ৩ আগস্ট ২০২৬: আগের receiver-রা option হিসেবে দেখাবে,
   সেখান থেকে select — বা নতুন receiver।

   ⚠️ তালিকাটা এই DEVICE-এর নিজের খাতা (useRecipientBook), server নয় —
   login ছাড়া ফোন নম্বর দিয়ে কারো address book খোলা যায় না। server-এর
   খাতাও ভরছে (প্রতিটা gift order প্রাপককে CRM-এ save করে), সেটা OTP
   login-এর দিন এখানেই এসে বসবে।

   খালি খাতায় কিছুই আঁকা হয় না — প্রথমবারের গ্রাহক জানতেও পারবেন না
   feature-টা আছে, আর সেটাই ঠিক: শূন্য তালিকার শিরোনাম একটা প্রশ্নের মতো
   দেখায় যার উত্তর দেওয়ার কিছু নেই। */
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

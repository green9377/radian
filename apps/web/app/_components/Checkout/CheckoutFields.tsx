"use client";

import type { ReactNode } from "react";

import { COUNTRIES } from "../../_data/countries";
import Icon from "../Pdp/PdpIcons";

/*
  Checkout-এর ছোট building block গুলো — QCard · Field · Input · Toggle · Seg।
  একটাই জায়গায় রাখা, কারণ চারটা step-ই হুবহু একই চেহারা চায়। নইলে
  step 3-এর input step 1-এর থেকে ২px আলাদা হবে, আর কেউ ধরতে পারবে না।
*/

/* ─────────────────── STEP BAR ─────────────────── */

export const STEP_LABELS = [
  "Your details",
  "Receiver",
  "Where",
  "When",
  "Payment",
] as const;

/*
  ★ Scroll করলেও উপরে আটকে থাকে (locked, 14 July)
  Checkout লম্বা — নিচে নেমে গেলে "আমি কোন ধাপে, আর কয়টা বাকি" ভুলে যাওয়াই
  সবচেয়ে বড় drop-off-এর কারণ। তাই bar সবসময় চোখের সামনে।

  ⚠️ `top` = Header-এর উচ্চতা। Header sticky top-0, তাই এর নিচেই বসতে হবে।
  Header-এর উচ্চতা বদলালে এখানকার আর CheckoutSummary-র `top` — দুটোই বদলাও।
*/
export function StepBar({ step, done }: { step: number; done: number[] }) {
  return (
    <div className="sticky top-[112px] lg:top-[124px] z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-3 bg-[#F6F4FA]/95 backdrop-blur-[10px] border-b border-lavender-deep">
      <div className="flex gap-1.5 sm:gap-2.5">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isDone = done.includes(n);
          const isNow = step === n;

          return (
            <div key={label} className="flex-1 min-w-0">
              <div
                className={`h-[4px] rounded-full transition-colors ${
                  isDone ? "bg-[#0E7A3D]" : isNow ? "bg-orchid" : "bg-lavender-deep"
                }`}
              />
              <div
                className={`mt-2 text-[10.5px] sm:text-[12.5px] truncate ${
                  isNow ? "text-purple font-semibold" : "text-body-soft"
                }`}
              >
                <span className="hidden sm:inline">{n} · </span>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────── ACCORDION CARD ───────────────────
   বন্ধ থাকলে এক লাইনের সারসংক্ষেপ + Edit। খোলা থাকলে পুরো form।
   একসাথে একটাই খোলা — checkout-এ যত কম জিনিস চোখে পড়ে তত ভালো।
*/

export function QCard({
  n,
  title,
  open,
  done,
  summary,
  onOpen,
  children,
}: {
  n: number;
  title: string;
  open: boolean;
  done: boolean;
  summary?: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={`step-${n}`}
      /* scroll-mt = sticky StepBar-এর উচ্চতা — Edit-এ এলে card যেন bar-এর নিচে না লুকায় */
      className={`scroll-mt-[190px] lg:scroll-mt-[200px] bg-white rounded-[24px] border-[1.5px] transition-colors ${
        open ? "border-orchid-mid shadow-soft" : "border-lavender-deep"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left"
      >
        <span
          className={`w-7 h-7 rounded-full grid place-items-center text-[12.5px] font-semibold shrink-0 ${
            done
              ? "bg-[#E8F9EE] text-[#0E7A3D]"
              : open
                ? "bg-purple text-white"
                : "bg-lavender text-body-soft"
          }`}
        >
          {done ? <Icon name="check" className="w-3.5 h-3.5" /> : n}
        </span>

        <h2 className="font-display text-[17px] sm:text-[19px] text-purple font-semibold shrink-0">
          {title}
        </h2>

        {!open && summary && (
          <span className="text-[12.5px] text-body-soft truncate ml-1 flex-1 min-w-0">
            {summary}
          </span>
        )}

        {!open && done && (
          <span className="ml-auto text-[12.5px] font-semibold text-orchid shrink-0">
            Edit
          </span>
        )}
      </button>

      {open && <div className="px-5 sm:px-6 pb-6 pt-1">{children}</div>}
    </section>
  );
}

/* ─────────────────── FIELD ─────────────────── */

export function Field({
  label,
  hint,
  optional,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  /** ★ বাধ্যতামূলক ঘরে লাল তারা — কোনটা ছাড়া চলবে না, এক নজরে বোঝা যায় */
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-purple mb-1.5">
        {label}
        {required && <span className="text-[#C4172B] ml-0.5">*</span>}
        {optional && (
          <span className="font-normal text-body-soft"> · optional</span>
        )}
      </span>
      {children}
      {error ? (
        <span className="block text-[12px] text-[#C4172B] mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] text-body-soft mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "w-full border-[1.5px] border-lavender-deep rounded-[14px] px-4 py-3 text-[14px] text-body outline-none transition-colors focus:border-orchid placeholder:text-body-soft/70";

/* ─────────────────── PHONE (country code) ───────────────────
   প্রবাসী customer ঢাকায় উপহার পাঠান — তাঁর নিজের নম্বর +880 নয়।
   আর সব update WhatsApp-এ যায়, তাই নম্বরটা WhatsApp হতেই হবে।
*/

export function PhoneInput({
  dial,
  phone,
  onDial,
  onPhone,
  placeholder = "01X XXX XXXXX",
}: {
  dial: string;
  phone: string;
  onDial: (d: string) => void;
  onPhone: (p: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2">
      <select
        value={dial}
        onChange={(e) => onDial(e.target.value)}
        aria-label="Country code"
        className="shrink-0 border-[1.5px] border-lavender-deep rounded-[14px] px-3 py-3 text-[14px] text-body bg-white outline-none focus:border-orchid"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>

      <input
        className={inputClass}
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        placeholder={placeholder}
        inputMode="tel"
        autoComplete="tel"
      />
    </div>
  );
}

/* ─────────────────── TOGGLE ─────────────────── */

export function Toggle({
  icon,
  title,
  sub,
  on,
  onChange,
}: {
  icon: "eye-off" | "camera";
  title: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`w-full flex items-center gap-3 text-left rounded-[16px] border-[1.5px] px-4 py-3.5 transition-colors ${
        on ? "border-orchid-mid bg-orchid-soft/50" : "border-lavender-deep bg-white"
      }`}
    >
      <span
        className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${
          on ? "bg-white text-orchid" : "bg-lavender text-body-soft"
        }`}
      >
        <Icon name={icon} className="w-[18px] h-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-purple">{title}</span>
        <span className="block text-[12px] text-body-soft leading-snug">{sub}</span>
      </span>

      <span
        className={`w-[42px] h-[24px] rounded-full p-[3px] shrink-0 transition-colors ${
          on ? "bg-orchid" : "bg-lavender-deep"
        }`}
      >
        <span
          className={`block w-[18px] h-[18px] rounded-full bg-white transition-transform ${
            on ? "translate-x-[18px]" : ""
          }`}
        />
      </span>
    </button>
  );
}

/* ─────────────────── SEGMENTED ─────────────────── */

export function Seg({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex p-1 bg-lavender rounded-[14px] gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-4 sm:px-5 py-2.5 rounded-[11px] text-[13.5px] font-semibold transition-colors ${
            value === o.id
              ? "bg-white text-purple shadow-soft"
              : "text-body-soft hover:text-purple"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────── CONTINUE ─────────────────── */

export function Continue({
  label = "Continue",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex items-center gap-2 bg-purple text-white rounded-[14px] px-8 py-3.5 font-semibold text-[14.5px] transition-transform active:scale-[0.98] hover:bg-purple-deep"
    >
      {label}
      <Icon name="chev" className="w-4 h-4 -rotate-90" />
    </button>
  );
}

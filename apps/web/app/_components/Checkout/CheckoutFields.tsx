"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { IconName } from "../../_data/productDetails";

import { COUNTRIES } from "../../_data/countries";
import { useCheckoutStore } from "../../_store/useCheckoutStore";
import Icon from "../Pdp/PdpIcons";

/*
  Checkout's small building blocks — QCard · Field · Input · Toggle · Seg.
  Kept in one place because all five steps want exactly the same face.
  Otherwise step 3's input ends up 2px different from step 1's and nobody ever
  catches it.
*/

/* ─────────────────── THE STEPPER SHELL ───────────────────
   Owner, 7 Sep 2026, after FlowerAura's checkout: a rail of steps down the
   left, ONE step open on the right, and a finished step collapsing into a
   full-width row — its facts in columns and a pencil to reopen it.

   The shell is one CSS grid (`CheckoutGrid`). The rail — the open step's tile
   and the tiles of the steps not reached yet — is drawn by the grid itself
   from the store, so it can stand as one column beside the panel. A `QCard`
   draws only what belongs to its step: the full-width row when it is done,
   the panel when it is open, nothing while it waits.

   Only the shell changed; every field, rule and store call inside the steps
   is the one that was there before.
*/

export const STEP_TITLES = [
  "Your Details",
  "Who's Receiving?",
  "Where?",
  "When?",
  "Payment & Summary",
] as const;

const STEP_ICONS: IconName[] = ["user", "gift", "pin", "clock", "lock"];

/** which steps the shell is drawing right now — Q4/Q5 leave when every item is held */
const ShellContext = createContext<{ shown: number[] }>({ shown: [1, 2, 3, 4, 5] });

export function CheckoutGrid({ shown, children }: { shown: number[]; children: ReactNode }) {
  const step = useCheckoutStore((s) => s.step);
  const done = useCheckoutStore((s) => s.done);
  const openStep = useCheckoutStore((s) => s.openStep);
  const rail = shown.filter((n) => n === step || !done.includes(n));

  return (
    <ShellContext.Provider value={{ shown }}>
      <div className="checkout-grid grid gap-x-5 gap-y-4 lg:grid-cols-[250px_1fr] mt-4">
        {children}
        {/* the rail — hidden on a phone, where the panel names its own step */}
        <div className="hidden lg:flex flex-col gap-3 checkout-rail self-start">
          {rail.map((n) => {
            const open = n === step;
            return (
              <button
                key={n}
                type="button"
                disabled={open}
                onClick={() => openStep(n)}
                className={`text-left rounded-[20px] border-[1.5px] px-4 py-4 transition-colors ${
                  open
                    ? "bg-white border-purple border-l-[5px] shadow-soft"
                    : "bg-white/60 border-lavender-deep hover:bg-white"
                }`}
              >
                <RailHead n={n} shown={shown} state={open ? "open" : "pending"} />
              </button>
            );
          })}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

export type StepFact = { label: string; value: ReactNode };

export function QCard({
  n,
  title,
  lead,
  open,
  done,
  summary,
  facts,
  onOpen,
  children,
}: {
  n: number;
  title?: string;
  /** the panel's heading — "Let us know where to deliver" */
  lead?: string;
  open: boolean;
  done: boolean;
  /** one line for a finished step; the row prefers `facts` */
  summary?: string;
  /** the finished step's facts, in columns */
  facts?: StepFact[];
  onOpen: () => void;
  children: ReactNode;
}) {
  const { shown } = useContext(ShellContext);
  const name = title ?? STEP_TITLES[n - 1];

  /* ── a finished step: one row across the shell ── */
  if (done && !open) {
    const cols: StepFact[] = facts?.length ? facts : summary ? [{ label: name, value: summary }] : [];
    return (
      <section
        id={`step-${n}`}
        className="scroll-mt-[120px] lg:col-span-2 bg-white rounded-[20px] border-[1.5px] border-lavender-deep shadow-soft px-4 sm:px-5 py-4 grid gap-4 lg:grid-cols-[230px_1fr_auto] items-start"
      >
        <RailHead n={n} shown={shown} state="done" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-lavender-deep">
          {cols.map((f, i) => (
            <div key={i} className={`min-w-0 ${i > 0 ? "lg:pl-5" : ""}`}>
              <span className="block text-[12.5px] text-body-soft">{f.label}</span>
              <span className="block text-[13.5px] text-ink font-medium mt-0.5 break-words">{f.value}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Edit ${name}`}
          className="justify-self-end inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-lavender-deep px-3.5 py-1.5 text-[12.5px] font-bold text-purple hover:border-orchid hover:text-orchid transition-colors"
        >
          <Icon name="pen" className="w-3.5 h-3.5" /> Edit
        </button>
      </section>
    );
  }

  /* ── the open step: the panel; its tile is on the rail ── */
  if (open) {
    return (
      <div
        id={`step-${n}`}
        className="checkout-panel scroll-mt-[120px] bg-white rounded-[24px] border-[1.5px] border-lavender-deep shadow-soft px-5 sm:px-7 py-6"
      >
        <div className="lg:hidden mb-4">
          <RailHead n={n} shown={shown} state="open" />
        </div>
        {lead && (
          <h2 className="font-display text-[20px] sm:text-[22px] text-purple font-semibold mb-5">{lead}</h2>
        )}
        {children}
      </div>
    );
  }

  /* ── not reached yet: the rail carries its tile ── */
  return null;
}

function RailHead({ n, shown, state }: { n: number; shown: number[]; state: "done" | "open" | "pending" }) {
  const title = STEP_TITLES[n - 1];
  const icon = STEP_ICONS[n - 1] ?? "check";
  const tone =
    state === "done"
      ? "bg-[#E8F9EE] text-[#0E7A3D]"
      : state === "open"
        ? "bg-purple text-white shadow-soft"
        : "bg-lavender text-body-soft";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className={`relative w-11 h-11 rounded-[13px] grid place-items-center shrink-0 ${tone}`}>
        <Icon name={icon} className="w-5 h-5" />
        {state === "done" && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0E7A3D] text-white grid place-items-center">
            <Icon name="check" className="w-2.5 h-2.5" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span
          className={`block font-display text-[16px] leading-tight ${
            state === "pending" ? "text-body-soft font-medium" : "text-purple font-semibold"
          }`}
        >
          {title}
        </span>
        <span className="block text-[12px] text-body-soft mt-0.5">
          Step {shown.indexOf(n) + 1}/{shown.length}
        </span>
      </span>
    </div>
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
  /** ★ A red star on a required field — what cannot be skipped, at a glance */
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
   Customers living abroad send gifts to Dhaka — their own number is not +880.
   And every update goes over WhatsApp, so the number has to be a WhatsApp one.
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
        {/* no flag emoji — Windows has no flag font and paints them as letters
            ("BD"), which the owner saw on his own screen (10 Aug) */}
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.code} {c.dial}
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

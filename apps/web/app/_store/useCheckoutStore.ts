"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_DIAL } from "../_data/countries";
import {
  ALL_SPEEDS_OK,
  findSlot,
  getMethod,
  methodState,
  slotState,
  type CartSpeeds,
  type DeliveryMethod,
  type MethodId,
} from "../_data/delivery";
import type { PaymentId } from "../_data/payment";

/*
  ═══════════════════════════════════════════════════════════════════
  CHECKOUT STORE — Zustand + persist ("radian-checkout")

  ★ পাঁচ ধাপ (locked, 14 July — সোবুজ)
    1 Your Details → 2 Who's Receiving → 3 Where → 4 When → 5 Payment

  "Where" আর "When" আলাদা: ঠিকানা লেখা আর সময় বাছা — দুটো আলাদা মাথার কাজ।
  একসাথে রাখলে card লম্বা হয়ে যায় আর মানুষ slot না বেছেই নিচে নামে।

  ── কী persist হয় ────────────────────────────────────────────
  ✅ নাম · ফোন · country code · ঠিকানা → Auth নেই, তাই এই localStorage-ই
     আপাতত "saved address"। পরের অর্ডারে আবার লিখতে হবে না।
  ❌ payment · step · date · slot → নয়। গতকালের slot আজ বসে থাকা মানে
     ভুল তারিখে অর্ডার চলে যাওয়া।

  ── দাম এখানে নেই ────────────────────────────────────────────
  D20-এর মতোই। resolveCart() + quoteDelivery() + applyCoupon() হিসাব করে।
  ═══════════════════════════════════════════════════════════════════
*/

export const TOTAL_STEPS = 5;

export interface CheckoutState {
  /* Q1 — Your details */
  senderName: string;
  /** dial code — "+880" default। প্রবাসী customer-এর জন্য বাধ্যতামূলক */
  senderDial: string;
  senderPhone: string;
  senderEmail: string;

  /* Q2 — Who's receiving + gift touches (D14) */
  isGift: boolean;
  recipientName: string;
  /** সবসময় বাংলাদেশি নম্বর — country code লাগে না */
  recipientPhone: string;
  giftMessage: string;
  anonymousGift: boolean;
  photoUpdates: boolean;

  /* Q3 — Where */
  address: string;
  deliveryNotes: string;

  /* Q4 — When */
  method: MethodId;
  /** YYYY-MM-DD */
  date: string | null;
  slotId: string | null;

  /* Q5 — Payment */
  payment: PaymentId | null;
}

interface CheckoutStore extends CheckoutState {
  step: number;
  done: number[];

  set: <K extends keyof CheckoutState>(key: K, value: CheckoutState[K]) => void;
  patch: (p: Partial<CheckoutState>) => void;
  openStep: (n: number) => void;
  completeStep: (n: number) => void;
  resetAfterOrder: () => void;
  reset: () => void;
}

const EMPTY: CheckoutState = {
  senderName: "",
  senderDial: DEFAULT_DIAL,
  senderPhone: "",
  senderEmail: "",

  isGift: true, // Radian-এর বেশির ভাগ অর্ডারই উপহার
  recipientName: "",
  recipientPhone: "",
  giftMessage: "",
  anonymousGift: false,
  photoUpdates: true,

  address: "",
  deliveryNotes: "",

  method: "sameday",
  date: null,
  slotId: null,

  payment: null,
};

type Persisted = Pick<
  CheckoutState,
  | "senderName"
  | "senderDial"
  | "senderPhone"
  | "senderEmail"
  | "isGift"
  | "recipientName"
  | "recipientPhone"
  | "photoUpdates"
  | "address"
  | "deliveryNotes"
>;

export const useCheckoutStore = create<CheckoutStore>()(
  persist<CheckoutStore, [], [], Persisted>(
    (set) => ({
      ...EMPTY,
      step: 1,
      done: [],

      set: (key, value) => set({ [key]: value } as Partial<CheckoutStore>),
      patch: (p) => set(p as Partial<CheckoutStore>),

      openStep: (n) => set({ step: n }),

      completeStep: (n) =>
        set((s) => ({
          done: s.done.includes(n) ? s.done : [...s.done, n],
          step: n + 1,
        })),

      /*
        Order-এর পর: নাম-ফোন-ঠিকানা থাকে (পরের অর্ডার দ্রুত হবে), কিন্তু
        gift message · slot · payment মুছে যায়। পুরনো বার্তা থেকে গেলে
        পরের বার অন্য কারো উপহারে আগের কারো নাম চলে যেত।
      */
      resetAfterOrder: () =>
        set({
          recipientName: "",
          recipientPhone: "",
          giftMessage: "",
          anonymousGift: false,
          date: null,
          slotId: null,
          payment: null,
          step: 1,
          done: [],
        }),

      reset: () => set({ ...EMPTY, step: 1, done: [] }),
    }),
    {
      name: "radian-checkout",
      version: 2,
      partialize: (s) => ({
        senderName: s.senderName,
        senderDial: s.senderDial,
        senderPhone: s.senderPhone,
        senderEmail: s.senderEmail,
        isGift: s.isGift,
        recipientName: s.recipientName,
        recipientPhone: s.recipientPhone,
        photoUpdates: s.photoUpdates,
        address: s.address,
        deliveryNotes: s.deliveryNotes,
      }),
    },
  ),
);

export function useCheckoutHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useCheckoutStore.persist.onFinishHydration(onChange),
    () => useCheckoutStore.persist.hasHydrated(),
    () => false,
  );
}

/* ─────────────────── PHONE ───────────────────
   Constitution: phone → +8801XXXXXXXXX।
   Sender-এর নম্বর যেকোনো দেশের হতে পারে (প্রবাসী), তাই dial code আলাদা।
   Receiver সবসময় বাংলাদেশে — তাই শুধু BD নিয়ম।
*/

const BD_LOCAL = /^01[3-9]\d{8}$/;
const INTL_LOCAL = /^\d{6,14}$/;

/** "+880" + "01712345678" → "+8801712345678" */
export function normalizePhone(dial: string, raw: string): string | null {
  const clean = raw.replace(/[\s\-()]/g, "");

  if (dial === DEFAULT_DIAL) {
    return BD_LOCAL.test(clean) ? dial + clean.slice(1) : null;
  }

  // বিদেশি নম্বরে শুরুর 0 (trunk prefix) বাদ — +44 07... → +447...
  const local = clean.replace(/^0+/, "");
  return INTL_LOCAL.test(local) ? dial + local : null;
}

export function normalizeBdPhone(raw: string): string | null {
  const clean = raw.replace(/[\s\-()]/g, "");
  return BD_LOCAL.test(clean) ? "+880" + clean.slice(1) : null;
}

/* ─────────────────── VALIDATION ─────────────────── */

export interface StepErrors {
  [field: string]: string;
}

export interface ValidateOpts {
  now?: Date;
  /*  DEC-PDP-10 — largest "days to make" in the cart.
      ⚠️ DEFAULTS TO 0, and that default is safe for exactly one reason: steps
      1–3 and 5 never look at it. Step 4 must always be given the real value —
      a "Place order" that revalidates with 0 would wave through a date the
      picker had greyed out.  */
  leadDays?: number;
  /** which fast options every item in the cart allows (intersection) */
  speeds?: CartSpeeds;
  /**
   * DEC-DLV-009 — যে delivery সারিটা পর্দায় বাছা হয়েছে, পুরোটা।
   *
   * ⚠️ **step 4-এ বাধ্যতামূলক।** আগে এখানে `getMethod(s.method)` লেখা ছিল, আর
   * `s.method` এখন database-এর সারির id — হাতে-লেখা তালিকায় সেটা কোনোদিন
   * মেলে না। মেলেনি বলে চুপচাপ "Same Day" ধরে নিত, তারপর হাতে-লেখা `SLOTS`-এ
   * live slot খুঁজে না পেয়ে বলত *"That slot is gone"*। ফল: **কেউ কোনোদিন
   * step 4 পার হতে পারত না, একটা order-ও place হতো না।**
   *
   * না দিলে নিচে হাতে-লেখা তালিকায় খোঁজে (seed/demo), আর তাতেও না পেলে
   * সোজাসুজি "Pick a delivery option." — নিঃশব্দে অন্য method ধরে নেওয়া নয়।
   */
  method?: DeliveryMethod;
}

export function validateStep(
  n: number,
  s: CheckoutState,
  opts: ValidateOpts = {},
): StepErrors {
  const now = opts.now ?? new Date();
  const leadDays = opts.leadDays ?? 0;
  const speeds = opts.speeds ?? ALL_SPEEDS_OK;
  const e: StepErrors = {};

  if (n === 1) {
    if (s.senderName.trim().length < 2) e.senderName = "We need a name for the order.";
    if (!normalizePhone(s.senderDial, s.senderPhone))
      e.senderPhone =
        s.senderDial === "+880"
          ? "Enter a valid number — 01XXXXXXXXX."
          : "Enter a valid phone number for the country you picked.";
    if (s.senderEmail && !/^\S+@\S+\.\S+$/.test(s.senderEmail))
      e.senderEmail = "That email doesn't look right.";
  }

  if (n === 2 && s.isGift) {
    if (s.recipientName.trim().length < 2) e.recipientName = "Who is this gift for?";
    if (!normalizeBdPhone(s.recipientPhone))
      e.recipientPhone = "Our rider calls this number on arrival — 01XXXXXXXXX.";
  }

  if (n === 3) {
    if (s.address.trim().length < 10)
      e.address = "Add house, road and area — our rider needs the full address.";
  }

  if (n === 4) {
    const method = opts.method ?? getMethod(s.method);
    if (!method) {
      e.method = "Pick a delivery option.";
      return e;
    }

    const state = methodState(method, now, leadDays, speeds);
    if (!state.ok) {
      e.method = state.reason;
      return e;
    }

    if (method.datePick && !s.date) e.date = "Pick a date.";

    /*  DEC-PDP-10 — the picker greys these out, but a date can also arrive
        from a restored session: somebody chooses tomorrow, adds a 3-day item,
        and comes back. The chip is already unselectable by then; the value
        they picked earlier is still sitting in the store.  */
    if (method.datePick && s.date && leadDays > 0) {
      const earliest = new Date(now);
      earliest.setDate(now.getDate() + leadDays);
      if (s.date < toISO(earliest))
        e.date = `That date is too soon — this takes ${leadDays} day${
          leadDays === 1 ? "" : "s"
        } to make.`;
    }

    if (method.slots) {
      if (!s.slotId) {
        e.slotId = "Pick a time slot.";
      } else {
        /*  ⚠️ এই method-এর **নিজের** slot-এ খোঁজে। `getSlot()` সবসময় হাতে-লেখা
            `SLOTS`-এ খুঁজত, তাই delivery module-এর slot বাছলেই `null` — আর
            তখন এই লাইনটাই checkout-কে চিরকালের জন্য আটকে দিত।  */
        const slot = findSlot(method, s.slotId);
        const isToday = method.todayOnly || s.date === toISO(now);
        if (!slot || !slotState(slot, isToday, now).ok)
          e.slotId = "That slot is gone — pick another one.";
      }
    }
  }

  if (n === 5 && !s.payment) e.payment = "Choose how you'd like to pay.";

  return e;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

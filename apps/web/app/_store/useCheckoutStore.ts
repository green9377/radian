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

  ★ Five steps (locked, 14 July — sobuj)
    1 Your Details → 2 Who's Receiving → 3 Where → 4 When → 5 Payment

  "Where" and "When" are separate: writing an address and choosing a time are
  two different jobs for the mind. Together they make the card long, and people
  scroll past without picking a slot.

  ── WHAT IS PERSISTED ────────────────────────────────────────
  ✅ name · phone · country code · address → there is no Auth, so this
     localStorage is the "saved address" for now. No retyping on the next
     order.
  ❌ payment · step · date · slot → no. Yesterday's slot sitting there today
     means an order going out on the wrong date.

  ── NO PRICES HERE ───────────────────────────────────────────
  The same as D20. resolveCart() + quoteDelivery() + applyCoupon() do the
  arithmetic.
  ═══════════════════════════════════════════════════════════════════
*/

export const TOTAL_STEPS = 5;

export interface CheckoutState {
  /* Q1 — Your details */
  senderName: string;
  /** dial code — "+880" by default. Required for customers living abroad */
  senderDial: string;
  senderPhone: string;
  senderEmail: string;

  /* Q2 — Who's receiving + gift touches (D14) */
  isGift: boolean;
  recipientName: string;
  /** always a Bangladeshi number — no country code needed */
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

  /*  DEC-RTN-015 part 2 — store credit on this order. Deliberately NOT
      persisted: a one-time code must not survive the browser being closed and
      come back to be reused on somebody else's order.  */
  useStoreCredit: boolean;
  creditCode: string;
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

  isGift: true, // most of Radian's orders are gifts
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

  useStoreCredit: false,
  creditCode: "",
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
        After an order: name, phone and address stay (the next order is
        quicker), but gift message · slot · payment are cleared. If an old
        message survived, someone else's gift would go out next time carrying
        the previous person's name.
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
   Constitution: phone → +8801XXXXXXXXX.
   A sender's number may be from any country (they may live abroad), so the
   dial code is separate. A receiver is always in Bangladesh — so the BD rule
   only.
*/

/*
  The nine digits that actually identify a Bangladeshi mobile: 1, then the
  operator digit, then eight more. Everything before them is decoration.
*/
const BD_CORE = /^1[3-9]\d{8}$/;
const INTL_LOCAL = /^\d{6,14}$/;

/**
 * Strip everything a person might reasonably type in front of the number and
 * return the nine core digits, or null.
 *
 * The owner's rule (2 Sep): the field takes the number WITH the 0 or WITHOUT
 * it, and works out the rest itself. It used to demand the leading 0, so a
 * customer who typed 1519779378 — or pasted +8801519779378 out of WhatsApp —
 * was told their own number was invalid, at checkout, with a full cart.
 *
 * Accepted, all the same number:
 *   01519779378 · 1519779378 · 8801519779378 · +8801519779378 · 0088 01519 779378
 */
function bdCore(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  s = s.replace(/^00/, "");   // 00 = the international prefix, dialled aloud
  s = s.replace(/^880/, "");  // the country code, typed or pasted
  s = s.replace(/^0/, "");    // the trunk 0, which BD numbers are written with
  return BD_CORE.test(s) ? s : null;
}

/** Any dial code + what was typed → E.164, or null. */
export function normalizePhone(dial: string, raw: string): string | null {
  if (dial === DEFAULT_DIAL) {
    const core = bdCore(raw);
    return core ? dial + core : null;
  }

  // drop the leading 0 (trunk prefix) on a foreign number — +44 07... → +447...
  const local = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "").replace(/^0+/, "");
  return INTL_LOCAL.test(local) ? dial + local : null;
}

export function normalizeBdPhone(raw: string): string | null {
  const core = bdCore(raw);
  return core ? "+880" + core : null;
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
   * DEC-DLV-009 — the whole delivery row that was chosen on screen.
   *
   * ⚠️ **Required at step 4.** This used to read `getMethod(s.method)`, and
   * `s.method` is now a database row id — which never matches anything in the
   * hand-written list. On the miss it silently assumed "Same Day", then failed
   * to find the live slot in the hand-written `SLOTS` and said *"That slot is
   * gone"*. The result: **nobody could ever get past step 4, and not one order
   * could be placed.**
   *
   * Without it, the hand-written list below is searched (seed/demo), and on a
   * miss there it says plainly "Pick a delivery option." — never silently
   * assuming a different method.
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
        /*  ⚠️ Searches this method's **own** slots. `getSlot()` always searched
            the hand-written `SLOTS`, so picking a slot from the delivery
            module gave `null` — and this one line then blocked checkout
            forever.  */
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

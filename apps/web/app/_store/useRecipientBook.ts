"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
  ═══════════════════════════════════════════════════════════════════
  RECEIVER BOOK — যাদের এই device থেকে উপহার পাঠানো হয়েছে।

  মালিকের রায়, ৩ আগস্ট ২০২৬:
  > *"receiver-এর নাম আগে থেকে profile-এ save থাকলে option দেখাবে, সেখান
  >  থেকে select করবে — বা চাইলে নতুন receiver-এর information দেবে।"*

  ⚠️ কেন localStorage, server নয়। Server-এ খাতাটা আছেই — প্রতিটা gift
  order-এর প্রাপক Customer-এর `Recipient` তালিকায় জমা হয় (checkout.ts)।
  কিন্তু login ছাড়া সেটা পড়তে দেওয়া মানে: যে কেউ একটা ফোন নম্বর লিখলেই
  সেই মানুষের সব প্রিয়জনের নাম-ঠিকানা দেখে ফেলত। তাই যতদিন WhatsApp OTP
  login না আসে — এই device যা দেখেছে, এই device-ই মনে রাখে, আর কেউ নয়।
  Login এলে দুটো খাতা মিলে যাবে; component-এ একটা লাইনও বদলাবে না।

  ⚠️ ঠিকানা বা বার্তা রাখা হয় না — ইচ্ছা করে। ঠিকানা বদলায়, আর পুরনো
  বার্তা আরেকজনের উপহারে ভুল করে চলে যাওয়াটা ক্ষমার অযোগ্য। নাম আর ফোন —
  যেটুকু বাছাইয়ের কাজে লাগে, ঠিক সেটুকুই।
  ═══════════════════════════════════════════════════════════════════
*/

export interface SavedRecipient {
  name: string;
  /** যেভাবে টাইপ করা হয়েছিল — আবার সেভাবেই ঘরে বসবে */
  phone: string;
  /** শেষ কবে পাঠানো হয়েছে — নতুনরা তালিকার আগে */
  lastUsedAt: number;
}

interface RecipientBook {
  saved: SavedRecipient[];
  /** order সফল হলে ডাকা হয় — একই ফোন = পুরনোটা উপরে উঠে আসে, দুটো হয় না */
  remember: (r: { name: string; phone: string }) => void;
  forget: (phone: string) => void;
}

const MAX_SAVED = 8;

export const useRecipientBook = create<RecipientBook>()(
  persist(
    (set) => ({
      saved: [],
      remember: ({ name, phone }) =>
        set((s) => {
          const clean = phone.trim();
          if (!name.trim() || !clean) return s;
          const rest = s.saved.filter((x) => x.phone !== clean);
          return {
            saved: [
              { name: name.trim(), phone: clean, lastUsedAt: Date.now() },
              ...rest,
            ].slice(0, MAX_SAVED),
          };
        }),
      forget: (phone) =>
        set((s) => ({ saved: s.saved.filter((x) => x.phone !== phone) })),
    }),
    { name: "radian-recipients" },
  ),
);

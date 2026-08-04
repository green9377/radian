"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
  ═══════════════════════════════════════════════════════════════════
  ATTRIBUTION — MKT-D02-এর storefront-অর্ধেক।

  বিজ্ঞাপনের link-এ ?utm_source=facebook&utm_campaign=eid জাতীয় চিহ্ন থাকে,
  আর affiliate link-এ ?ref=CODE। Order-টেবিলে এদের ঘর জন্ম থেকে ছিল, আর
  schema-র মন্তব্য ছিল: *"Empty until the new storefront forwards them."*
  এই store-টা সেই forward-এর স্মৃতি।

  ⚠️ FIRST TOUCH জেতে, ইচ্ছাকৃতভাবে। গ্রাহক আজ Facebook বিজ্ঞাপন দেখে এলেন,
  কাল সরাসরি এসে কিনলেন — কৃতিত্ব বিজ্ঞাপনটার, কারণ সে-ই দোকান চিনিয়েছে।
  পরের দর্শনের চিহ্ন আগেরটাকে মুছলে যে campaign আসলে কাজ করে সেটা report-এ
  সবচেয়ে কম দেখাত। ৩০ দিনে স্মৃতি মুছে যায় — চিরকালের কৃতিত্বও মিথ্যা।

  ⚠️ এখানে কোনো ব্যক্তিগত তথ্য নেই — শুধু বিজ্ঞাপনের নিজের নামগুলো।
  ═══════════════════════════════════════════════════════════════════
*/

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refCode?: string;
  /** first touch কখন — মেয়াদের জন্য */
  at: number;
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface AttributionStore {
  current: Attribution | null;
  /** URL-এ চিহ্ন পেলে ডাকা হয় — আগেরটা তাজা থাকলে সে-ই থাকে (first touch) */
  capture: (a: Omit<Attribution, "at">) => void;
  /** order-এ পাঠানোর সময় — মেয়াদোত্তীর্ণ হলে null */
  read: () => Omit<Attribution, "at"> | null;
}

export const useAttribution = create<AttributionStore>()(
  persist(
    (set, get) => ({
      current: null,
      capture: (a) => {
        const has = a.utmSource || a.utmMedium || a.utmCampaign || a.refCode;
        if (!has) return;
        const cur = get().current;
        if (cur && Date.now() - cur.at < TTL_MS) return; // first touch দাঁড়িয়ে
        set({ current: { ...a, at: Date.now() } });
      },
      read: () => {
        const cur = get().current;
        if (!cur || Date.now() - cur.at >= TTL_MS) return null;
        const { at: _at, ...rest } = cur;
        return rest;
      },
    }),
    { name: "radian-attribution" },
  ),
);

/** পাতা খোলা মাত্র URL থেকে চিহ্ন তোলা — AttributionCapture এটাই ডাকে */
export function captureFromLocation() {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  useAttribution.getState().capture({
    utmSource: p.get("utm_source") ?? undefined,
    utmMedium: p.get("utm_medium") ?? undefined,
    utmCampaign: p.get("utm_campaign") ?? undefined,
    refCode: p.get("ref") ?? undefined,
  });
}

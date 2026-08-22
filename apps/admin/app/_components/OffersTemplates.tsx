"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import { Info } from "./ItemEditor";
import { createOffer } from "../_data/api";

/*
  Marketing · Offers → Templates.

  ⚠️ REBUILT 22 Aug 2026. The old list was a drawing: twelve cards, none of
  which did anything, and four of them named rewards the engine cannot pay —
  BOGO, tiered, free gift, bundle. Pressing one would have promised the
  customer something the checkout would never honour. Same fault as a "View on
  site" button pointing at a 404, and the same rule broken: nothing on a
  screen may claim more than the shop can do.

  Every preset below is one of the SIX shapes the offer engine actually
  applies (offers.service.ts): SITEWIDE · CATEGORY · PRODUCT · FIRST_ORDER ·
  PAYMENT · FREE_DELIVERY. Pressing one CREATES A REAL DRAFT through
  POST /offers and opens it in the editor, where the numbers get their final
  say. A draft goes nowhere near a customer until it is submitted — so a
  wrong press costs nothing.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

type Preset = {
  key: string;
  name: string;
  family: string;
  icon: string;
  what: string;
  tip: string;
  tint: { c: string; edge: string; bg: string };
  body: Record<string, unknown>;
};

const PURPLE = { c: "#470066", edge: "#6d3a9c", bg: "#f3ebf8" };
const ORCHID = { c: "#8b3fb0", edge: "#cf43ea", bg: "#f7eafc" };
const ROSE = { c: "#a4566a", edge: "#c9788a", bg: "#fbeef0" };
const SOFT = { c: "#5c3b8a", edge: "#8b6fc4", bg: "#efebf9" };

const PRESETS: Preset[] = [
  {
    key: "welcome",
    name: "Welcome the first order",
    family: "Bring them in",
    icon: "user",
    what: "৳100 off · first order only",
    tip: "Runs once per customer, and only while they have never ordered before. The engine checks both — the order count and whether they already used a welcome offer.",
    tint: PURPLE,
    body: {
      name: "Welcome — first order", mechanism: "AUTOMATIC", shape: "FIRST_ORDER",
      discountType: "FLAT", discountValue: 10000,
      publicTitle: "Welcome to Radian", benefitLine: "৳100 off your first order",
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "freedel-spend",
    name: "Free delivery over ৳2,000",
    family: "Bigger baskets",
    icon: "truck",
    what: "Delivery waived · min spend ৳2,000",
    tip: "The cart shows a “spend ৳X more and delivery is free” bar by itself once this is live — that bar is what moves the basket up.",
    tint: ORCHID,
    body: {
      name: "Free delivery over ৳2,000", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 200000,
      publicTitle: "Free delivery", benefitLine: "Free delivery on orders ৳2,000 and above",
      combinable: true,
    },
  },
  {
    key: "freedel-first",
    name: "First order, free delivery",
    family: "Bring them in",
    icon: "gift",
    what: "Delivery waived · first order only",
    tip: "Cheaper for the shop than money off, and it removes the objection people actually hesitate on.",
    tint: PURPLE,
    body: {
      name: "First order — free delivery", mechanism: "AUTOMATIC", shape: "FIRST_ORDER",
      discountType: "FREE_DELIVERY", discountValue: 0,
      publicTitle: "Free delivery on your first order", benefitLine: "We will bring your first gift for free",
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "product",
    name: "Free delivery on chosen products",
    family: "Move specific stock",
    icon: "tag",
    what: "Delivery waived · picked products",
    tip: "Only fires when one of the chosen products is in the cart. Pick the products in the editor after this is created.",
    tint: ROSE,
    body: {
      name: "Free delivery on selected products", mechanism: "AUTOMATIC", shape: "PRODUCT",
      discountType: "FREE_DELIVERY", discountValue: 0,
      publicTitle: "Free delivery", benefitLine: "Free delivery on this one",
      combinable: true,
    },
  },
  {
    key: "category",
    name: "Percentage off one category",
    family: "Move specific stock",
    icon: "layers",
    what: "10% off · one category",
    tip: "The discount is worked out on the matching lines only, not the whole cart. Choose the category in the editor.",
    tint: ROSE,
    body: {
      name: "10% off a category", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1000,
      publicTitle: "10% off", benefitLine: "10% off this collection",
      combinable: false,
    },
  },
  {
    key: "coupon",
    name: "A coupon code",
    family: "Campaigns",
    icon: "hash",
    what: "15% off · customer types the code",
    tip: "Nothing happens until the customer types the code at checkout. Set the code, the cap and the dates in the editor.",
    tint: ORCHID,
    body: {
      name: "Coupon — 15% off", mechanism: "COUPON", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1500, code: "RADIAN15",
      maxDiscountPaisa: 50000,
      publicTitle: "15% off with code", benefitLine: "Use code RADIAN15",
      combinable: false,
    },
  },
  {
    key: "payment",
    name: "Pay by bKash, save",
    family: "Cheaper money",
    icon: "cash",
    what: "5% off · paying by bKash",
    tip: "Only applies when that payment method is chosen. Useful for steering people onto the method that costs the shop least.",
    tint: SOFT,
    body: {
      name: "bKash — 5% off", mechanism: "AUTOMATIC", shape: "PAYMENT",
      discountType: "PERCENT", discountValue: 500, paymentMethod: "bkash",
      maxDiscountPaisa: 30000,
      publicTitle: "5% off with bKash", benefitLine: "Save 5% paying with bKash",
      combinable: false,
    },
  },
  {
    key: "festival",
    name: "Festival week, whole shop",
    family: "Campaigns",
    icon: "star",
    what: "15% off · everything, dated",
    tip: "Set the start and end dates in the editor and it switches itself on and off. Nobody has to remember to end it.",
    tint: SOFT,
    body: {
      name: "Festival — 15% off", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1500, maxDiscountPaisa: 100000,
      publicTitle: "Festival special", benefitLine: "15% off across the shop",
      combinable: false,
    },
  },
];

export default function OffersTemplates() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function use(p: Preset) {
    setBusy(p.key);
    setErr(null);
    try {
      const created = await createOffer(p.body);
      const id = (created as { id?: string })?.id;
      if (!id) throw new Error("The offer was not created.");
      router.push(`/marketing/offers/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create that offer.");
      setBusy(null);
    }
  }

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Offers · templates
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <h1 className="font-display text-[28px] text-purple m-0 leading-tight">Start from a template</h1>
            <Info text="Each one creates a real DRAFT offer and opens it for you to set the numbers. A draft reaches no customer until you submit it, so pressing one costs nothing." />
          </div>
        </div>
        <Link href="/marketing/offers/list"
          className="border-2 border-lavender-deep bg-white text-purple text-[14px] font-bold px-5 py-3 rounded-[12px] hover:border-orchid shrink-0">
          All offers
        </Link>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span className="font-semibold">{err}</span>
          <button className="underline shrink-0 font-semibold" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PRESETS.map((p) => (
          <div key={p.key}
            className="relative rounded-[18px] border border-white/70 shadow-soft overflow-hidden p-5 flex flex-col"
            style={{ background: `linear-gradient(150deg,${p.tint.bg},#ffffff 130%)` }}>
            <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: p.tint.edge }} />

            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-white shrink-0"
                style={{ background: p.tint.edge, boxShadow: `0 3px 10px ${p.tint.edge}45` }}>
                <Icon name={p.icon} size={16} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: p.tint.c, opacity: 0.6 }}>
                {p.family}
              </span>
              <span className="ml-auto"><Info text={p.tip} /></span>
            </div>

            <div className="font-display text-[18px] leading-tight mb-1.5" style={{ color: p.tint.c }}>
              {p.name}
            </div>
            <div className="text-[13px] font-semibold mb-4" style={{ color: p.tint.c, opacity: 0.7 }}>
              {p.what}
            </div>

            <button
              type="button"
              onClick={() => use(p)}
              disabled={!!busy}
              className="mt-auto w-full text-white text-[14px] font-bold py-3 rounded-[12px] disabled:opacity-40 transition-all"
              style={{ background: p.tint.edge, boxShadow: `0 4px 14px ${p.tint.edge}45` }}>
              {busy === p.key ? "Creating…" : "Use this"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

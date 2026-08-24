"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import { Info } from "./ItemEditor";
import { createOffer } from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  Marketing · Offers → Templates — the Grand Slam Offer shelf

  ⚠️ REBUILT TWICE. Read both notes before changing anything here.

  22 Aug 2026 — the first list was a drawing: twelve cards, none of which did
  anything, four of them naming rewards the engine cannot pay (BOGO, tiered,
  free gift, bundle). Pressing one would have promised a customer something
  checkout could never honour. That rule still stands: every preset below is
  one of the SIX shapes `offers.service.ts` actually applies — SITEWIDE ·
  CATEGORY · PRODUCT · FIRST_ORDER · PAYMENT · FREE_DELIVERY.

  24 Aug 2026 — the owner: *"amder admin panel offer template a amra Alex
  Hormozi ar 100M Offers k follow kre template banai rakhbo, jkhon jeta mon
  chay sevabe offer banabo."* And he is holding the project to its own
  decision: `RADIAN_ADMIN_PROGRESS.md` §5b says "Grand Slam Offer / Hormozi
  framework", and DEC-OFR-007 put `bonusLines` and `guaranteeText` on the
  Offer for exactly this reason. The fields were built. Nothing filled them.

  Every preset here now ships the whole stack, not a bare discount:

      VALUE  =  Dream outcome  ×  Perceived likelihood
                ─────────────────────────────────────
                  Time delay   ×   Effort & sacrifice

  A discount only touches the price. The four levers are what the offer is
  actually made of, so each template says which one it pulls, and arrives
  carrying:

    · a NAMED offer            (publicTitle — an offer with a name is a thing;
                                "10% off" is a number)
    · the dream outcome        (benefitLine — what they get, not what we take off)
    · BONUSES                  (bonusLines — each one kills the next objection)
    · a GUARANTEE              (guaranteeText — risk moves from them to us)
    · URGENCY where it is real (an end date, or the scarcity counter)

  ⚠️ WHY THIS SHOP'S BEST LEVER IS **TIME DELAY**, not price. Radian's whole
  promise is 2 hours, same day, midnight. A florist who halves the delay has
  moved the bottom of that equation, which is worth more than another 5% off
  and costs the margin nothing. Most of these templates pull that lever.

  ⚠️ THE WORDS ARE PLACEHOLDERS, DELIBERATELY. "Fresh on arrival or we send
  another" is a promise the SHOP makes, not a sentence I get to invent for it
  (house rule 2). Every template opens in the editor before it can go live —
  read every line and make it yours.

  ⚠️ KNOWN GAP, 24 Aug 2026: `shop/product-detail.ts` does not yet SELECT
  `bonusLines`, `guaranteeText` or `scarcity`, so today the storefront prints
  only the benefit line. The owner knows and has parked it — the templates
  come first, the storefront after. Do not "fix" a template by deleting its
  stack; fix the query.
  ═══════════════════════════════════════════════════════════════════════════
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/** Which half of the value equation this offer moves. */
type Lever = "Dream outcome" | "Likelihood" | "Time delay" | "Effort";

const LEVER_TIP: Record<Lever, string> = {
  "Dream outcome": "Makes the result bigger — the moment lands harder than they hoped. The top of the equation.",
  Likelihood: "Makes them believe it will work. Guarantees, proof, a real shop with a real address. Also the top.",
  "Time delay": "Shortens the wait between paying and the moment. Radian's strongest lever by far — and it costs no margin.",
  Effort: "Takes work off them. We write the card, we choose, we photograph it, they do nothing. The bottom of the equation.",
};

type Preset = {
  key: string;
  name: string;
  family: string;
  lever: Lever;
  icon: string;
  what: string;
  tip: string;
  tint: { c: string; edge: string; bg: string };
  /** urgency: the draft is created ending this many days from today */
  days?: number;
  body: Record<string, unknown>;
};

const PURPLE = { c: "#470066", edge: "#6d3a9c", bg: "#f3ebf8" };
const ORCHID = { c: "#8b3fb0", edge: "#cf43ea", bg: "#f7eafc" };
const ROSE = { c: "#a4566a", edge: "#c9788a", bg: "#fbeef0" };
const SOFT = { c: "#5c3b8a", edge: "#8b6fc4", bg: "#efebf9" };

const PRESETS: Preset[] = [
  /* ── TIME DELAY ─────────────────────────────────────────────────────── */
  {
    key: "rescue-2h",
    name: "The Two-Hour Rescue",
    family: "For the one who forgot",
    lever: "Time delay",
    icon: "bolt",
    what: "Delivery free · 3 bonuses · on-time guarantee",
    tip: "Built for the person who remembered at 6pm. The discount is not the point — the point is that panic ends in two hours, and the guarantee is what makes them believe it. Hormozi: shrink the time delay, then remove the risk of it being late.",
    tint: ORCHID,
    body: {
      name: "Two-Hour Rescue", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 150000,
      publicTitle: "The Two-Hour Rescue",
      benefitLine: "Forgot? It can still be in their hands in 2 hours — delivery on us",
      description: "Order before the evening cut-off and we hand-deliver inside Dhaka within two hours.",
      bonusLines: [
        "Handwritten card, in your words",
        "A photo of the bouquet before it leaves the shop",
        "We ring the receiver first if nobody is home",
      ],
      guaranteeText: "Later than we promised? The delivery is free.",
      combinable: false,
    },
  },
  {
    key: "midnight",
    name: "Midnight Surprise",
    family: "For the big date",
    lever: "Dream outcome",
    icon: "moon",
    what: "Midnight delivery free · 3 bonuses · bold guarantee",
    tip: "Nobody else in their life is delivering flowers at 12:01am. That is the dream outcome — not the flowers, the moment. The guarantee is deliberately bold because the whole offer dies if it arrives at 1am.",
    tint: PURPLE,
    body: {
      name: "Midnight Surprise", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 200000,
      publicTitle: "Midnight Surprise — the first thing they see",
      benefitLine: "It reaches them at 12:01am. Midnight delivery, free.",
      description: "The birthday starts with your gift already in their hands.",
      bonusLines: [
        "Handwritten card, in your words",
        "A photo the moment it is handed over",
        "Send it anonymously if you want them guessing",
      ],
      guaranteeText: "Not delivered by 12:30am? Your whole order is free.",
      scarcity: true,
      combinable: false,
    },
  },
  {
    key: "sameday-week",
    name: "Same-day, all week",
    family: "For the one who forgot",
    lever: "Time delay",
    icon: "truck",
    what: "Free same-day over ৳2,000 · ends in 7 days",
    tip: "A deadline the shop can actually keep, on a promise it already delivers. Urgency only works when it is real — this one ends in seven days because it was written to end, not to run forever until nobody notices it.",
    tint: SOFT,
    days: 7,
    body: {
      name: "Same-day week", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 200000,
      publicTitle: "Same-day delivery, this week only",
      benefitLine: "Order today, it arrives today — delivery free over ৳2,000",
      bonusLines: ["Handwritten card", "Photo before it leaves the shop"],
      guaranteeText: "Fresh on arrival or we send another, free.",
      scarcity: true,
      combinable: false,
    },
  },

  /* ── LIKELIHOOD ─────────────────────────────────────────────────────── */
  {
    key: "welcome",
    name: "Your first gift, our risk",
    family: "Bring them in",
    lever: "Likelihood",
    icon: "user",
    what: "৳150 off first order · 3 bonuses · full refund promise",
    tip: "A stranger's real objection is not price, it is 'will these people actually turn up'. So the offer answers that instead: the money is small, the promise is total. Runs once per customer and only while they have never ordered.",
    tint: PURPLE,
    body: {
      name: "Welcome — first order", mechanism: "AUTOMATIC", shape: "FIRST_ORDER",
      discountType: "FLAT", discountValue: 15000,
      publicTitle: "Your first gift, at our risk",
      benefitLine: "৳150 off — and if it does not arrive the way we promised, you pay nothing",
      description: "First time with Radian. We would rather lose the order than your trust.",
      bonusLines: [
        "Handwritten card, in your words",
        "A photo of your gift before it leaves",
        "Pick the delivery slot yourself",
      ],
      guaranteeText: "Not fresh, not on time, or not what you saw? Tell us the same day and we refund it in full.",
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "fresh-or-free",
    name: "Fresh or it is free",
    family: "Answer the doubt",
    lever: "Likelihood",
    icon: "shield",
    what: "5% off shop-wide · the guarantee IS the offer",
    tip: "The discount is small on purpose — it is there because the engine needs a benefit to apply, not because 5% sells anything. What sells is the sentence underneath it. Hormozi's rule: the bigger the guarantee, the smaller the discount needs to be.",
    tint: ROSE,
    body: {
      name: "Fresh or free", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 500,
      publicTitle: "Fresh on arrival, or it is free",
      benefitLine: "Every stem hand-picked the same morning — 5% off while you are here",
      description: "We buy at dawn and arrange to order. Nothing sits in a fridge for three days.",
      bonusLines: [
        "A photo of the real bouquet before it leaves",
        "Handwritten card, in your words",
      ],
      guaranteeText: "If a single stem arrives wilted, send us the photo — we deliver a fresh one the same day, free.",
      combinable: true,
    },
  },

  /* ── EFFORT & SACRIFICE ─────────────────────────────────────────────── */
  {
    key: "bkash",
    name: "Pay the easy way",
    family: "Take the work away",
    lever: "Effort",
    icon: "wallet",
    what: "10% back on bKash · capped ৳200",
    tip: "Most people in Bangladesh already have bKash open. Paying with what is in their hand removes a step, and the cap keeps the promotion from running away on a large order.",
    tint: ORCHID,
    body: {
      name: "bKash — 10% back", mechanism: "AUTOMATIC", shape: "PAYMENT",
      paymentMethod: "bkash",
      discountType: "PERCENT", discountValue: 1000, maxDiscountPaisa: 20000,
      publicTitle: "Pay with bKash, keep 10%",
      benefitLine: "10% off when you pay with bKash — up to ৳200",
      bonusLines: ["No card, no cash, no waiting for a rider to make change"],
      guaranteeText: "Payment problem? We hold your slot for an hour while it sorts itself out.",
      combinable: false,
    },
  },
  {
    key: "done-for-you",
    name: "We will choose for them",
    family: "Take the work away",
    lever: "Effort",
    icon: "gem",
    what: "৳200 off a picked category · 3 bonuses",
    tip: "Some people do not want to browse forty bouquets — they want it handled. Point this at your best category and let the offer say so. The bonuses ARE the offer here; the ৳200 is almost incidental.",
    tint: SOFT,
    body: {
      name: "Done for you", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "FLAT", discountValue: 20000,
      publicTitle: "Tell us the occasion. We will do the rest.",
      benefitLine: "৳200 off — and we choose, wrap, write and deliver it for you",
      description: "You pick the moment and the budget. Our florist picks the flowers.",
      bonusLines: [
        "Our florist chooses what is freshest that morning",
        "Handwritten card, in your words",
        "A photo before it leaves, so you know what arrived",
      ],
      guaranteeText: "Not happy with what we chose? We remake it, free.",
      combinable: false,
    },
  },

  /* ── DREAM OUTCOME · URGENCY ────────────────────────────────────────── */
  {
    key: "occasion-week",
    name: "Occasion week",
    family: "For the season",
    lever: "Dream outcome",
    icon: "sparkle",
    what: "15% off one category · ends in 7 days",
    tip: "Point it at the category the season is about — roses for Valentine's, yellow for Pahela Falgun. A real end date is what makes it move; an offer with no deadline is a price change wearing a badge.",
    tint: ROSE,
    days: 7,
    body: {
      name: "Occasion week", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "Occasion week at Radian",
      benefitLine: "15% off — this week only",
      bonusLines: ["Handwritten card", "Free photo before it leaves the shop"],
      guaranteeText: "Fresh on arrival or we send another, free.",
      scarcity: true, combinable: false,
    },
  },
  {
    key: "hero-product",
    name: "Push one bouquet",
    family: "For the season",
    lever: "Dream outcome",
    icon: "star",
    what: "20% off chosen products · 2 bonuses",
    tip: "For the one arrangement you want everybody talking about. Pick the products in the editor. Keep the list short — an offer on forty products is a sale, and a sale teaches people to wait for the next one.",
    tint: PURPLE,
    body: {
      name: "Hero product push", mechanism: "AUTOMATIC", shape: "PRODUCT",
      discountType: "PERCENT", discountValue: 2000,
      publicTitle: "Our florist's favourite this week",
      benefitLine: "20% off the one we are proudest of",
      bonusLines: ["Handwritten card", "A photo before it leaves the shop"],
      guaranteeText: "Fresh on arrival or we send another, free.",
      combinable: false,
    },
  },
  {
    key: "winback",
    name: "Win them back",
    family: "Bring them in",
    lever: "Likelihood",
    icon: "heart",
    what: "Coupon · one per customer · ends in 14 days",
    tip: "A code you hand out deliberately — to somebody who ordered once and went quiet, or to a group you are writing to. One per customer, and it expires, so it cannot leak into a permanent discount.",
    tint: ORCHID,
    days: 14,
    body: {
      name: "Win-back coupon", mechanism: "COUPON", shape: "SITEWIDE",
      code: "COMEBACK",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "We kept your favourite in mind",
      benefitLine: "15% off with code COMEBACK",
      bonusLines: ["Handwritten card", "Photo before it leaves the shop"],
      guaranteeText: "Fresh on arrival or we send another, free.",
      perCustomerLimit: 1, combinable: false,
    },
  },
];

/*  Presets that carry urgency are created ENDING a few days out, counted from
    the day the button is pressed. A fixed date in the source would be in the
    past within a fortnight, and an expired template is worse than none.  */
function bodyFor(p: Preset): Record<string, unknown> {
  if (!p.days) return p.body;
  const end = new Date();
  end.setDate(end.getDate() + p.days);
  end.setHours(23, 59, 0, 0);
  return { ...p.body, endsAt: end.toISOString() };
}

/** what the draft arrives carrying — read off the body, never typed twice */
function stackOf(p: Preset) {
  const b = p.body as { bonusLines?: string[]; guaranteeText?: string; scarcity?: boolean };
  return {
    bonuses: b.bonusLines?.length ?? 0,
    guarantee: Boolean(b.guaranteeText),
    urgency: Boolean(p.days) || Boolean(b.scarcity),
  };
}

export default function OffersTemplates() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function use(p: Preset) {
    setBusy(p.key);
    setErr(null);
    try {
      const created = await createOffer(bodyFor(p));
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
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Offers · templates
          </div>
          <div className="flex items-center gap-2.5 mt-1.5">
            <h1 className="font-display text-[28px] text-purple m-0 leading-tight">Start from a template</h1>
            <Info text="Every one of these is a Grand Slam Offer, not a discount: a named offer, the outcome in one line, bonuses that answer the next objection, a guarantee that moves the risk to us, and a deadline where the deadline is real. Pressing one creates a DRAFT and opens it — a draft reaches no customer until you submit it, so a wrong press costs nothing." />
          </div>
        </div>
        <Link href="/marketing/offers/list"
          className="border-2 border-lavender-deep bg-white text-purple text-[14px] font-bold px-5 py-3 rounded-full hover:border-orchid shrink-0">
          All offers
        </Link>
      </div>

      {/*  The equation itself, once, at the top — it is the reason the cards
           are grouped the way they are, and it is four words per lever, not a
           paragraph.  */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-6">
        {(Object.keys(LEVER_TIP) as Lever[]).map((lv) => {
          const tint = lv === "Dream outcome" ? PURPLE : lv === "Likelihood" ? ROSE : lv === "Time delay" ? ORCHID : SOFT;
          const n = PRESETS.filter((p) => p.lever === lv).length;
          return (
            <div key={lv} className="relative rounded-[16px] border border-white/70 shadow-soft overflow-hidden px-4 py-3.5"
              style={{ background: `linear-gradient(150deg,${tint.bg},#ffffff 130%)` }}>
              <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: tint.edge }} />
              <div className="flex items-center justify-between gap-2">
                <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-white shrink-0"
                  style={{ background: tint.edge, boxShadow: `0 3px 9px ${tint.edge}45` }}>
                  <Icon name={lv === "Time delay" ? "clock" : lv === "Likelihood" ? "shield" : lv === "Effort" ? "tools" : "gem"} size={14} />
                </span>
                <Info text={LEVER_TIP[lv]} />
              </div>
              <div className="font-display text-[16px] leading-tight mt-3" style={{ color: tint.c }}>{lv}</div>
              <div className="text-[12px] font-semibold mt-1" style={{ color: tint.c, opacity: 0.65 }}>
                {n} template{n === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span className="font-semibold">{err}</span>
          <button className="underline shrink-0 font-semibold" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {PRESETS.map((p) => {
          const st = stackOf(p);
          return (
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
              <div className="text-[13px] font-semibold mb-3" style={{ color: p.tint.c, opacity: 0.7 }}>
                {p.what}
              </div>

              {/*  What is actually in the box, before pressing. A template that
                   says "3 bonuses" and hands over a bare discount is the kind
                   of promise this file exists to stop.  */}
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full"
                  style={{ background: `${p.tint.edge}22`, color: p.tint.c }}>
                  {p.lever}
                </span>
                {st.bonuses > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full"
                    style={{ background: "#ffffff", color: p.tint.c }}>
                    <Icon name="plus" size={10} /> {st.bonuses} bonus{st.bonuses === 1 ? "" : "es"}
                  </span>
                )}
                {st.guarantee && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full"
                    style={{ background: "#ffffff", color: p.tint.c }}>
                    <Icon name="shield" size={10} /> guarantee
                  </span>
                )}
                {st.urgency && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full"
                    style={{ background: "#ffffff", color: p.tint.c }}>
                    <Icon name="clock" size={10} /> {p.days ? `${p.days} days` : "urgency"}
                  </span>
                )}
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
          );
        })}
      </div>
    </div>
  );
}

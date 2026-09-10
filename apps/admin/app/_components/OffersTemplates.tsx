"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import { Info } from "./ItemEditor";
import { createOffer } from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  Marketing · Offers → Templates — the shelf

  ⚠️ REBUILT THREE TIMES. Read all three notes before changing anything.

  22 Aug 2026 — the first list was a drawing: twelve cards, none of which did
  anything, four of them naming rewards the engine cannot pay (BOGO, tiered,
  free gift, bundle). Pressing one would have promised a customer something
  checkout could never honour.

  24 Aug 2026 (morning) — the owner held the project to its own decision:
  §5b of RADIAN_ADMIN_PROGRESS says "Grand Slam Offer / Hormozi framework",
  and DEC-OFR-007 put `bonusLines` and `guaranteeText` on the Offer for that
  reason. The fields had been built in July and never filled. Every preset
  now ships the whole stack.

  24 Aug 2026 (evening) — the owner: *"amder industry ar te je je type ar
  offer hote pare, and evergreen ar je je type ar offer lagbe — present and
  future, tmi sob template banaw."* So this is no longer a starter set. It is
  the shelf: every archetype a flower and gift shop in Bangladesh runs, and
  the calendar it runs them on.

  ── THE RULE THAT DOES NOT BEND ────────────────────────────────────────────
  Every preset must be one of the SIX shapes `offers.service.ts` actually
  applies: SITEWIDE · CATEGORY · PRODUCT · FIRST_ORDER · PAYMENT ·
  FREE_DELIVERY. Nothing here may need a shape the checkout cannot pay. What
  the engine cannot do yet is listed on the screen instead, by name — see
  `CANNOT_YET`. A missing feature named honestly is worth more than a card
  that lies.

  ── WHY THE STACK, NOT THE DISCOUNT ────────────────────────────────────────
      VALUE  =  Dream outcome  ×  Perceived likelihood
                ─────────────────────────────────────
                  Time delay   ×   Effort & sacrifice

  A discount only touches price. Each template says which lever it pulls and
  arrives carrying a named offer, the outcome in one line, bonuses that kill
  the next objection, a guarantee that moves risk to us, and a real deadline
  where urgency is real.

  ⚠️ TIME DELAY IS THIS SHOP'S BEST LEVER and most templates pull it. Radian's
  promise is two hours, same day, midnight. Halving the wait moves the bottom
  of that equation and costs the margin nothing; another 5% off costs margin
  and moves nobody.

  ⚠️ NO FIXED CALENDAR DATES IN THIS FILE. An occasion preset carries `days`
  and is created ending that many days from the press. A hard-coded "14 Feb"
  is in the past by March and an expired template is worse than none — the
  tip tells the owner when to reach for it, the editor takes the exact dates.

  ⚠️ EVERY SENTENCE HERE IS A PLACEHOLDER. "Fresh on arrival or we send
  another" is a promise the SHOP makes, not one I may invent for it (house
  rule 2). Each template opens in the editor before it can go live.

  ⚠️ KNOWN GAP: `shop/product-detail.ts` does not yet select `bonusLines`,
  `guaranteeText` or `scarcity`, so today the storefront prints only the
  benefit line. The owner has parked that deliberately. Do NOT "fix" a
  template by deleting its stack; fix the query.
  ═══════════════════════════════════════════════════════════════════════════
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/** Which half of the value equation this offer moves. */
type Lever = "Dream outcome" | "Likelihood" | "Time delay" | "Effort";

const LEVER_TIP: Record<Lever, string> = {
  "Dream outcome": "Makes the result bigger — the moment lands harder than they hoped.",
  Likelihood: "Makes them believe it will work: guarantees, proof, a real shop with a real address.",
  "Time delay": "Shortens the wait between paying and the moment. Radian's strongest lever, and it costs no margin.",
  Effort: "Takes the work off them. We choose, we write the card, we photograph it. They do nothing.",
};

/** What the offer is FOR — how the owner will actually look for one. */
type Group = "Evergreen" | "Occasion" | "Bigger basket" | "Move stock" | "Bring them back" | "Corporate";

const GROUPS: Group[] = ["Evergreen", "Occasion", "Bigger basket", "Move stock", "Bring them back", "Corporate"];

type Preset = {
  key: string;
  name: string;
  family: string;
  group: Group;
  lever: Lever;
  icon: string;
  what: string;
  tip: string;
  tint: { c: string; edge: string; bg: string };
  /** urgency: the draft is created ending this many days from today */
  days?: number;
  body: Record<string, unknown>;
};

const PURPLE = { c: "#ce6ef7", edge: "#6d3a9c", bg: "#2c1e34" };
const ORCHID = { c: "#bb87d4", edge: "#cf43ea", bg: "#30183a" };
const ROSE = { c: "#c794a1", edge: "#c9788a", bg: "#361b1f" };
const SOFT = { c: "#ad94d1", edge: "#8b6fc4", bg: "#241d35" };

/*  Two lines every flower shop repeats, kept in one place so twenty presets
    cannot drift into twenty slightly different promises. Both are the OWNER's
    to rewrite — they are here as a starting sentence, not a house rule.  */
const CARD = "Handwritten card, in your words";
const PHOTO = "A photo of the real bouquet before it leaves the shop";
const FRESH = "Fresh on arrival or we send another, free.";

const PRESETS: Preset[] = [
  /* ══ EVERGREEN — always on ═════════════════════════════════════════════ */
  {
    key: "rescue-2h",
    name: "The Two-Hour Rescue",
    family: "For the one who forgot",
    group: "Evergreen",
    lever: "Time delay",
    icon: "bolt",
    what: "Delivery free · 3 bonuses · on-time guarantee",
    tip: "For the person who remembered at 6pm. The discount is not the point — the point is that panic ends in two hours, and the guarantee is what makes them believe it. Leave this one running all year.",
    tint: ORCHID,
    body: {
      name: "Two-Hour Rescue", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 150000,
      publicTitle: "The Two-Hour Rescue",
      benefitLine: "Forgot? It can still be in their hands in 2 hours — delivery on us",
      description: "Order before the evening cut-off and we hand-deliver inside Dhaka within two hours.",
      bonusLines: [CARD, PHOTO, "We ring the receiver first if nobody is home"],
      guaranteeText: "Later than we promised? The delivery is free.",
      combinable: false,
    },
  },
  {
    key: "midnight",
    name: "Midnight Surprise",
    family: "For the big date",
    group: "Evergreen",
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
      bonusLines: [CARD, "A photo the moment it is handed over", "Send it anonymously if you want them guessing"],
      guaranteeText: "Not delivered by 12:30am? Your whole order is free.",
      scarcity: true, combinable: false,
    },
  },
  {
    key: "welcome",
    name: "Your first gift, our risk",
    family: "Bring them in",
    group: "Evergreen",
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
      bonusLines: [CARD, PHOTO, "Pick the delivery slot yourself"],
      guaranteeText: "Not fresh, not on time, or not what you saw? Tell us the same day and we refund it in full.",
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "fresh-or-free",
    name: "Fresh or it is free",
    family: "Answer the doubt",
    group: "Evergreen",
    lever: "Likelihood",
    icon: "shield",
    what: "5% off shop-wide · the guarantee IS the offer",
    tip: "The discount is small on purpose — it is there because the engine needs a benefit to apply, not because 5% sells anything. What sells is the sentence underneath. Hormozi's rule: the bigger the guarantee, the smaller the discount needs to be.",
    tint: ROSE,
    body: {
      name: "Fresh or free", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 500,
      publicTitle: "Fresh on arrival, or it is free",
      benefitLine: "Every stem hand-picked the same morning — 5% off while you are here",
      description: "We buy at dawn and arrange to order. Nothing sits in a fridge for three days.",
      bonusLines: [PHOTO, CARD],
      guaranteeText: "If a single stem arrives wilted, send us the photo — we deliver a fresh one the same day, free.",
      combinable: true,
    },
  },
  {
    key: "done-for-you",
    name: "We will choose for them",
    family: "Take the work away",
    group: "Evergreen",
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
      bonusLines: ["Our florist chooses what is freshest that morning", CARD, PHOTO],
      guaranteeText: "Not happy with what we chose? We remake it, free.",
      combinable: false,
    },
  },
  {
    key: "bkash",
    name: "Pay with bKash, keep 10%",
    family: "Take the work away",
    group: "Evergreen",
    lever: "Effort",
    icon: "wallet",
    what: "10% back on bKash · capped ৳200",
    tip: "Most people here already have bKash open. Paying with what is in their hand removes a step. The cap stops the promotion running away on a large order.",
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
    key: "nagad",
    name: "Pay with Nagad, keep 10%",
    family: "Take the work away",
    group: "Evergreen",
    lever: "Effort",
    icon: "wallet",
    what: "10% back on Nagad · capped ৳200",
    tip: "The same offer for the other wallet. Run both or run one — but if only one is live, the customer who uses the other reads it as 'not for me'.",
    tint: SOFT,
    body: {
      name: "Nagad — 10% back", mechanism: "AUTOMATIC", shape: "PAYMENT",
      paymentMethod: "nagad",
      discountType: "PERCENT", discountValue: 1000, maxDiscountPaisa: 20000,
      publicTitle: "Pay with Nagad, keep 10%",
      benefitLine: "10% off when you pay with Nagad — up to ৳200",
      bonusLines: ["No card, no cash, no waiting for a rider to make change"],
      guaranteeText: "Payment problem? We hold your slot for an hour while it sorts itself out.",
      combinable: false,
    },
  },
  {
    key: "prepay",
    name: "Pay now, save",
    family: "Protect the margin",
    group: "Evergreen",
    lever: "Effort",
    icon: "lock",
    what: "5% off when paid online, not on delivery",
    tip: "Cash on delivery costs this shop real money — a rider carrying change, a refused parcel, cash sitting out overnight. Paying a few percent to move orders onto prepaid is usually cheaper than the COD failures, and this is how you find out.",
    tint: PURPLE,
    body: {
      name: "Prepaid discount", mechanism: "AUTOMATIC", shape: "PAYMENT",
      paymentMethod: "online",
      discountType: "PERCENT", discountValue: 500, maxDiscountPaisa: 30000,
      publicTitle: "Pay now, save 5%",
      benefitLine: "5% off when you pay online instead of on delivery",
      bonusLines: ["Your slot is locked the moment it is paid", "No cash to find when the rider knocks"],
      guaranteeText: "Order does not arrive? Refunded in full, same day.",
      combinable: false,
    },
  },

  /* ══ BIGGER BASKET ═════════════════════════════════════════════════════ */
  {
    key: "freedel-spend",
    name: "Free delivery over ৳2,000",
    family: "Lift the basket",
    group: "Bigger basket",
    lever: "Time delay",
    icon: "truck",
    what: "Delivery waived · min spend ৳2,000",
    tip: "The cart shows a 'spend ৳X more and delivery is free' bar by itself once this is live — that bar is what moves the basket up. Set the threshold a little above your average order, not far above it.",
    tint: ORCHID,
    body: {
      name: "Free delivery over ৳2,000", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 200000,
      publicTitle: "Free delivery",
      benefitLine: "Delivery is on us on orders ৳2,000 and above",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      combinable: true,
    },
  },
  {
    key: "spend-save",
    name: "Spend more, save more",
    family: "Lift the basket",
    group: "Bigger basket",
    lever: "Dream outcome",
    icon: "chart",
    what: "10% off over ৳3,000 · capped ৳500",
    tip: "One step, not a ladder — the engine applies one offer at a time, so a three-tier staircase would quietly collapse to its best rung. If you want two steps, make two offers with different minimum spends and let the bigger one win.",
    tint: SOFT,
    body: {
      name: "Spend ৳3,000 save 10%", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1000, minSpendPaisa: 300000, maxDiscountPaisa: 50000,
      publicTitle: "Make it a bigger moment",
      benefitLine: "10% off when you spend ৳3,000 or more",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      combinable: false,
    },
  },
  {
    key: "sameday-week",
    name: "Same-day, all week",
    family: "Lift the basket",
    group: "Bigger basket",
    lever: "Time delay",
    icon: "truck",
    what: "Free same-day over ৳2,000 · ends in 7 days",
    tip: "A deadline the shop can actually keep, on a promise it already delivers. Urgency only works when it is real — this one ends because it was written to end, not to run forever until nobody notices it.",
    tint: SOFT,
    days: 7,
    body: {
      name: "Same-day week", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0, minSpendPaisa: 200000,
      publicTitle: "Same-day delivery, this week only",
      benefitLine: "Order today, it arrives today — delivery free over ৳2,000",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },

  /* ══ OCCASION — the Bangladesh calendar ════════════════════════════════ */
  {
    key: "valentine",
    name: "Valentine's week",
    family: "14 February",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "heart",
    what: "15% off roses · ends in 10 days · book ahead",
    tip: "The biggest week of the year for this shop. Press it around the 4th so the pre-booking window is open — most of the money is made by people ordering early, not on the day itself, and early orders are the ones you can actually fulfil.",
    tint: ROSE,
    days: 10,
    body: {
      name: "Valentine's week", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "Say it with roses this Valentine's",
      benefitLine: "15% off roses — order early, we deliver on the day",
      description: "Book now for the 14th and we hold your slot.",
      bonusLines: [CARD, PHOTO, "Pick the exact hour it should arrive"],
      guaranteeText: "Not delivered on the 14th? Your whole order is free.",
      scarcity: true, combinable: false,
    },
  },
  {
    key: "falgun",
    name: "Pohela Falgun",
    family: "13 February",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "flower",
    what: "15% off yellow flowers · ends in 7 days",
    tip: "The day before Valentine's, and in Bangladesh it is its own festival — yellow saris, marigold, gaada. Point this at your yellow category. Run it back-to-back with Valentine's and stock for both at once.",
    tint: PURPLE,
    days: 7,
    body: {
      name: "Pohela Falgun", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "Basanta is here",
      benefitLine: "15% off the yellows — marigold, gerbera, gaada",
      bonusLines: [CARD, "Flower crown, if you ask for one"],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },
  {
    key: "ekushey",
    name: "Ekushey February",
    family: "21 February",
    group: "Occasion",
    lever: "Likelihood",
    icon: "pin",
    what: "Free delivery before dawn · no discount",
    tip: "⚠️ THIS DAY IS NOT A SALE. Shaheed Dibosh is mourning, and a percentage sign on it will read as tasteless to the people you most want to serve. So this template carries NO discount at all — only free delivery and a promise to arrive before dawn, which is the thing that actually matters for a Shaheed Minar wreath. Change the words, never the tone.",
    tint: PURPLE,
    days: 4,
    body: {
      name: "Ekushey February — before dawn", mechanism: "AUTOMATIC", shape: "FREE_DELIVERY",
      discountType: "FREE_DELIVERY", discountValue: 0,
      publicTitle: "Wreaths and flowers for Ekushey",
      benefitLine: "Delivered before dawn on the 21st — delivery free",
      description: "Made to order for Shaheed Minar and for remembrance at home.",
      bonusLines: ["Delivered before first light", "Ribbon lettering in Bangla, if you want it"],
      guaranteeText: "Not in your hands before dawn? The order is free.",
      combinable: false,
    },
  },
  {
    key: "boishakh",
    name: "Pohela Boishakh",
    family: "14 April",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "sparkle",
    what: "12% off shop-wide · ends in 7 days",
    tip: "Bengali New Year — the shop-wide one, because people buy for the home, the office and the family all at once. Press it a week before.",
    tint: ROSE,
    days: 7,
    body: {
      name: "Pohela Boishakh", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1200, maxDiscountPaisa: 60000,
      publicTitle: "Shubho Noboborsho",
      benefitLine: "12% off everything for the new year",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },
  {
    key: "eid",
    name: "Eid gifting",
    family: "Eid-ul-Fitr / Adha",
    group: "Occasion",
    lever: "Effort",
    icon: "gem",
    what: "10% off over ৳2,500 · ends in 10 days",
    tip: "Eid is a gifting season, not a flower season — bigger baskets, several addresses, often bought by one person for a whole family. The minimum spend is there because that is how the orders actually arrive.",
    tint: ORCHID,
    days: 10,
    body: {
      name: "Eid gifting", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1000, minSpendPaisa: 250000, maxDiscountPaisa: 80000,
      publicTitle: "Eid Mubarak from Radian",
      benefitLine: "10% off gift orders over ৳2,500",
      bonusLines: [CARD, "We can deliver to several addresses from one order", PHOTO],
      guaranteeText: "Delivered on the day you chose, or it is free.",
      scarcity: true, combinable: false,
    },
  },
  {
    key: "mothers-day",
    name: "Mother's Day",
    family: "May",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "heart",
    what: "15% off one category · ends in 7 days",
    tip: "The one day of the year when people who never buy flowers buy flowers. Keep the choosing easy — most of these are first-time buyers who do not know what to pick.",
    tint: ROSE,
    days: 7,
    body: {
      name: "Mother's Day", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "For Ma, this Mother's Day",
      benefitLine: "15% off — and we write the card in your words",
      bonusLines: [CARD, PHOTO, "Our florist picks what is freshest that morning"],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },
  {
    key: "puja",
    name: "Durga Puja",
    family: "October",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "sparkle",
    what: "12% off one category · ends in 7 days",
    tip: "Point it at garlands, marigold and puja arrangements. Days matter more than price here — the flowers have to be there for a specific ritual at a specific hour.",
    tint: PURPLE,
    days: 7,
    body: {
      name: "Durga Puja", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1200,
      publicTitle: "Shubho Sharodiya",
      benefitLine: "12% off garlands and puja flowers",
      bonusLines: ["Delivered on the exact day and hour you choose", PHOTO],
      guaranteeText: "Delivered on the day you chose, or it is free.",
      scarcity: true, combinable: false,
    },
  },
  {
    key: "wedding",
    name: "Wedding season",
    family: "November – February",
    group: "Occasion",
    lever: "Effort",
    icon: "gem",
    what: "10% off over ৳10,000 · ends in 30 days",
    tip: "Not a bouquet — a stage, a car, a gate, a room. The minimum spend is high because that is what these orders are, and the bonus that wins them is a person who comes to look at the venue.",
    tint: SOFT,
    days: 30,
    body: {
      name: "Wedding season", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1000, minSpendPaisa: 1000000, maxDiscountPaisa: 300000,
      publicTitle: "Flowers for the whole day",
      benefitLine: "10% off wedding orders over ৳10,000",
      description: "Stage, car, gate, gaye holud — one shop, one order, one delivery.",
      bonusLines: [
        "We visit the venue before the day, free",
        "One person owns your order from start to finish",
        "Setup on site included",
      ],
      guaranteeText: "Anything not as agreed on the day, we replace it that hour.",
      combinable: false,
    },
  },
  {
    key: "newyear",
    name: "Year-end and New Year",
    family: "December – January",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "star",
    what: "12% off shop-wide · ends in 10 days",
    tip: "Two audiences at once — families sending gifts, and offices thanking clients. If corporate is the bigger half for you, use the Corporate template instead and run this one after the 1st.",
    tint: ORCHID,
    days: 10,
    body: {
      name: "Year-end and New Year", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1200, maxDiscountPaisa: 80000,
      publicTitle: "Start their year with something beautiful",
      benefitLine: "12% off everything until the 1st",
      bonusLines: [CARD, "Schedule it for 1 January, we will hold it"],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },
  {
    key: "occasion-week",
    name: "Any occasion week",
    family: "The blank one",
    group: "Occasion",
    lever: "Dream outcome",
    icon: "sparkle",
    what: "15% off one category · ends in 7 days",
    tip: "The empty template for a day this list does not have — Father's Day, Teacher's Day, a local festival, an anniversary of the shop. Set the category and the words yourself.",
    tint: ROSE,
    days: 7,
    body: {
      name: "Occasion week", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "Occasion week at Radian",
      benefitLine: "15% off — this week only",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },

  /* ══ MOVE STOCK ════════════════════════════════════════════════════════ */
  {
    key: "hero-product",
    name: "Push one bouquet",
    family: "Pick a winner",
    group: "Move stock",
    lever: "Dream outcome",
    icon: "star",
    what: "20% off chosen products · 2 bonuses",
    tip: "For the one arrangement you want everybody talking about. Keep the product list short — an offer on forty products is a sale, and a sale teaches people to wait for the next one.",
    tint: PURPLE,
    body: {
      name: "Hero product push", mechanism: "AUTOMATIC", shape: "PRODUCT",
      discountType: "PERCENT", discountValue: 2000,
      publicTitle: "Our florist's favourite this week",
      benefitLine: "20% off the one we are proudest of",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      combinable: false,
    },
  },
  {
    key: "last-few",
    name: "Only a few left",
    family: "Real scarcity",
    group: "Move stock",
    lever: "Dream outcome",
    icon: "clock",
    what: "20% off · hard limit of 20 orders",
    tip: "The ONLY template here with real scarcity rather than the cosmetic counter: a total limit of 20 means the engine stops it at the twentieth order, whatever the date. Use it when the stock is genuinely finite — a flower that came in once. Saying 'only a few' when there are hundreds is the fastest way to stop being believed.",
    tint: ROSE,
    days: 5,
    body: {
      name: "Only a few left", mechanism: "AUTOMATIC", shape: "PRODUCT",
      discountType: "PERCENT", discountValue: 2000,
      publicTitle: "While they last",
      benefitLine: "20% off — only 20 of these will be sold",
      bonusLines: [PHOTO],
      guaranteeText: FRESH,
      totalLimit: 20, scarcity: true, combinable: false,
    },
  },
  {
    key: "quiet-days",
    name: "Fill the quiet days",
    family: "Even out the week",
    group: "Move stock",
    lever: "Time delay",
    icon: "clock",
    what: "15% off one category · ends in 3 days",
    tip: "Flowers do not keep. Sunday to Tuesday is dead in this trade, and a stem thrown away on Wednesday earned nothing at all — 15% off on a slow day beats 100% off in the bin. Press it on the quiet morning, not in advance.",
    tint: SOFT,
    days: 3,
    body: {
      name: "Quiet-day clearance", mechanism: "AUTOMATIC", shape: "CATEGORY",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "Today's flowers, today's price",
      benefitLine: "15% off — while today's stems last",
      bonusLines: [PHOTO],
      guaranteeText: FRESH,
      scarcity: true, combinable: false,
    },
  },

  /* ══ BRING THEM BACK ═══════════════════════════════════════════════════ */
  {
    key: "winback",
    name: "Win them back",
    family: "Gone quiet",
    group: "Bring them back",
    lever: "Likelihood",
    icon: "heart",
    what: "Coupon 15% · one per customer · ends in 14 days",
    tip: "A code you hand out deliberately — to somebody who ordered once and went quiet. One per customer and it expires, so it cannot leak into a permanent discount.",
    tint: ORCHID,
    days: 14,
    body: {
      name: "Win-back coupon", mechanism: "COUPON", shape: "SITEWIDE",
      code: "COMEBACK",
      discountType: "PERCENT", discountValue: 1500,
      publicTitle: "We kept your favourite in mind",
      benefitLine: "15% off with code COMEBACK",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "their-day",
    name: "Their own special day",
    family: "One person, one code",
    group: "Bring them back",
    lever: "Dream outcome",
    icon: "sparkle",
    what: "Coupon ৳300 · one per customer · ends in 21 days",
    tip: "For the customer's OWN birthday or the anniversary of their first order — Marketing → Occasions knows those dates. A gift from the shop to somebody who only ever buys gifts for other people. It is the cheapest loyalty there is.",
    tint: PURPLE,
    days: 21,
    body: {
      name: "Their special day", mechanism: "COUPON", shape: "SITEWIDE",
      code: "YOURDAY",
      discountType: "FLAT", discountValue: 30000,
      publicTitle: "Today it is your turn",
      benefitLine: "৳300 from us, with code YOURDAY",
      description: "You send flowers to everyone else. Today somebody sent some to you.",
      bonusLines: [CARD, PHOTO],
      guaranteeText: FRESH,
      perCustomerLimit: 1, combinable: false,
    },
  },
  {
    key: "sorry",
    name: "Put it right",
    family: "When we got it wrong",
    group: "Bring them back",
    lever: "Likelihood",
    icon: "shield",
    what: "Coupon ৳500 · one per customer · ends in 30 days",
    tip: "For the order that arrived late or wrong. Hand this code to that one customer. A shop that fixes a mistake properly keeps a customer longer than one that never made it — but keep the total limit small, because this is an apology, not a campaign.",
    tint: ROSE,
    days: 30,
    body: {
      name: "Service recovery", mechanism: "COUPON", shape: "SITEWIDE",
      code: "SORRY",
      discountType: "FLAT", discountValue: 50000,
      publicTitle: "On us, with our apologies",
      benefitLine: "৳500 off your next order — code SORRY",
      bonusLines: ["The owner personally checks this one before it leaves"],
      guaranteeText: "If we get it wrong twice, you never pay us again for that order.",
      perCustomerLimit: 1, totalLimit: 25, combinable: false,
    },
  },

  /* ══ CORPORATE ═════════════════════════════════════════════════════════ */
  {
    key: "corporate",
    name: "Corporate and bulk",
    family: "Offices and clients",
    group: "Corporate",
    lever: "Effort",
    icon: "users",
    what: "12% off over ৳15,000 · 3 bonuses",
    tip: "One person ordering for forty desks does not want a discount as much as they want it to be simple — one invoice, one contact, one delivery window. Corporate as its own SHAPE is still 'soon' in the engine, so this rides on a high minimum spend instead, which reaches the same orders.",
    tint: SOFT,
    body: {
      name: "Corporate and bulk", mechanism: "AUTOMATIC", shape: "SITEWIDE",
      discountType: "PERCENT", discountValue: 1200, minSpendPaisa: 1500000, maxDiscountPaisa: 500000,
      publicTitle: "For your office, your clients, your team",
      benefitLine: "12% off orders over ৳15,000",
      description: "One order, one invoice, one person who answers the phone.",
      bonusLines: [
        "Delivery to several addresses from one order",
        "One named contact for the whole order",
        "Proper invoice with your company details",
      ],
      guaranteeText: "Delivered inside the window you chose, or the delivery is free.",
      combinable: false,
    },
  },
  {
    key: "corporate-code",
    name: "One company, one code",
    family: "Offices and clients",
    group: "Corporate",
    lever: "Effort",
    icon: "hash",
    what: "Coupon 15% · unlimited per person, capped total",
    tip: "Give one company its own code and let every employee use it. Unlike the others this one does NOT limit per customer — the point is that forty different people may use it — but the total limit stops it living forever if the code escapes.",
    tint: PURPLE,
    days: 90,
    body: {
      name: "Company code", mechanism: "COUPON", shape: "SITEWIDE",
      code: "OFFICE15",
      discountType: "PERCENT", discountValue: 1500, maxDiscountPaisa: 100000,
      publicTitle: "Your company rate at Radian",
      benefitLine: "15% off with your company code",
      bonusLines: ["Invoice with your company details", "One named contact for your office"],
      guaranteeText: FRESH,
      totalLimit: 200, combinable: false,
    },
  },
];

/*  What the engine cannot pay yet, said out loud. A shop owner planning a
    season needs to know what is NOT on the shelf as much as what is — and the
    list is short, so hiding it would only mean he plans a campaign in March
    that cannot be built.

    ⚠️ When one of these ships, delete its row here and add the template. A
    stale "coming" list is its own kind of lie.  */
const CANNOT_YET: { name: string; why: string }[] = [
  { name: "Buy one get one", why: "The engine takes money off a bill; it cannot add a free line to an order." },
  { name: "Tiered — spend more, save more, in steps", why: "One offer applies at a time, so a staircase collapses to its best rung. Two separate offers with different minimum spends is the way round it." },
  { name: "Free gift with purchase", why: "Same reason as BOGO — nothing can add an item." },
  { name: "Bundle price", why: "Product bundles live on the product, not in the offer engine." },
  { name: "Subscription — flowers every month", why: "No repeating order exists yet. It is a Sales feature, not an offer." },
  { name: "Referral — they bring a friend", why: "Marketing → Affiliates owns this, and it pays a commission rather than a discount." },
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
  const b = p.body as {
    bonusLines?: string[]; guaranteeText?: string; scarcity?: boolean; totalLimit?: number;
  };
  return {
    bonuses: b.bonusLines?.length ?? 0,
    guarantee: Boolean(b.guaranteeText),
    urgency: Boolean(p.days) || Boolean(b.scarcity),
    hardLimit: b.totalLimit,
  };
}

export default function OffersTemplates() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | "All">("All");

  const shown = useMemo(
    () => (group === "All" ? PRESETS : PRESETS.filter((p) => p.group === group)),
    [group],
  );

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
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Offers · templates
          </div>
          <div className="flex items-center gap-2.5 mt-1.5">
            <h1 className="font-display text-[28px] text-purple m-0 leading-tight">Start from a template</h1>
            <Info text="Every one is a Grand Slam Offer, not a discount: a named offer, the outcome in one line, bonuses that answer the next objection, a guarantee that moves the risk to us, and a deadline where the deadline is real. Pressing one creates a DRAFT and opens it — a draft reaches no customer until you submit it, so a wrong press costs nothing." />
          </div>
        </div>
        <Link href="/marketing/offers/list"
          className="border-2 border-lavender-deep bg-white text-purple text-[14px] font-bold px-5 py-3 rounded-full hover:border-orchid shrink-0">
          All offers
        </Link>
      </div>

      {/*  ⚠️ Twenty-eight cards need a way in, or the shelf is a wall. Filter
           by what the offer is FOR, because that is how somebody arrives:
           "it's Ramadan" or "Tuesday is dead" or "this customer is angry".  */}
      <div className="flex gap-2 flex-wrap mb-6">
        {(["All", ...GROUPS] as const).map((g) => {
          const on = group === g;
          const n = g === "All" ? PRESETS.length : PRESETS.filter((p) => p.group === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`text-[13px] font-bold px-4 py-2.5 rounded-full transition-all inline-flex items-center gap-2 ${
                on ? "text-white shadow-soft" : "bg-white text-purple border border-lavender-deep hover:border-orchid"
              }`}
              style={on ? { background: PURPLE.edge, boxShadow: `0 4px 14px ${PURPLE.edge}45` } : undefined}
            >
              {g}
              <span className={`text-[11px] font-bold px-1.5 py-[1px] rounded-full ${on ? "bg-white/25" : "bg-lavender"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {err && (
        <div className="bg-[#3b1a16] border border-[#4d2e2e] text-[#e1837a] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-center justify-between gap-3">
          <span className="font-semibold">{err}</span>
          <button className="underline shrink-0 font-semibold" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {shown.map((p) => {
          const st = stackOf(p);
          return (
            <div key={p.key}
              className="relative rounded-[18px] border border-white/70 shadow-soft overflow-hidden p-5 flex flex-col"
              style={{ background: `linear-gradient(150deg,${p.tint.bg},#1f1727 130%)` }}>
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
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-white" style={{ color: p.tint.c }}>
                    <Icon name="plus" size={10} /> {st.bonuses} bonus{st.bonuses === 1 ? "" : "es"}
                  </span>
                )}
                {st.guarantee && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-white" style={{ color: p.tint.c }}>
                    <Icon name="shield" size={10} /> guarantee
                  </span>
                )}
                {st.urgency && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-white" style={{ color: p.tint.c }}>
                    <Icon name="clock" size={10} /> {p.days ? `${p.days} days` : "urgency"}
                  </span>
                )}
                {st.hardLimit && (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-[3px] rounded-full bg-white" style={{ color: p.tint.c }}>
                    <Icon name="lock" size={10} /> {st.hardLimit} max
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

      {/*  The short honest list of what is not on the shelf. It sits at the
           bottom, quiet, and it stops a season being planned around something
           the checkout cannot pay.  */}
      <div className="mt-8 rounded-[18px] border border-lavender-deep bg-white shadow-soft overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] font-bold text-purple"
          style={{ background: `linear-gradient(135deg,${PURPLE.bg},#1f1727)` }}>
          Not possible yet
          <Info text="Shapes the checkout cannot pay today, so there is deliberately no template for them. Knowing what is missing matters when you are planning a season — better here than discovered in March." />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {/*  ⚠️ The reason goes behind the ⓘ, like everything else on this
               module now. I wrote it as a grey second line first — the exact
               habit the owner struck out this morning.  */}
          {CANNOT_YET.map((c) => (
            <div key={c.name} className="rounded-[12px] border border-lavender-deep px-3.5 py-3 flex items-center gap-2">
              <Icon name="lock" size={12} />
              <span className="text-[13px] font-bold text-purple flex-1 min-w-0">{c.name}</span>
              <Info text={c.why} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

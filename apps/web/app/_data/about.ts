/*
  ═══════════════════════════════════════════════════════════════════
  ABOUT config — brand story + trust page।

  ⚠️ `draft: true` — খসড়া। যা লেখা আছে তা locked সত্যে grounded (fabricate
  নয়): Dhaka premium studio, hand-arranged, delivery-first (2hr/same-day/
  midnight/nationwide), honest pricing, gift experience।

  🔒 কোনো বানানো legal নম্বর নেই। documents[].number = null মানে placeholder —
  Radian আসল Trade License / BIN / VAT / TIN নম্বর ও scan এখানে বসাবে।
  documents[].scanUrl = null হলে "Scan pending" state দেখায়; আসল scan/PDF এলে
  (public/docs/…) শুধু scanUrl বসালেই "View document" active হয়ে যাবে।

  🔒 stats[] — বানানো "X লাখ অর্ডার" নয়। এগুলো Radian-এর সত্যিকারের capability
  (2hr express, 64 districts nationwide, hand-arranged, midnight)। ভলিউম-সংখ্যা
  (মোট অর্ডার/গ্রাহক) Radian দিলে যোগ হবে।

  🔒 contact — VisitStore GBE-র মতোই placeholder ঠিকানা/ফোন। আসল ডিটেইল এলে
  দুই জায়গায় একসাথে আপডেট হবে।

  ⇄ SWAP HERE — CMS এলে ভেতরটা fetch() হবে, AboutView বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

export interface AboutPillar {
  title: string;
  body: string;
}

export interface AboutStat {
  value: string;
  label: string;
}

export interface AboutStep {
  n: string;
  title: string;
  body: string;
}

export interface AboutDoc {
  label: string; // "Trade License"
  authority: string; // issuing body
  /** null => placeholder pill shown, no fabricated number */
  number: string | null;
  /** null => "Scan pending"; real path (e.g. /docs/trade-license.pdf) => active "View document" */
  scanUrl: string | null;
}

export interface AboutContact {
  address: string;
  area: string;
  hours: string;
  hoursSub: string;
  phone: string;
  email: string;
}

export interface AboutContent {
  updated: string;
  draft: boolean;
  eyebrow: string;
  heading: string;
  lede: string;
  stats: AboutStat[];
  story: string[];
  pillars: AboutPillar[];
  steps: AboutStep[];
  documents: AboutDoc[];
  contact: AboutContact;
}

export const ABOUT: AboutContent = {
  updated: "15 July 2026",
  draft: true,
  eyebrow: "Our story",
  heading: "Flowers and gifts, delivered while the moment still matters",
  lede: "Radian is a premium flower and gift studio in Dhaka. We hand-arrange every order and get it to the door fast — because a gift is really about a moment, and moments don't wait.",

  // Grounded capability stats — not fabricated volume numbers.
  stats: [
    { value: "2 hr", label: "Express delivery in Dhaka" },
    { value: "64", label: "Districts covered nationwide" },
    { value: "12 AM", label: "Midnight delivery available" },
    { value: "100%", label: "Hand-arranged to order" },
  ],

  story: [
    "Radian began with a simple frustration: too many gifts arrive late, look nothing like the photo, or show up with a price tag still attached. We wanted to fix all three.",
    "So we built a studio around the things that actually matter — fresh flowers arranged by hand, honest pricing with no surprises at checkout, and delivery that's genuinely fast inside Dhaka and reliable across the country.",
    "Every arrangement is made to order. Every delivery is tracked. And every gift goes out the way a gift should — beautifully, on time, and never with the price showing.",
  ],

  pillars: [
    {
      title: "Delivery-first",
      body: "Express, same-day, and midnight delivery inside Dhaka, plus nationwide courier. Delivery isn't an afterthought here — it's the whole point.",
    },
    {
      title: "Hand-arranged, made fresh",
      body: "Nothing sits on a shelf. Flowers are cut and arranged for your order, so what arrives is as fresh as it is beautiful.",
    },
    {
      title: "Honestly priced",
      body: "The price you see is the price you pay. Delivery charges and any offer are shown clearly before you check out — never hidden.",
    },
    {
      title: "A real gift experience",
      body: "Add a personal message, send it anonymously, and rest easy: the recipient never sees a price or invoice, only the surprise.",
    },
  ],

  steps: [
    {
      n: "01",
      title: "Choose your gift",
      body: "Pick from fresh flowers, cakes, and curated gifts — filtered by occasion, recipient, or budget.",
    },
    {
      n: "02",
      title: "We arrange it by hand",
      body: "Our florists cut and style your order fresh in the Dhaka studio. Add a message or make it anonymous.",
    },
    {
      n: "03",
      title: "Out for delivery",
      body: "Choose express, same-day, midnight, or a scheduled slot. Nationwide courier for outside Dhaka.",
    },
    {
      n: "04",
      title: "Delivered, tracked, price-free",
      body: "You get delivery updates; the recipient gets only the surprise — never a price or invoice.",
    },
  ],

  // 🔒 Placeholder — Radian to fill real numbers + upload scans. No fabrication.
  documents: [
    {
      label: "Trade License",
      authority: "Dhaka City Corporation",
      number: null,
      scanUrl: null,
    },
    {
      label: "BIN (Business Identification Number)",
      authority: "National Board of Revenue",
      number: null,
      scanUrl: null,
    },
    {
      label: "VAT Registration",
      authority: "National Board of Revenue",
      number: null,
      scanUrl: null,
    },
    {
      label: "TIN (Tax Identification Number)",
      authority: "National Board of Revenue",
      number: null,
      scanUrl: null,
    },
    {
      label: "e-Commerce Registration (DBID)",
      authority: "Ministry of Commerce",
      number: null,
      scanUrl: null,
    },
  ],

  // 🔒 Placeholder — mirrors VisitStore GBE until real store details are final.
  contact: {
    address: "House 12, Road 5, Dhanmondi",
    area: "Dhaka 1205, Bangladesh",
    hours: "Open every day, 9 AM – 10 PM",
    hoursSub: "Including Fridays and holidays",
    phone: "+880 1X XXX XXXXX",
    email: "hello@radian.com.bd",
  },
};
// end of ABOUT config

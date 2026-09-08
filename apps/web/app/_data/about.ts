/*
  ═══════════════════════════════════════════════════════════════════
  ABOUT — the shop's own VOICE, and nothing else (9 Sep 2026).

  ⚠️ What left this file: four "capability" statistics (the first said "2 hr"
  while the shop's express is three), the legal-document placeholders and a
  placeholder contact card. Facts belong to the modules that own them — the
  delivery menu and Company settings — and `AboutView` reads them there. If
  the shop has not filled a number in, nothing is drawn: no "Pending" pills.

  What is left is copy: the heading, the story, the four pillars and the four
  steps. The owner can replace the entire page from Admin → Content → Pages
  (slug "about"), which wins over everything here.
  ═══════════════════════════════════════════════════════════════════
*/

export interface AboutPillar {
  title: string;
  body: string;
}

export interface AboutStep {
  n: string;
  title: string;
  body: string;
}

export interface AboutContent {
  eyebrow: string;
  heading: string;
  lede: string;
  story: string[];
  pillars: AboutPillar[];
  steps: AboutStep[];
}

export const ABOUT: AboutContent = {
  eyebrow: "Our story",
  heading: "Flowers and gifts, delivered while the moment still matters",
  lede: "Radian is a premium flower and gift studio in Dhaka. We hand-arrange every order and get it to the door fast — because a gift is really about a moment, and moments don't wait.",


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

  // 🔒 Placeholder — mirrors VisitStore GBE until real store details are final.
};
// end of ABOUT config

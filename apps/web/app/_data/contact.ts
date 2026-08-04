/*
  ═══════════════════════════════════════════════════════════════════
  CONTACT config — /contact page।

  ⚠️ draft: true — placeholder। D19 সিদ্ধান্ত: কোনো form-backend নেই; গ্রাহক
  সরাসরি WhatsApp / Call / Email-এ পৌঁছায় (deep-link)। backend লাগে না।

  🔒 কোনো নম্বর বানানো হয়নি। phoneDigits/whatsappDigits = placeholder "X"।
  আসল নম্বর বসালেই tel:/wa.me deep-link নিজে থেকে কাজ করবে — view বদলাবে না।
  contact info VisitStore/About-এর মতোই source; আসল এলে সবখানে আপডেট।

  ⇄ SWAP HERE — CMS/settings এলে ভেতরটা fetch() হবে।
  ═══════════════════════════════════════════════════════════════════
*/

export interface ContactChannel {
  key: "whatsapp" | "call" | "email";
  label: string;
  value: string; // human-readable display
  sub: string;
  href: string; // deep-link (tel: / wa.me / mailto:)
}

export interface ContactReason {
  title: string;
  body: string;
}

export interface ContactContent {
  updated: string;
  draft: boolean;
  eyebrow: string;
  heading: string;
  lede: string;
  channels: ContactChannel[];
  responseNote: string;
  address: string;
  area: string;
  hours: string;
  hoursSub: string;
  reasons: ContactReason[];
}

// 🔒 Placeholder digits — Radian to replace. "X" keeps links inert but valid.
const PHONE_DISPLAY = "+880 1X XXX XXXXX";
const PHONE_DIGITS = "8801XXXXXXXXX"; // tel: / wa.me format (no +, no spaces)
const EMAIL = "hello@radian.com.bd";
const WA_TEXT = encodeURIComponent(
  "Hi Radian! I'd like to ask about an order.",
);

export const CONTACT: ContactContent = {
  updated: "15 July 2026",
  draft: true,
  eyebrow: "We're here to help",
  heading: "Talk to Radian",
  lede: "Questions about an order, a last-minute gift, or something special? Reach us however's easiest — we reply fast during opening hours.",

  channels: [
    {
      key: "whatsapp",
      label: "WhatsApp us",
      value: PHONE_DISPLAY,
      sub: "Fastest — usually replies in minutes",
      href: `https://wa.me/${PHONE_DIGITS}?text=${WA_TEXT}`,
    },
    {
      key: "call",
      label: "Call the studio",
      value: PHONE_DISPLAY,
      sub: "Open every day, 9 AM – 10 PM",
      href: `tel:+${PHONE_DIGITS}`,
    },
    {
      key: "email",
      label: "Email us",
      value: EMAIL,
      sub: "For orders, support & corporate",
      href: `mailto:${EMAIL}`,
    },
  ],

  responseNote:
    "We answer WhatsApp and calls within opening hours, and emails within a few hours.",

  address: "House 12, Road 5, Dhanmondi",
  area: "Dhaka 1205, Bangladesh",
  hours: "Open every day, 9 AM – 10 PM",
  hoursSub: "Including Fridays and holidays",

  reasons: [
    {
      title: "Track or change an order",
      body: "Share your order number and we'll check the status or update the details for you.",
    },
    {
      title: "Last-minute & midnight gifts",
      body: "Need it today or at midnight? Message us and we'll confirm the fastest slot.",
    },
    {
      title: "Corporate & bulk orders",
      body: "Office gifting, events, or weddings — tell us the date and quantity for a quote.",
    },
    {
      title: "Something went wrong",
      body: "If a delivery wasn't right, reach out with your order number and we'll fix it.",
    },
  ],
};

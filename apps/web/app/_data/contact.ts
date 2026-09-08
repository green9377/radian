/*
  ⚠️ NOT ONE FACT LIVES HERE ANY MORE (9 Sep 2026).

  This file used to hold the phone, the WhatsApp number, the email and the
  address — as placeholders ("+880 1X XXX XXXXX", a Dhanmondi address nobody
  works at), printed live under a "Draft" banner. They now come from
  `/shop/shop-card`, which is Company settings in the admin, so the shop's own
  details are typed once and read everywhere.

  What is left is the page's WORDS: the heading, the invitation, and the four
  "how can we help" cards. Those are copy, not data, and they change with the
  page rather than with the shop.
*/

export interface ContactReason {
  title: string;
  body: string;
}

export const CONTACT_COPY = {
  eyebrow: "We're here to help",
  heading: "Talk to Radian",
  lede: "Questions about an order, a last-minute gift, or something special? Reach us however's easiest — we reply fast during opening hours.",
  responseNote:
    "We answer WhatsApp and calls within opening hours, and emails within a few hours.",
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
  ] as ContactReason[],
};

/*
  ═══════════════════════════════════════════════════════════════════
  FAQ config — grouped Q&A, একটাই FaqView দিয়ে চলে।

  সব উত্তর Radian-এর locked সত্যে grounded (fabricate নয়):
    · zone: Inside Dhaka / All Bangladesh (§৫)
    · method: 2-Hour Express · Same Day · Midnight · Nationwide Courier (D33)
    · payment: SSLCommerz (D35), COD gift/prepaidOnly-তে নয় (D26)
    · tracking: /track (D30/D31), update WhatsApp-এ (D36)
    · returns: perishable + made-to-order (refund-policy)

  ⚠️ নির্দিষ্ট fee/সংখ্যা এখানে লিখি না (D23/D24) — সেসব delivery.ts-এর
  একমাত্র source। specifics-এর জন্য উত্তর /delivery-info-এ পাঠায়।

  ⇄ SWAP HERE — CMS এলে FAQ_GROUPS fetch() হবে, FaqView বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Ordering & Payment",
    items: [
      {
        q: "How do I place an order?",
        a: "Pick your gift, choose any size, add-ons or a personal message, then check out. You order as a guest — just your name and a WhatsApp number, plus the recipient's details.",
      },
      {
        q: "What payment methods do you accept?",
        a: "You can pay online through our secure payment gateway, which supports bKash, Nagad, Rocket and cards. Cash on Delivery is available on eligible orders.",
      },
      {
        q: "When is Cash on Delivery not available?",
        a: "COD is not offered for gift orders (we don't want a rider asking your recipient for payment at the door) or for made-to-order, prepaid-only items. Those are paid in advance. Everything is explained at checkout.",
      },
      {
        q: "Can I order from outside Bangladesh?",
        a: "Yes. Many customers abroad send gifts home. Your own phone can use any country code; the recipient's number stays a local Bangladeshi one.",
      },
    ],
  },
  {
    title: "Delivery",
    items: [
      {
        q: "Which areas do you deliver to?",
        a: "We deliver across Bangladesh. Inside Dhaka you get our fastest options — express, same-day and midnight. Everywhere else travels by nationwide courier. See our Delivery Information page for full details.",
      },
      {
        q: "How fast can you deliver?",
        a: "Inside Dhaka we offer Express, Same Day, Scheduled and Midnight delivery. Outside Dhaka, nationwide courier takes 1–3 days. You'll see every option we can do for your area — with its exact timing and price — at checkout.",
      },
      {
        q: "Do you deliver at midnight?",
        a: "Yes — Midnight Surprise lands right at 12:00 AM inside Dhaka, perfect for birthdays and anniversaries. Order before the evening cut-off shown at checkout.",
      },
      {
        q: "How do I track my order?",
        a: "Head to the Track Order page and enter your order number. You'll also get updates on WhatsApp at every step — confirmation, preparation and delivery.",
      },
    ],
  },
  {
    title: "Gifts & Personalisation",
    items: [
      {
        q: "Can I add a gift message?",
        a: "Yes. You can add a personal gift message during checkout, and choose to send it anonymously if you'd like it to be a surprise.",
      },
      {
        q: "Will the price be visible to the recipient?",
        a: "No. We never include a price or invoice with the gift, and the tracking link shows only the delivery status — not the amount or order contents.",
      },
      {
        q: "Can I personalise items with a photo or name?",
        a: "Many products — mugs, frames, lamps, cakes and more — can be personalised with a photo, name or message. Just add your details on the product page.",
      },
    ],
  },
  {
    title: "Products & Freshness",
    items: [
      {
        q: "Are the flowers fresh?",
        a: "Every arrangement is hand-made to order from fresh stems. Because flowers are natural, exact shades and stems may vary slightly while keeping the overall look and value.",
      },
      {
        q: "Do the product photos match what I'll get?",
        a: "Photos are a close representation. Seasonal availability may mean small substitutions, but we always match the style, size and value you ordered.",
      },
      {
        q: "Which items can ship nationwide?",
        a: "Courier-safe gifts — chocolates, hampers, plants, personalised items and selected flower boxes — ship across Bangladesh. Fresh cakes and balloons are available inside Dhaka only.",
      },
    ],
  },
  {
    title: "Returns & Problems",
    items: [
      {
        q: "What if my gift arrives damaged or wrong?",
        a: "Contact us within 24 hours of delivery with a photo and we'll arrange a replacement or refund. See our Returns & Refunds page for details.",
      },
      {
        q: "Can I cancel or change my order?",
        a: "You can cancel for a full refund only before we begin preparing your order. Once flowers are cut, a cake is baked or a personalised item is printed, it can no longer be cancelled.",
      },
      {
        q: "How do I contact support?",
        a: "Use the support panel available on every page — it's the quickest way to reach the Radian team.",
      },
    ],
  },
];

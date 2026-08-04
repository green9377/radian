import { formatTaka } from "./products";
import {
  METHODS,
  EXPRESS_WINDOW,
  MIDNIGHT_CUTOFF_HOUR,
  COURIER_DAYS,
  DELIVERY_FROM_PAISA,
} from "./delivery";

/*
  ═══════════════════════════════════════════════════════════════════
  POLICY / INFO PAGES — এক dynamic template, config-driven (D1)।

  চারটা prose page একটাই PolicyView দিয়ে চলে:
    · /delivery-info   — Radian-এর locked delivery তথ্য থেকে DERIVE (fabricate
      নয়): fee/method/cutoff সব delivery.ts থেকে আসে, সংখ্যা এখানে হার্ডকোড
      নেই (D23/D24)।
    · /refund-policy · /privacy-policy · /terms — standard খসড়া। Radian-এর
      locked সিদ্ধান্তে grounded (COD: gift/prepaidOnly-তে নয় — D26; payment
      SSLCommerz — D35; ফুল/কেক perishable; personalised made-to-order)।

  ⚠️ `draft: true` = আইনি copy Radian/legal-এর রিভিউ বাকি — page-এ banner ওঠে।
  বাণিজ্যিক/আইনি নিয়ম নিজে থেকে চূড়ান্ত করা হয়নি; কাঠামো + খসড়া দেওয়া হলো।

  ⇄ SWAP HERE — CMS/legal module এলে getPolicy() ভেতরটা fetch() হবে;
  PolicyView/route একটুও বদলাবে না।
  ═══════════════════════════════════════════════════════════════════
*/

export interface PolicySection {
  heading: string;
  /** প্রতিটা string একটা আলাদা paragraph */
  body: string[];
}

export interface PolicyDoc {
  slug: string;
  title: string;
  /** "শেষ হালনাগাদ" — display-only */
  updated: string;
  intro: string;
  sections: PolicySection[];
  /** true হলে "খসড়া — রিভিউ বাকি" banner ওঠে */
  draft?: boolean;
}

const UPDATED = "15 July 2026";

/* ─────────────── Delivery Info — locked তথ্য থেকে derive ─────────────── */

function deliveryInfoDoc(): PolicyDoc {
  const dhaka = METHODS.filter((m) => m.zone === "dhaka");

  const methodParas = dhaka.map((m) => {
    const fee =
      m.surchargePaisa > 0
        ? `${formatTaka(m.feePaisa)} + ${formatTaka(m.surchargePaisa)} surcharge`
        : formatTaka(m.feePaisa);
    return `${m.label} (${fee}) — ${m.sub}.`;
  });

  const hour = (h: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return `${twelve} ${suffix}`;
  };

  return {
    slug: "delivery-info",
    title: "Delivery Information",
    updated: UPDATED,
    intro:
      "Delivery is at the heart of what Radian does. Here is exactly how, when and where we deliver — so there are no surprises at checkout.",
    sections: [
      {
        heading: "Where we deliver",
        body: [
          "We deliver in two zones. Inside Dhaka you get our fastest options — express, same-day and midnight. For the rest of the country, All Bangladesh orders travel by nationwide courier.",
          "A few items are available inside Dhaka only (for example fresh cakes and balloon arrangements that cannot survive courier transit). These are clearly marked, and you can switch your delivery area at any time from the header.",
        ],
      },
      {
        heading: "Inside Dhaka options",
        body: methodParas,
      },
      {
        heading: "Nationwide (All Bangladesh)",
        body: [
          `Orders outside Dhaka are delivered by our courier partners in ${COURIER_DAYS.min}–${COURIER_DAYS.max} days for ${formatTaka(
            METHODS.find((m) => m.id === "courier")?.feePaisa ?? 0,
          )}.`,
          "Only courier-safe gifts — chocolates, hampers, plants, personalised items and selected flower boxes — ship nationwide.",
        ],
      },
      {
        heading: "Order cut-off times",
        body: [
          `2-Hour Express is available for same-day orders placed between ${hour(
            EXPRESS_WINDOW.startHour,
          )} and ${hour(EXPRESS_WINDOW.endHour)}.`,
          `Midnight delivery for tonight can be ordered up to ${hour(
            MIDNIGHT_CUTOFF_HOUR,
          )}. After that, the earliest midnight slot is the next day.`,
          "Same-day and scheduled slots stay open until the slot itself begins — as long as there is still capacity for that slot.",
        ],
      },
      {
        heading: "Delivery charges",
        body: [
          `Delivery starts from ${formatTaka(
            DELIVERY_FROM_PAISA.dhaka,
          )} inside Dhaka and ${formatTaka(
            DELIVERY_FROM_PAISA.bangladesh,
          )} for All Bangladesh. The exact charge for your chosen method is always shown in your order summary before you pay.`,
          "From time to time we run offers — such as free midnight delivery on qualifying orders. Any active offer and its terms are shown at checkout.",
        ],
      },
    ],
  };
}

/* ─────────────── Refund / Privacy / Terms — খসড়া (legal review বাকি) ─────────────── */

const REFUND: PolicyDoc = {
  slug: "refund-policy",
  title: "Returns & Refunds",
  updated: UPDATED,
  draft: true,
  intro:
    "Flowers, cakes and personalised gifts are made fresh and made-to-order, so our returns policy is a little different from ordinary retail. Please read this before you order.",
  sections: [
    {
      heading: "Perishable & made-to-order items",
      body: [
        "Because fresh flowers, cakes and personalised items are prepared specifically for your order, they cannot be returned or exchanged once preparation has begun.",
        "This does not affect your rights where an item arrives damaged, incorrect, or is not delivered.",
      ],
    },
    {
      heading: "If something goes wrong",
      body: [
        "If your gift arrives damaged or is not what you ordered, contact us within 24 hours of delivery with a photo. We will arrange a replacement or a refund.",
        "We may ask for the delivery photo our rider captures, so we can resolve the issue quickly.",
      ],
    },
    {
      heading: "Cancellations",
      body: [
        "An order can be cancelled for a full refund only before we begin preparing it. Once flowers are cut, a cake is baked, or a personalised item is printed, the order can no longer be cancelled.",
        "Cash on Delivery is not available for gift orders or for made-to-order (prepaid-only) items — these are paid in advance so that a last-minute cancellation does not fall on the studio.",
      ],
    },
    {
      heading: "How refunds are issued",
      body: [
        "Approved refunds are returned to your original payment method. Timing depends on your bank or wallet provider.",
      ],
    },
  ],
};

const PRIVACY: PolicyDoc = {
  slug: "privacy-policy",
  title: "Privacy Policy",
  updated: UPDATED,
  draft: true,
  intro:
    "Your trust matters to us. This policy explains what information Radian collects when you shop with us, and how we use it.",
  sections: [
    {
      heading: "What we collect",
      body: [
        "To fulfil an order we collect your name and phone number, the recipient's name, phone and delivery address, your gift message, and your delivery preferences.",
        "Payments are processed by our payment partner. Radian does not store your full card or mobile-wallet details.",
      ],
    },
    {
      heading: "How we use it",
      body: [
        "We use your information only to prepare, deliver and support your order — including sending order and delivery updates over WhatsApp — and to improve our service.",
        "Recipient details are used solely to complete that delivery.",
      ],
    },
    {
      heading: "Sharing",
      body: [
        "We share information only with the partners needed to complete your order, such as our payment gateway and delivery couriers. We do not sell your personal data.",
      ],
    },
    {
      heading: "Your choices",
      body: [
        "You can ask us to update or delete your personal information by contacting us through the support panel.",
      ],
    },
  ],
};

const TERMS: PolicyDoc = {
  slug: "terms",
  title: "Terms of Service",
  updated: UPDATED,
  draft: true,
  intro:
    "These terms govern your use of the Radian website and your orders. By placing an order you agree to them.",
  sections: [
    {
      heading: "Orders",
      body: [
        "Placing an order is an offer to buy. An order is confirmed once payment is received (or, for eligible Cash on Delivery orders, once we accept it).",
        "Prices are shown in Bangladeshi Taka. The price you pay is the price shown in your order summary at checkout.",
      ],
    },
    {
      heading: "Products & availability",
      body: [
        "Product photographs are illustrative. Fresh flowers are natural products, so exact stems, shades and containers may vary slightly while keeping the overall look and value.",
        "Some items are available inside Dhaka only. Availability can change based on your delivery area and the time of day.",
      ],
    },
    {
      heading: "Payment",
      body: [
        "Online payments are handled securely by our payment gateway. Cash on Delivery is available only for eligible orders (it is not offered for gift orders or prepaid-only items).",
      ],
    },
    {
      heading: "Delivery & tracking",
      body: [
        "We aim to deliver within your chosen window. Delivery times can be affected by weather, traffic and the recipient's availability. You can follow your order from the Track Order page.",
      ],
    },
    {
      heading: "Contact",
      body: [
        "Questions about these terms? Reach us any time through the support panel on the site.",
      ],
    },
  ],
};

/* ─────────────── Registry + getters (⇄ SWAP HERE) ─────────────── */

const STATIC: Record<string, PolicyDoc> = {
  [REFUND.slug]: REFUND,
  [PRIVACY.slug]: PRIVACY,
  [TERMS.slug]: TERMS,
};

export const POLICY_SLUGS = [
  "delivery-info",
  "refund-policy",
  "privacy-policy",
  "terms",
] as const;

export function getPolicy(slug: string): PolicyDoc | null {
  if (slug === "delivery-info") return deliveryInfoDoc();
  return STATIC[slug] ?? null;
}

export function policyMeta(slug: string): { title: string; description: string } {
  const doc = getPolicy(slug);
  if (!doc) return { title: "Radian", description: "" };
  return { title: `${doc.title} | Radian`, description: doc.intro };
}

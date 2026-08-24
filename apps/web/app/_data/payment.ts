import type { ResolvedLine } from "./cart";

/*
  ═══════════════════════════════════════════════════════════════════
  PAYMENT config

  ★ Gateway = SSLCommerz (locked, 14 July — সোবুজ)
  তাই আলাদা bKash / Nagad / Card card **নেই**। SSLCommerz-এর নিজের
  page-এই customer wallet বা কার্ড বাছবে। Checkout-এ দুটোই যথেষ্ট:

    · Online Payment  — SSLCommerz-এ redirect (card · bKash · Nagad · Rocket)
    · Cash on Delivery

  চেকআউটে চারটা wallet card দেখিয়ে তারপর SSLCommerz-এ গিয়ে আবার একই
  চারটা দেখানো = দুবার একই সিদ্ধান্ত, আর গেটওয়ে যেদিন নতুন wallet যোগ
  করবে সেদিন আমাদের UI মিথ্যা বলবে।

  ★ COD rule (locked, 14 July)
  1. Gift order-এ COD কখনো নয় — রাইডার সারপ্রাইজের দরজায় বিল চাইবে না।
  2. Self order-এ COD চলবে।
  3. `prepaidOnly` product cart-এ থাকলে COD নেই (self হোক বা gift) —
     made-to-order জিনিস বাতিল হলে ক্ষতি পুরোটা দোকানের।

  ⇄ SWAP HERE — Finance lock হলে gateway + rule API থেকে।
  ═══════════════════════════════════════════════════════════════════
*/

export type PaymentId = "online" | "cod";

export interface PaymentMethod {
  id: PaymentId;
  label: string;
  sub: string;
  logo: string;
  prepaid: boolean;
  note: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "online",
    label: "Online Payment",
    sub: "Card, bKash, Nagad, Rocket — you'll choose on the next screen",
    logo: "SSL",
    prepaid: true,
    note: "You'll be taken to SSLCommerz to complete payment securely.",
  },
  {
    id: "cod",
    label: "Cash on Delivery",
    sub: "Pay our rider when it arrives",
    logo: "৳",
    prepaid: false,
    note: "Please keep the exact amount ready for our rider.",
  },
];

export interface PaymentOption {
  method: PaymentMethod;
  available: boolean;
  reason?: string;
}

/**
 * Is there an advance-required product in the cart?
 *
 * ⚠️ IT ASKED THE MOCK CATALOGUE UNTIL 24 August 2026, and that is the whole
 * bug. It looked each line up with `getProductDetail(slug)` — the hand-written
 * `PRODUCTS` list — so a REAL product, the kind the owner ticks "Advance
 * required" on in the admin, was never found and the answer was always `false`.
 * Cash on Delivery therefore stayed open on made-to-order goods: exactly the
 * loss rule 3 above exists to prevent.
 *
 * The resolved cart already carries the real product, fetched from the API. It
 * is read from there now, and the server refuses the same combination on its
 * own (`checkout.ts`) — a money rule cannot live in the browser alone.
 */
export function hasPrepaidOnly(lines: Pick<ResolvedLine, "detail">[]): boolean {
  return lines.some((l) => l.detail.product.prepaidOnly === true);
}

export function paymentOptions(args: {
  isGift: boolean;
  /** the deliverable lines only — a held item is not in this order (D21) */
  lines: Pick<ResolvedLine, "detail">[];
}): PaymentOption[] {
  const advance = hasPrepaidOnly(args.lines);

  return PAYMENT_METHODS.map((method) => {
    if (method.id !== "cod") return { method, available: true };

    if (advance)
      return {
        method,
        available: false,
        reason: "One item here is made to order — it needs advance payment.",
      };

    if (args.isGift)
      return {
        method,
        available: false,
        reason: "Not for gifts — our rider would have to ask the receiver for money.",
      };

    return { method, available: true };
  });
}

export function defaultPayment(options: PaymentOption[]): PaymentId {
  return options.find((o) => o.available)?.method.id ?? "online";
}

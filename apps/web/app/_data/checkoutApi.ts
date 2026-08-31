import { baseFor } from "./shop";
import type { CartItem } from "../_store/useCartStore";
import type { Zone } from "../_store/useZoneStore";

/*
  ═══════════════════════════════════════════════════════════════════════════
  MONEY → the server. The storefront's first WRITE.

  Every other file beside this one READS. `_data/shop.ts` says so at the top:

      Reads only. Cart, checkout and review submission are writes and wait on
      the Ecommerce module lock.

  That wait is over — `apps/api/src/shop/checkout.ts` exists. This is its
  storefront half.

  ⚠️ THE FALLBACK RULE IS THE OPPOSITE OF EVERY OTHER GETTER, AGAIN.

  A category rail that cannot be read falls back to its hard-coded list, and a
  stale rail still sells flowers. MONEY DOES NOT GET THAT TREATMENT. If the
  quote cannot be fetched this returns null and the cart says so, because the
  alternative — falling back to the ৳3,000 threshold and the three coupons
  typed into `_data/promo.ts` — is a page quoting prices the shop has not
  agreed to. A visible failure beats an invisible lie.

  ⚠️ AND NOTHING HERE SENDS A PRICE. The requests carry slugs, ids and
  quantities. That is not politeness; it is the reason the server can be
  trusted, and `checkout.ts` ignores any money field that arrives anyway.
  ═══════════════════════════════════════════════════════════════════════════
*/

/* ─────────────────── the cart, as the API wants it ─────────────────── */

export interface QuoteItemIn {
  slug: string;
  variantId?: string;
  sizeId?: string;
  bundleIds?: string[];
  addonIds?: string[];
  persoText?: string;
  /** DEC-PRD-061 — the URL the perso upload gave back, never the file itself */
  persoImageUrl?: string;
  qty: number;
}

export interface QuoteIn {
  items: QuoteItemIn[];
  zone: "DHAKA" | "BANGLADESH";
  deliveryMethodId?: string;
  deliverySlotId?: string;
  couponCode?: string;
  paymentMethod?: "online" | "cod";
  /**
   * ⚠️ SEND IT THE MOMENT IT IS TYPED, AND THIS IS NOT OPTIONAL POLISH.
   *
   * The offer engine judges customer-shaped offers — first order, per-customer
   * limits (OFR-R02/R06) — against a person. With no phone there is no person,
   * so those offers are skipped and the quote comes back HIGHER than the order
   * that follows. The self-test caught exactly this on 3 Aug: ৳2,250 quoted,
   * ৳1,935 charged, a 15% welcome discount that only became applicable once
   * the account existed.
   *
   * The cart page has no phone and honestly shows the undiscounted total. The
   * checkout page has one, and must re-quote with it.
   */
  phone?: string;
}

export interface QuoteLine {
  slug: string;
  name: string;
  imageUrl: string | null;
  sizeLabel: string | null;
  variantLabel: string | null;
  bundleLabels: string[];
  addonLabels: string[];
  qty: number;
  unitPaisa: number;
  linePaisa: number;
  held: boolean;
}

export interface AppliedOffer {
  name: string;
  code: string | null;
  discountPaisa: number;
  freeDelivery: boolean;
}

/** "spend ৳X more and get…" — from the Offer masters, not a constant */
export interface NextReward {
  thresholdPaisa: number;
  remainingPaisa: number;
  savePaisa: number;
  label: string;
  pct: number;
}

export interface Quote {
  lines: QuoteLine[];
  held: QuoteLine[];
  missing: string[];
  subtotalPaisa: number;
  deliveryPaisa: number;
  deliveryWaivedPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  applied: AppliedOffer[];
  couponError: string | null;
  nextReward: NextReward | null;
}

/* ─────────────────── delivery, from the masters ─────────────────── */

export interface DeliverySlotOption {
  id: string;
  label: string;
  /** minutes from midnight — comparable, unlike "9am – 12pm" */
  startMin: number | null;
  endMin: number | null;
  /** "08:00" — last order time for this slot. Null = until it starts. */
  cutoffTime: string | null;
  capacityPerDay: number | null;
}

export interface DeliveryMethodOption {
  id: string;
  label: string;
  kind: string;
  typeId: string | null;
  typeName: string | null;
  /**
   * TODAY_SLOT · TODAY_ONLY · ANY_DATE_SLOT · FROM_CONFIRM · LEAD_DAYS
   *
   * ⚠️ This one field replaces `slots`, `datePick` and `todayOnly` — three
   * hand-maintained booleans in `_data/delivery.ts`. The owner adding a fifth
   * kind of delivery used to need a code change; now it needs a row.
   */
  timing: string | null;
  feePaisa: number;
  etaLabel: string | null;
  cutoffTime: string | null;
  slots: DeliverySlotOption[];
}

/* ─────────────────── placing it ─────────────────── */

export interface PlaceOrderIn extends QuoteIn {
  senderName: string;
  senderPhone: string;
  senderEmail?: string;
  isGift?: boolean;
  recipientName?: string;
  recipientPhone?: string;
  giftMessage?: string;
  anonymousGift?: boolean;
  photoUpdates?: boolean;
  address: string;
  deliveryNotes?: string;
  date?: string;
  /** the total the customer pressed the button on — see `place()` below */
  expectedTotalPaisa?: number;
  /** MKT-D02 — first-touch বিজ্ঞাপন-চিহ্ন (useAttribution) */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refCode?: string;
  /*  DEC-WA-004 — এই ব্রাউজারের অসমাপ্ত checkout-এর পরিচয়। order হয়ে গেলে
      ওই সারিটা CONVERTED হয়, নাহলে ১৫ মিনিট পর সদ্য order করা গ্রাহকের
      কাছেই "আপনার cart রাখা আছে" বার্তা চলে যেত।  */
  clientKey?: string;
  /**
   * DEC-RTN-015 part 2 — spend this customer's store credit on the order.
   *
   * The website has no login: identity is a typed phone, so a code has to come
   * back from that number before anyone's credit can be touched. The order is
   * placed either way; a wrong code simply means no credit was used.
   */
  useStoreCredit?: boolean;
  creditCode?: string;
}

/* ─────────────────── অসমাপ্ত checkout (DEC-WA-004, DEC-WA-008) ───────────────────
   গ্রাহক checkout-এ যা টাইপ করছেন তা server-এ রেখে দেওয়া, যাতে অর্ধেক পথে
   চলে গেলে তাঁকে ফিরিয়ে আনার চেষ্টা করা যায়।

   ⚠️ কার্ড/CVV/OTP কখনো এখানে আসে না — টাকার পাতাটা SSLCommerz-এর নিজের,
   আমাদের ফর্মে ওসব ঘরই নেই। server-এও একই ছাঁকনি বসানো আছে, কারণ
   ব্রাউজারের সদিচ্ছা নিরাপত্তার সীমানা নয়।

   ⚠️ ব্যর্থ হলে চুপচাপ — এটা সৌজন্যের কাজ; checkout কখনো এর জন্য আটকাবে না। */

export interface CheckoutLeadIn {
  clientKey: string;
  name?: string;
  phone?: string;
  email?: string;
  stage?: "CART" | "DETAILS" | "DELIVERY" | "PAYMENT";
  draft?: Record<string, unknown>;
  cart?: unknown;
  itemCount?: number;
  totalPaisa?: number;
}

export async function sendCheckoutLead(input: CheckoutLeadIn): Promise<void> {
  try {
    await fetch(`${baseFor()}/shop/checkout-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      /*  পাতা বন্ধ করে দিলেও যেন শেষ ping-টা পৌঁছায় — ঠিক যে মুহূর্তে
          "ছেড়ে যাওয়া" ঘটছে, সেই মুহূর্তের তথ্যটাই সবচেয়ে দরকারি।  */
      keepalive: true,
    });
  } catch {
    /* নীরব — সৌজন্যের কাজ কখনো checkout ভাঙবে না */
  }
}

/* ─────────────────── review submission ─────────────────── */

/**
 * গ্রাহকের review — সবসময় PENDING হয়ে ঢোকে, মালিকের moderation-এর পরে পর্দায়
 * (Admin → Storefront → Reviews)। উত্তরে কিছু ফেরত আসে না, ইচ্ছা করেই।
 */
export const submitReview = (input: {
  authorName: string;
  rating: number;
  body: string;
  productSlug?: string;
  context?: string;
  /** DEC-WEB-006 — the photo they attached (already uploaded) */
  imageUrl?: string;
  /** the logged-in session's phone; the server matches it to the customer book */
  customerPhone?: string;
}) => post<{ received: true }>("/shop/reviews", input);

export interface PlacedOrder {
  orderId: string;
  orderNo: string;
  totalPaisa: number;
  paymentMethod: string;
  needsPayment: boolean;
  /*  DEC-WA-010 — the order is already placed; this only says whether the
      success page should offer the code box. False for a number the shop has
      already proved, so regulars are never asked twice.  */
  needsPhoneVerify?: boolean;
  senderPhone?: string;
  /** DEC-RTN-015 — what store credit actually came off this bill, and why not, when not */
  storeCreditUsedPaisa?: number;
  storeCreditNote?: string | null;
}

export interface PaymentSession {
  tranId: string;
  amountPaisa: number;
  sandbox: boolean;
  gatewayUrl: string;
}

/* ─────────────────── the calls ─────────────────── */

/**
 * ⚠️ Failures come back as a VALUE, not a throw.
 *
 * A checkout screen has to say something specific when the shop refuses —
 * "out of stock", "COD not allowed with a crafted line", "the price changed" —
 * and those sentences arrive in the body of a 400 or 409. Throwing would
 * flatten all of them into "something went wrong", which tells the customer
 * nothing and tells us less.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; body?: unknown };

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${baseFor()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        /*  Nest puts the sentence in `message`; it is an array when class
            validators fire. Either way the customer gets words, not a code.  */
        message:
          (Array.isArray(json?.message) ? json.message.join(", ") : json?.message) ||
          "Something went wrong. Please try again.",
        body: json,
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Could not reach the shop. Check your connection and try again.",
    };
  }
}

/** browser cart line → the shape the API takes. `addonKeys` are AddOn ids. */
export function toQuoteItems(items: CartItem[]): QuoteItemIn[] {
  return items.map((i) => ({
    slug: i.slug,
    variantId: i.variantId,
    sizeId: i.sizeId,
    bundleIds: i.bundleIds,
    addonIds: i.addonKeys,
    persoText: i.persoText,
    // DEC-PRD-061 — the stored URL, not the file. See `uploadPersoPhoto`.
    persoImageUrl: i.persoImage,
    qty: i.qty,
  }));
}

/**
 * DEC-PRD-061 — put the customer's photograph somewhere the shop can reach it,
 * and give back the URL that travels with the order.
 *
 * ⚠️ IT IS UPLOADED HERE, ON THE PRODUCT PAGE, not at checkout. The photo is
 * printed on the goods (the owner's ruling, 30 Aug), so it can be several
 * megabytes on a phone connection — and a customer who has already typed an
 * address must not sit watching a progress bar, or lose a whole basket because
 * one picture failed. By the time checkout runs there is only a short string
 * to send.
 *
 * Throws with the server's own sentence, because that sentence names the thing
 * the customer can fix ("Image is 14.2 MB. The limit is 10 MB.").
 */
export async function uploadPersoPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${baseFor()}/media/upload/perso-photo`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(b?.message ?? "Could not upload the photo. Please try again.");
  }
  return ((await res.json()) as { url: string }).url;
}

export const zoneCodeFor = (z: Zone | null): "DHAKA" | "BANGLADESH" =>
  z === "bangladesh" ? "BANGLADESH" : "DHAKA";

/** null on failure — the caller must show that, never a made-up number */
export async function fetchQuote(input: QuoteIn): Promise<Quote | null> {
  const r = await post<Quote>("/shop/checkout/quote", input);
  if (!r.ok) {
    console.warn(`[checkout] quote → ${r.status} ${r.message}`);
    return null;
  }
  return r.data;
}

export async function fetchDeliveryMenu(
  zone: Zone | null,
): Promise<DeliveryMethodOption[] | null> {
  try {
    const res = await fetch(
      `${baseFor()}/shop/delivery/menu?zone=${zoneCodeFor(zone)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as DeliveryMethodOption[];
  } catch {
    return null;
  }
}

/**
 * ⚠️ ALWAYS PASS `expectedTotalPaisa` — the total the button showed.
 *
 * Between the last quote and the press, an offer can expire or the owner can
 * change a price. The server refuses (409) rather than charging more than was
 * agreed, and the screen re-quotes and asks again. Omitting it turns that
 * protection off silently.
 */
export const placeOrder = (input: PlaceOrderIn) =>
  post<PlacedOrder>("/shop/checkout", input);

/*  The one-time code (DEC-WA-010).

    The order is already placed before either of these is called — nothing
    here can undo it, and a customer who ignores the whole step still has
    their order. The point is only to learn whether the number we will send
    every update to is a number that actually receives.  */

export const resendPhoneCode = (phone: string, email?: string) =>
  post<{
    sent: boolean;
    via: "WHATSAPP" | "SMS" | "EMAIL" | null;
    to: string | null;
    expiresInSec: number;
    error?: string;
  }>("/shop/otp/send", { phone, purpose: "CHECKOUT", email });

/*  DEC-RTN-015 part 2 — ask for a code so store credit can be spent. The answer
    is the same for every number, so it can never be used to find out who shops
    here or what they have saved.  */
export const sendCreditCode = (phone: string) =>
  post<{ sent: boolean }>("/shop/checkout/credit-code", { phone });

export const confirmPhoneCode = (phone: string, code: string) =>
  post<{ ok: boolean }>("/shop/confirm-phone", { phone, code });

export const createPaymentSession = (orderId: string) =>
  post<PaymentSession>("/shop/payment/session", { orderId });

/* ── `/pay/{orderNo}` — WhatsApp-এর "পেমেন্ট হয়নি" বার্তার বোতাম (DEC-WA-003) ──
   ⚠️ ফোন নম্বর চাওয়া হয় না। এটা হারানো order ফেরানোর পথ; টাকা দেওয়ার
   পাতায় বাড়তি প্রতিটা ঘর মানে আরও কিছু মানুষ ঝরে যাওয়া। তাই server-ও
   ব্যক্তিগত কিছু ফেরত পাঠায় না — শুধু order নম্বর আর বাকি টাকা। */

export interface AmountDue {
  found: boolean;
  orderNo?: string;
  duePaisa?: number;
  paid?: boolean;
  cancelled?: boolean;
  isCod?: boolean;
}

export async function fetchAmountDue(orderNo: string): Promise<AmountDue | null> {
  try {
    const res = await fetch(
      `${baseFor()}/shop/payment/due/${encodeURIComponent(orderNo)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as AmountDue;
  } catch {
    return null;
  }
}

export const createPaymentSessionByNo = (orderNo: string) =>
  post<PaymentSession>("/shop/payment/session-by-no", { orderNo });

/* ── `/cart/{leadId}` — abandoned বার্তার "Return to cart" বোতাম (DEC-WA-004) ──
   ⚠️ server ব্যক্তিগত কিছু ফেরত পাঠায় না — নাম, ফোন, ঠিকানা কিছুই নয়।
   শুধু কী রেখে গিয়েছিলেন। */

export interface SavedCart {
  found: boolean;
  cart?: {
    items?: unknown[];
    summary?: { name?: string; slug?: string; qty?: number; size?: string; variant?: string }[];
  } | null;
  itemCount?: number;
  totalPaisa: number;
  alreadyOrdered?: boolean;
}

export async function fetchSavedCart(leadId: string): Promise<SavedCart | null> {
  try {
    const res = await fetch(
      `${baseFor()}/shop/checkout-lead/${encodeURIComponent(leadId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as SavedCart;
  } catch {
    return null;
  }
}

/** ওই দিনে কোন slot-এ কয়টা order — "Available/Full" এর সত্যিকারের গোনা */
export async function fetchSlotLoad(date: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`${baseFor()}/shop/delivery/slot-load?date=${encodeURIComponent(date)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, number>;
  } catch {
    return null;
  }
}

/* ─────────────────── track ─────────────────── */

/** timeline only — no prices, no address, no gift message (locked: সোবুজ) */
export interface TrackedOrder {
  orderNo: string;
  placedAt: string;
  /** 0..5 — placed·confirmed·ready·out·delivered এর কয়টা পেরিয়েছে */
  stage: number;
  cancelled: boolean;
  methodLabel: string | null;
  slotLabel: string | null;
  date: string | null;
  etaLabel: string | null;
  photoUpdates: boolean;
  /** DEC-SAL-016 — when each step happened; null = not reached (or an order
   *  older than the columns). Times only, never who or why. */
  steps?: {
    placedAt: string;
    confirmedAt: string | null;
    preparingAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
  };
}

/**
 * ⚠️ Number + phone TOGETHER, and a miss is indistinguishable from a
 * nonexistent order. The number rides on a gift card through unknown hands;
 * alone it must open nothing.
 */
export async function trackOrder(
  orderNo: string,
  phone: string,
): Promise<TrackedOrder | null> {
  try {
    const res = await fetch(
      `${baseFor()}/shop/track?orderNo=${encodeURIComponent(orderNo.trim())}` +
        `&phone=${encodeURIComponent(phone.trim())}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as TrackedOrder;
  } catch {
    return null;
  }
}

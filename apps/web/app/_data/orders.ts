import { getMethod, type MethodId } from "./delivery";
import {
  type Order,
  type OrderEvent,
  type OrderLineSnapshot,
  type OrderStatus,
} from "./order";
import { PAYMENT_METHODS, type PaymentId } from "./payment";
import type { Zone } from "../_store/useZoneStore";

/*
  ═══════════════════════════════════════════════════════════════════
  ORDER HISTORY — seed data + selectors।

  Dashboard/order-history-র জন্য নমুনা order। এগুলো demo customer-এর
  (auth.ts-এর DEMO_CUSTOMER) — যাতে login করলেই ভরা history দেখা যায়।

  ⚠️ live order (useOrderStore-এ সদ্য placed) সবসময় seed-এর আগে বসে,
  আর id মিললে live-টাই জেতে (duplicate নয়)।

  ⇄ SWAP HERE — Ecommerce module lock হলে getAllOrders() হবে
  GET /orders (customer-scoped), findOrder() হবে GET /orders/:id।
  seed মুছে যাবে; shape এক থাকবে।
  ═══════════════════════════════════════════════════════════════════
*/

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** demo customer — auth.ts-এর DEMO_CUSTOMER-এর সাথে মিল রাখা */
const SENDER = {
  name: "Nusrat Jahan",
  phone: "+8801712345678",
  email: "nusrat.jahan@example.com",
};

/* status flow — timeline অটো-বানানোর জন্য */
const FLOW: OrderStatus[] = [
  "placed",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
];

function timelineFor(status: OrderStatus, placedAt: number): OrderEvent[] {
  if (status === "cancelled") {
    return [
      { status: "placed", at: placedAt },
      { status: "confirmed", at: placedAt + 25 * 60_000 },
      {
        status: "cancelled",
        at: placedAt + 90 * 60_000,
        note: "Customer requested cancellation — refund initiated",
      },
    ];
  }
  const idx = FLOW.indexOf(status);
  return FLOW.slice(0, idx + 1).map((s, i) => ({
    status: s,
    at: placedAt + i * 40 * 60_000,
  }));
}

/* ─── line helper ─── */
function line(
  slug: string,
  name: string,
  bg: string,
  sizeLabel: string,
  qty: number,
  unitPaisa: number,
  extra?: { bundleLabel?: string; addonLabels?: string[]; persoText?: string },
): OrderLineSnapshot {
  return {
    slug,
    name,
    bg,
    /*  পুরনো demo order-গুলোয় variant ছিল না — DEC-PRD-012-এর আগে
        রঙ মানেই আলাদা product ছিল।  */
    variantLabel: null,
    sizeLabel,
    bundleLabels: extra?.bundleLabel ? [extra.bundleLabel] : [],
    addonLabels: extra?.addonLabels ?? [],
    persoText: extra?.persoText,
    qty,
    unitPaisa,
    linePaisa: unitPaisa * qty,
  };
}

/* ─── order factory — বাকি সব ফিল্ড compute ─── */
interface SeedInput {
  id: string;
  placedAt: number;
  status: OrderStatus;
  isGift?: boolean;
  recipient?: { name: string; phone: string } | null;
  giftMessage?: string;
  anonymousGift?: boolean;
  photoUpdates?: boolean;
  zone: Zone;
  address: string;
  method: MethodId;
  date?: string | null;
  slotLabel?: string | null;
  payment: PaymentId;
  couponCode?: string | null;
  discountPaisa?: number;
  deliveryPaisa: number;
  deliveryWaivedPaisa?: number;
  lines: OrderLineSnapshot[];
  etaOut: string;
  etaDone: string;
}

function mk(s: SeedInput): Order {
  const subtotalPaisa = s.lines.reduce((sum, l) => sum + l.linePaisa, 0);
  const discountPaisa = s.discountPaisa ?? 0;
  const totalPaisa = Math.max(0, subtotalPaisa - discountPaisa) + s.deliveryPaisa;

  return {
    id: s.id,
    placedAt: s.placedAt,
    status: s.status,
    timeline: timelineFor(s.status, s.placedAt),

    sender: { ...SENDER },
    isGift: s.isGift ?? false,
    recipient: s.recipient ?? null,
    giftMessage: s.giftMessage ?? "",
    anonymousGift: s.anonymousGift ?? false,
    photoUpdates: s.photoUpdates ?? true,

    zone: s.zone,
    address: s.address,
    deliveryNotes: "",
    method: s.method,
    /*  seed order-গুলো হাতে-লেখা id-ই ব্যবহার করে, তাই খোঁজ মেলে। না মিললে
        id-টাই লেখা হয় — নিঃশব্দে অন্য কারো নাম বসানোর চেয়ে ভালো।  */
    methodLabel: getMethod(s.method)?.label ?? s.method,
    date: s.date ?? null,
    slotLabel: s.slotLabel ?? null,

    payment: s.payment,
    paymentLabel:
      PAYMENT_METHODS.find((p) => p.id === s.payment)?.label ?? "Payment",

    lines: s.lines,

    subtotalPaisa,
    couponCode: s.couponCode ?? null,
    discountPaisa,
    deliveryPaisa: s.deliveryPaisa,
    deliveryWaivedPaisa: s.deliveryWaivedPaisa ?? 0,
    totalPaisa,

    etaOut: s.etaOut,
    etaDone: s.etaDone,
  };
}

/* now — module-level; demo timestamps এর relative */
const NOW = Date.now();

/* ─────────────────── SEED ORDERS ─────────────────── */
export const SEED_ORDERS: Order[] = [
  /* 1 — out for delivery, আজ */
  mk({
    id: "RAD-58217",
    placedAt: NOW - 5 * HOUR,
    status: "out_for_delivery",
    zone: "dhaka",
    address: "House 42, Road 11, Banani, Dhaka 1213",
    method: "sameday",
    slotLabel: "3 PM – 6 PM",
    payment: "online",
    deliveryPaisa: 8000,
    etaOut: "Today, on the way",
    etaDone: "Today, 3 PM – 6 PM",
    lines: [
      line(
        "white-orchid-elegance",
        "White Orchid Elegance",
        "linear-gradient(160deg,#F1E6F8,#DFC8F0)",
        "Grand",
        1,
        329000,
        { addonLabels: ["Greeting card"] },
      ),
    ],
  }),

  /* 2 — preparing, gift, midnight, আজ রাত */
  mk({
    id: "RAD-58109",
    placedAt: NOW - 9 * HOUR,
    status: "preparing",
    isGift: true,
    recipient: { name: "Tania Akter", phone: "+8801811223344" },
    giftMessage: "Happy Anniversary, my love. Forever yours.",
    zone: "dhaka",
    address: "Flat 5B, House 30, Dhanmondi 27, Dhaka 1209",
    method: "midnight",
    slotLabel: "12:00 AM sharp",
    payment: "online",
    deliveryPaisa: 15000,
    etaOut: "Tonight, 11 PM",
    etaDone: "Tonight, 12:00 AM sharp",
    lines: [
      line(
        "soft-peony-dream",
        "Soft Peony Dream",
        "linear-gradient(160deg,#EFE4F8,#DBC3F0)",
        "Premium",
        1,
        279000,
        { bundleLabel: "With chocolate box" },
      ),
      line(
        "chocolate-fudge-celebration-cake",
        "Chocolate Fudge Celebration Cake",
        "linear-gradient(160deg,#F6EBE2,#E9D2BE)",
        "1 lb",
        1,
        95000,
      ),
    ],
  }),

  /* 3 — confirmed, scheduled, আগামীকাল */
  mk({
    id: "RAD-57984",
    placedAt: NOW - 1 * DAY,
    status: "confirmed",
    zone: "dhaka",
    address: "House 7, Road 5, Uttara Sector 4, Dhaka 1230",
    method: "scheduled",
    slotLabel: "10 AM – 1 PM",
    payment: "cod",
    deliveryPaisa: 6000,
    etaOut: "Tomorrow, before your slot",
    etaDone: "Tomorrow, 10 AM – 1 PM",
    lines: [
      line(
        "birthday-balloon-bouquet",
        "Birthday Balloon Bouquet",
        "linear-gradient(160deg,#F9EAF3,#F0CBE2)",
        "Standard",
        1,
        189000,
        { addonLabels: ["Birthday card", "Scented candle"] },
      ),
    ],
  }),

  /* 4 — delivered, ৫ দিন আগে, coupon */
  mk({
    id: "RAD-57310",
    placedAt: NOW - 5 * DAY,
    status: "delivered",
    zone: "dhaka",
    address: "House 12, Road 8, Gulshan 1, Dhaka 1212",
    method: "express",
    payment: "online",
    couponCode: "WELCOME10",
    discountPaisa: 6900,
    deliveryPaisa: 12000,
    etaOut: "Delivered",
    etaDone: "Delivered in 2 hours",
    lines: [
      line(
        "velvet-red-24-premium-roses",
        "Velvet Red — 24 Premium Roses",
        "linear-gradient(160deg,#F8E4E8,#EFC5CF)",
        "24 stems",
        1,
        690000,
        { addonLabels: ["Greeting card"] },
      ),
    ],
  }),

  /* 5 — cancelled, ৮ দিন আগে */
  mk({
    id: "RAD-56802",
    placedAt: NOW - 8 * DAY,
    status: "cancelled",
    zone: "dhaka",
    address: "House 19, Road 3, Mohammadpur, Dhaka 1207",
    method: "sameday",
    slotLabel: "6 PM – 9 PM",
    payment: "online",
    deliveryPaisa: 8000,
    etaOut: "—",
    etaDone: "Cancelled",
    lines: [
      line(
        "rose-pink-birthday-cake",
        "Rose Pink Birthday Cake",
        "linear-gradient(160deg,#FAE9F1,#F0CBDE)",
        "2 lb",
        1,
        165000,
      ),
    ],
  }),

  /* 6 — delivered, ২১ দিন আগে, nationwide courier */
  mk({
    id: "RAD-55471",
    placedAt: NOW - 21 * DAY,
    status: "delivered",
    isGift: true,
    recipient: { name: "Rafiul Islam", phone: "+8801933445566" },
    giftMessage: "Congratulations on the new home!",
    anonymousGift: false,
    zone: "bangladesh",
    address: "Ward 6, Zindabazar, Sylhet 3100",
    method: "courier",
    payment: "cod",
    deliveryPaisa: 12000,
    etaOut: "Delivered",
    etaDone: "Delivered",
    lines: [
      line(
        "blush-romance-12-pink-roses",
        "Blush Romance — 12 Pink Roses",
        "linear-gradient(160deg,#F8E7F5,#EDC7E6)",
        "12 stems",
        2,
        149000,
      ),
    ],
  }),
];

/* ─────────────────── SELECTORS ─────────────────── */

/* পুরনো session-এ placed order-এ status/timeline নাও থাকতে পারে
   (field যোগ হওয়ার আগের localStorage)। crash এড়াতে backfill। */
function normalizeLive(o: Order | null): Order | null {
  if (!o) return null;
  if (o.status && o.timeline) return o;
  return {
    ...o,
    status: o.status ?? "placed",
    timeline: o.timeline ?? [{ status: "placed", at: o.placedAt }],
  };
}

/** live (সদ্য placed) order seed-এর সাথে merge — id মিললে live জেতে,
    সব placedAt desc-এ sort */
export function getAllOrders(liveRaw: Order | null): Order[] {
  const live = normalizeLive(liveRaw);
  const seed = live
    ? SEED_ORDERS.filter((o) => o.id !== live.id)
    : SEED_ORDERS;
  const all = live ? [live, ...seed] : seed;
  return [...all].sort((a, b) => b.placedAt - a.placedAt);
}

export function findOrder(id: string, live: Order | null): Order | null {
  return getAllOrders(live).find((o) => o.id === id) ?? null;
}

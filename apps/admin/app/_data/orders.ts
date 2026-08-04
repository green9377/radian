import { formatTaka } from "./products";
import { findCustomer, shortDate, ago } from "./customers";
import type { Zone } from "./products";

/*
  ═══════════════════════════════════════════════════════════════════
  ORDERS — admin mock data model (Sales Management module).

  This is Online Sales. POS is a SEPARATE module (locked decision) — walk-in
  orders never land in this table.

  ⇄ SWAP HERE — Sales module lock হলে:
    list -> GET /orders (paginated, searchable, staff-scoped)
    one  -> GET /orders/:id
    act  -> POST /orders/:id/confirm | /cancel   (writes audit + timeline)

  ── Locked rules made real here ─────────────────────────────────────
  · Money = integer PAISA everywhere. Taka only for display (formatTaka).
  · Two owners, two status tracks (One Data One Owner):
      salesStatus    → owned by SALES     (placed / confirmed / completed / cancelled)
      deliveryStatus → owned by DELIVERY  (unassigned / preparing / out / delivered / failed / stock_reverted)
    The customer sees ONE merged tracker; internally they are separate.
  · DEC-MOD-003 — stock −1 fires at Delivery "preparing", NOT at Sales confirm.
  · salesCount +1 and Customer LTV / ordersCount increment at DELIVERED
    (sobuj, 16 Jul). Cancel before delivered => no count, no LTV.
  · Self vs Gift = order-level attribute (isGift), not a separate order type.
  · Readymade vs Crafted = per-LINE flag (productType) — cancel/refund branches on it.
  · Cancellation refund = PER LINE (sobuj, 16 Jul): readymade refunded in full,
    crafted keeps the advance (forfeited once preparing).
  · COD: self orders only — never gift, never any crafted/prepaidOnly line.
  · Customer / Product are referenced by FK (customerId, line.productId). The
    sender snapshot is kept on the order as the frozen receipt (contract), the
    live customer name is always resolved from Customer (findCustomer).
  · Soft-delete only (deletedAt) · audit + unified timeline on every order.
  ═══════════════════════════════════════════════════════════════════
*/

/* ─────────── enums ─────────── */

/** Online sub-channels only. POS = separate module. */
export type Channel = "website" | "facebook" | "instagram" | "whatsapp" | "phone";

export const CHANNEL_LABEL: Record<Channel, string> = {
  website: "Website",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone",
};

/** Drives cancellation / advance / failed-delivery logic (locked). */
export type ProductType = "readymade" | "crafted";

/** SALES owns this. */
export type SalesStatus = "placed" | "confirmed" | "completed" | "cancelled";

/** DELIVERY owns this. "stock_reverted" ≠ a Sales "return" — kept distinct. */
export type DeliveryStatus =
  | "unassigned"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "stock_reverted";

export type PaymentMethod = "online" | "cod";

export type PaymentStatus =
  | "unpaid"
  | "advance_paid"
  | "paid"
  | "cod_collected"
  | "partially_refunded"
  | "refunded";

/* ─────────── status display meta (single source, like web order.ts) ─────────── */

export interface StatusMeta {
  label: string;
  /** tailwind chip classes (admin brand palette) */
  chip: string;
  /** short dot colour class */
  dot: string;
}

export const SALES_STATUS_META: Record<SalesStatus, StatusMeta> = {
  placed: { label: "Placed", chip: "bg-lavender text-purple border-lavender-deep", dot: "bg-orchid" },
  confirmed: { label: "Confirmed", chip: "bg-[#eef2ff] text-[#4338ca] border-[#dde3ff]", dot: "bg-[#4338ca]" },
  completed: { label: "Completed", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  cancelled: { label: "Cancelled", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, StatusMeta> = {
  unassigned: { label: "Not started", chip: "bg-lavender-deep/50 text-body-soft border-lavender-deep", dot: "bg-body-soft" },
  preparing: { label: "Preparing", chip: "bg-[#fff4e6] text-[#b45309] border-[#fce4c4]", dot: "bg-[#b45309]" },
  out_for_delivery: { label: "Out for delivery", chip: "bg-[#eaf6ff] text-[#0369a1] border-[#cde9fb]", dot: "bg-[#0369a1]" },
  delivered: { label: "Delivered", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  failed: { label: "Delivery failed", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
  stock_reverted: { label: "Stock reverted", chip: "bg-[#f4ecff] text-purple border-lavender-deep", dot: "bg-orchid" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  unpaid: { label: "COD due", chip: "bg-[#fff4e6] text-[#b45309] border-[#fce4c4]", dot: "bg-[#b45309]" },
  advance_paid: { label: "Advance paid", chip: "bg-[#eef2ff] text-[#4338ca] border-[#dde3ff]", dot: "bg-[#4338ca]" },
  paid: { label: "Paid", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  cod_collected: { label: "COD collected", chip: "bg-[#e8f9ee] text-[#0e7a3d] border-[#c4eed4]", dot: "bg-[#0e7a3d]" },
  partially_refunded: { label: "Part refunded", chip: "bg-[#f4ecff] text-purple border-lavender-deep", dot: "bg-orchid" },
  refunded: { label: "Refunded", chip: "bg-[#fbecec] text-[#b42318] border-[#f5d5d2]", dot: "bg-[#b42318]" },
};

/* ─────────── entities ─────────── */

export interface OrderLine {
  id: string;
  /** FK → Product (One Data One Owner). name/price below are the frozen snapshot. */
  productId: string;
  name: string;
  bg: string;
  sizeLabel: string;
  bundleLabel: string | null;
  addonLabels: string[];
  persoText?: string;
  /** per-line: drives cancel/refund branch (locked) */
  productType: ProductType;
  qty: number;
  unitPaisa: number;
  linePaisa: number;
  /** set on cancellation — per-line refund (readymade full, crafted keeps advance) */
  refundPaisa?: number;
  refundNote?: string;
}

export type TimelineKind = "sales" | "delivery" | "payment" | "system";

export interface OrderEvent {
  at: number;
  kind: TimelineKind;
  label: string;
  /** who did it — audit */
  actor: string;
  note?: string;
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  paidPaisa: number;
  duePaisa: number;
  refundPaisa: number;
}

/**
 * Proof photo — owned by DELIVERY (kitchen photographs the made product before
 * dispatch; rider photographs the handover at the door). Sales only displays it.
 * `bg` is a gradient stand-in until real image upload (Cloudinary) is wired.
 * ⇄ SWAP HERE: url from Delivery module / media store.
 */
export interface OrderPhoto {
  at: number;
  by: string;
  caption: string;
  bg: string;
}

export interface Order {
  id: string; // RAD-XXXXX
  placedAt: number;
  channel: Channel;

  /* who — FK + frozen receipt snapshot */
  customerId: string;
  sender: { name: string; phone: string; email?: string };

  /* self vs gift (order-level attribute) */
  isGift: boolean;
  recipient: { name: string; phone: string; customerId?: string } | null;
  giftMessage: string;
  anonymousGift: boolean;
  photoUpdates: boolean;

  /* two-track status */
  salesStatus: SalesStatus;
  deliveryStatus: DeliveryStatus;
  timeline: OrderEvent[];

  /* delivery info (Delivery module executes; Sales only references) */
  zone: Zone;
  address: string;
  deliveryNotes: string;
  methodLabel: string;
  date: string | null;
  slotLabel: string | null;

  /* payment */
  payment: OrderPayment;

  /* lines + money (all paisa) */
  lines: OrderLine[];
  subtotalPaisa: number;
  couponCode: string | null;
  discountPaisa: number;
  deliveryPaisa: number;
  deliveryWaivedPaisa: number;
  totalPaisa: number;

  etaLabel: string;

  /* proof photos — Delivery-owned, shown here (before + after delivery) */
  prepPhoto?: OrderPhoto | null;
  deliveryPhoto?: OrderPhoto | null;

  /* private staff note on the order (never shown to customer) */
  internalNote?: string;

  /* soft-delete (never hard delete) */
  deletedAt?: number | null;
}

/**
 * What a staff member may still change, given where the order is.
 * Rationale (locked): price is frozen (contract) and stock deducts at Delivery
 * "preparing" (DEC-MOD-003) — so items lock once preparation starts, and the
 * route locks once the rider is out. Notes stay open until the order closes.
 */
export interface EditGates {
  items: boolean;
  recipient: boolean;
  delivery: boolean; // address / slot / method
  notes: boolean; // gift message + staff notes
}

export function editableFields(o: Order): EditGates {
  if (o.salesStatus === "cancelled" || o.salesStatus === "completed")
    return { items: false, recipient: false, delivery: false, notes: false };
  if (o.deliveryStatus === "out_for_delivery")
    return { items: false, recipient: false, delivery: false, notes: true };
  if (o.deliveryStatus === "preparing")
    return { items: false, recipient: true, delivery: true, notes: true };
  // placed / confirmed, not yet preparing — fully editable
  return { items: true, recipient: true, delivery: true, notes: true };
}

/* ─────────── helpers ─────────── */

export { formatTaka, shortDate, ago };

/** any crafted / made-to-order line? → COD blocked, advance applies */
export function hasCrafted(o: Order): boolean {
  return o.lines.some((l) => l.productType === "crafted");
}

/** does this order still need a staff action? (drives "Needs action" stat) */
export function needsAction(o: Order): boolean {
  return o.salesStatus === "placed";
}

/** "3:00 PM" style time from ms */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ─────────── seed line helper ─────────── */
let _lid = 0;
function line(
  productId: string,
  name: string,
  bg: string,
  sizeLabel: string,
  productType: ProductType,
  qty: number,
  unitPaisa: number,
  extra?: { bundleLabel?: string; addonLabels?: string[]; persoText?: string; refundPaisa?: number; refundNote?: string },
): OrderLine {
  return {
    id: `ln-${++_lid}`,
    productId,
    name,
    bg,
    sizeLabel,
    bundleLabel: extra?.bundleLabel ?? null,
    addonLabels: extra?.addonLabels ?? [],
    persoText: extra?.persoText,
    productType,
    qty,
    unitPaisa,
    linePaisa: unitPaisa * qty,
    refundPaisa: extra?.refundPaisa,
    refundNote: extra?.refundNote,
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-07-16T12:00:00Z");

/* Nusrat is the demo sender (cus-nusrat). Recipients tie to real customers where they exist. */
const NUSRAT = { name: "Nusrat Jahan", phone: "+8801712345678", email: "nusrat.jahan@example.com" };
const FARHANA = { name: "Farhana Rahman", phone: "+14155550142", email: "farhana.r@example.com" };

/* ─────────── seed orders ─────────── */
export const ORDERS: Order[] = [
  /* 1 — OUT FOR DELIVERY · self · website · paid */
  {
    id: "RAD-58217",
    placedAt: NOW - 5 * HOUR,
    channel: "website",
    customerId: "cus-nusrat",
    sender: NUSRAT,
    isGift: false,
    recipient: null,
    giftMessage: "",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "confirmed",
    deliveryStatus: "out_for_delivery",
    timeline: [
      { at: NOW - 5 * HOUR, kind: "sales", actor: "System", label: "Order placed on website" },
      { at: NOW - 5 * HOUR + 20 * 60_000, kind: "payment", actor: "SSLCommerz", label: "Online payment received — ৳3,370" },
      { at: NOW - 5 * HOUR + 30 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Order confirmed" },
      { at: NOW - 2 * HOUR, kind: "delivery", actor: "Kitchen", label: "Preparing — stock −1 (DEC-MOD-003)" },
      { at: NOW - 40 * 60_000, kind: "delivery", actor: "Rider · Sohel", label: "Out for delivery" },
    ],
    zone: "dhaka",
    address: "House 42, Road 11, Banani, Dhaka 1213",
    deliveryNotes: "Call on arrival, 4th floor.",
    methodLabel: "Same Day",
    date: null,
    slotLabel: "3 PM – 6 PM",
    payment: { method: "online", status: "paid", paidPaisa: 337000, duePaisa: 0, refundPaisa: 0 },
    lines: [
      line("white-orchid-elegance", "White Orchid Elegance", "linear-gradient(160deg,#F1E6F8,#DFC8F0)", "Grand", "readymade", 1, 329000, { addonLabels: ["Greeting card"] }),
    ],
    subtotalPaisa: 329000,
    couponCode: null,
    discountPaisa: 0,
    deliveryPaisa: 8000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 337000,
    etaLabel: "Today, 3 PM – 6 PM",
    prepPhoto: { at: NOW - 90 * 60_000, by: "Kitchen · Shila", caption: "Bouquet ready before dispatch", bg: "linear-gradient(160deg,#F1E6F8,#DFC8F0)" },
    deliveryPhoto: null,
    internalNote: "Regular customer — wrap with the premium ribbon.",
  },

  /* 2 — PREPARING · gift · whatsapp · midnight · paid */
  {
    id: "RAD-58109",
    placedAt: NOW - 9 * HOUR,
    channel: "whatsapp",
    customerId: "cus-nusrat",
    sender: NUSRAT,
    isGift: true,
    recipient: { name: "Tania Akter", phone: "+8801811223344", customerId: "cus-tania" },
    giftMessage: "Happy Anniversary, my love. Forever yours.",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "confirmed",
    deliveryStatus: "preparing",
    timeline: [
      { at: NOW - 9 * HOUR, kind: "sales", actor: "System", label: "Order placed via WhatsApp" },
      { at: NOW - 9 * HOUR + 15 * 60_000, kind: "payment", actor: "SSLCommerz", label: "Online payment received — ৳3,890" },
      { at: NOW - 9 * HOUR + 25 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Order confirmed" },
      { at: NOW - 1 * HOUR, kind: "delivery", actor: "Kitchen", label: "Preparing — stock −1 (DEC-MOD-003)" },
    ],
    zone: "dhaka",
    address: "Flat 5B, House 30, Dhanmondi 27, Dhaka 1209",
    deliveryNotes: "",
    methodLabel: "Midnight Surprise",
    date: "2026-07-16",
    slotLabel: "12:00 AM sharp",
    payment: { method: "online", status: "paid", paidPaisa: 389000, duePaisa: 0, refundPaisa: 0 },
    lines: [
      line("soft-peony-dream", "Soft Peony Dream", "linear-gradient(160deg,#EFE4F8,#DBC3F0)", "Premium", "readymade", 1, 279000, { bundleLabel: "With chocolate box" }),
      line("chocolate-fudge-celebration-cake", "Chocolate Fudge Celebration Cake", "linear-gradient(160deg,#F6EBE2,#E9D2BE)", "1 lb", "crafted", 1, 95000),
    ],
    subtotalPaisa: 374000,
    couponCode: null,
    discountPaisa: 0,
    deliveryPaisa: 15000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 389000,
    etaLabel: "Tonight, 12:00 AM sharp",
    prepPhoto: { at: NOW - 45 * 60_000, by: "Kitchen · Shila", caption: "Peony arrangement + chocolate box", bg: "linear-gradient(160deg,#EFE4F8,#DBC3F0)" },
    deliveryPhoto: null,
    internalNote: "Anniversary — attach the handwritten card, no invoice inside.",
  },

  /* 3 — NEEDS ACTION (placed, not confirmed) · self · website · COD due */
  {
    id: "RAD-58042",
    placedAt: NOW - 40 * 60_000,
    channel: "website",
    customerId: "cus-nusrat",
    sender: NUSRAT,
    isGift: false,
    recipient: null,
    giftMessage: "",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "placed",
    deliveryStatus: "unassigned",
    timeline: [
      { at: NOW - 40 * 60_000, kind: "sales", actor: "System", label: "Order placed on website — awaiting staff confirmation" },
    ],
    zone: "dhaka",
    address: "House 7, Road 5, Uttara Sector 4, Dhaka 1230",
    deliveryNotes: "",
    methodLabel: "Schedule It",
    date: "2026-07-17",
    slotLabel: "10 AM – 1 PM",
    payment: { method: "cod", status: "unpaid", paidPaisa: 0, duePaisa: 195000, refundPaisa: 0 },
    lines: [
      line("birthday-balloon-bouquet", "Birthday Balloon Bouquet", "linear-gradient(160deg,#F9EAF3,#F0CBE2)", "Standard", "readymade", 1, 189000, { addonLabels: ["Birthday card", "Scented candle"] }),
    ],
    subtotalPaisa: 189000,
    couponCode: null,
    discountPaisa: 0,
    deliveryPaisa: 6000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 195000,
    etaLabel: "Tomorrow, 10 AM – 1 PM",
  },

  /* 4 — DELIVERED · self · express · coupon · paid (LTV counted here) */
  {
    id: "RAD-57310",
    placedAt: NOW - 5 * DAY,
    channel: "website",
    customerId: "cus-nusrat",
    sender: NUSRAT,
    isGift: false,
    recipient: null,
    giftMessage: "",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "completed",
    deliveryStatus: "delivered",
    timeline: [
      { at: NOW - 5 * DAY, kind: "sales", actor: "System", label: "Order placed on website" },
      { at: NOW - 5 * DAY + 10 * 60_000, kind: "payment", actor: "SSLCommerz", label: "Online payment received — ৳6,951" },
      { at: NOW - 5 * DAY + 20 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Order confirmed" },
      { at: NOW - 5 * DAY + 40 * 60_000, kind: "delivery", actor: "Kitchen", label: "Preparing — stock −1 (DEC-MOD-003)" },
      { at: NOW - 5 * DAY + 90 * 60_000, kind: "delivery", actor: "Rider · Sohel", label: "Delivered" },
      { at: NOW - 5 * DAY + 92 * 60_000, kind: "system", actor: "System", label: "Sales completed — salesCount +1, Customer LTV +৳6,951" },
    ],
    zone: "dhaka",
    address: "House 12, Road 8, Gulshan 1, Dhaka 1212",
    deliveryNotes: "",
    methodLabel: "2-Hour Express",
    date: null,
    slotLabel: null,
    payment: { method: "online", status: "paid", paidPaisa: 695100, duePaisa: 0, refundPaisa: 0 },
    lines: [
      line("velvet-red-24-premium-roses", "Velvet Red — 24 Premium Roses", "linear-gradient(160deg,#F8E4E8,#EFC5CF)", "24 stems", "readymade", 1, 690000, { addonLabels: ["Greeting card"] }),
    ],
    subtotalPaisa: 690000,
    couponCode: "WELCOME10",
    discountPaisa: 6900,
    deliveryPaisa: 12000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 695100,
    etaLabel: "Delivered in 2 hours",
    prepPhoto: { at: NOW - 5 * DAY + 55 * 60_000, by: "Kitchen · Rana", caption: "24 roses arranged", bg: "linear-gradient(160deg,#F8E4E8,#EFC5CF)" },
    deliveryPhoto: { at: NOW - 5 * DAY + 90 * 60_000, by: "Rider · Sohel", caption: "Handed over at the door", bg: "linear-gradient(160deg,#EFE7DE,#D9C7B4)" },
  },

  /* 5 — CANCELLED after preparing · crafted line · per-line refund · stock reverted */
  {
    id: "RAD-56802",
    placedAt: NOW - 8 * DAY,
    channel: "facebook",
    customerId: "cus-nusrat",
    sender: NUSRAT,
    isGift: false,
    recipient: null,
    giftMessage: "",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "cancelled",
    deliveryStatus: "stock_reverted",
    timeline: [
      { at: NOW - 8 * DAY, kind: "sales", actor: "System", label: "Order placed via Facebook" },
      { at: NOW - 8 * DAY + 12 * 60_000, kind: "payment", actor: "SSLCommerz", label: "Online payment received — ৳2,470" },
      { at: NOW - 8 * DAY + 25 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Order confirmed" },
      { at: NOW - 8 * DAY + 60 * 60_000, kind: "delivery", actor: "Kitchen", label: "Preparing — stock −1 (DEC-MOD-003)" },
      { at: NOW - 8 * DAY + 90 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Cancelled — customer request", note: "Per-line refund: readymade cake refunded in full; crafted photo mug advance forfeited." },
      { at: NOW - 8 * DAY + 92 * 60_000, kind: "delivery", actor: "Kitchen", label: "Stock reverted (readymade line only)" },
      { at: NOW - 8 * DAY + 95 * 60_000, kind: "payment", actor: "SSLCommerz", label: "Refund ৳1,780 issued (part refund)" },
    ],
    zone: "dhaka",
    address: "House 19, Road 3, Mohammadpur, Dhaka 1207",
    deliveryNotes: "",
    methodLabel: "Same Day",
    date: null,
    slotLabel: "6 PM – 9 PM",
    payment: { method: "online", status: "partially_refunded", paidPaisa: 247000, duePaisa: 0, refundPaisa: 178000 },
    lines: [
      line("rose-pink-birthday-cake", "Rose Pink Birthday Cake", "linear-gradient(160deg,#FAE9F1,#F0CBDE)", "2 lb", "readymade", 1, 165000, { refundPaisa: 165000, refundNote: "Readymade — refunded in full" }),
      line("photo-print-mug", "Photo Print Mug", "linear-gradient(160deg,#EDE7F6,#D6C7EC)", "Standard", "crafted", 1, 76000, { persoText: "Happy Birthday Ammu", refundPaisa: 13000, refundNote: "Crafted — ৳630 advance forfeited, rest refunded" }),
    ],
    subtotalPaisa: 241000,
    couponCode: null,
    discountPaisa: 0,
    deliveryPaisa: 6000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 247000,
    etaLabel: "Cancelled",
  },

  /* 6 — DELIVERED · gift · courier nationwide · COD collected · NRB sender */
  {
    id: "RAD-55471",
    placedAt: NOW - 21 * DAY,
    channel: "website",
    customerId: "cus-farhana",
    sender: FARHANA,
    isGift: true,
    recipient: { name: "Rafiul Islam", phone: "+8801933445566", customerId: "cus-rafiul" },
    giftMessage: "Congratulations on the new home!",
    anonymousGift: false,
    photoUpdates: true,
    salesStatus: "completed",
    deliveryStatus: "delivered",
    timeline: [
      { at: NOW - 21 * DAY, kind: "sales", actor: "System", label: "Order placed on website (sender in USA)" },
      { at: NOW - 21 * DAY + 30 * 60_000, kind: "sales", actor: "Rima (CS)", label: "Order confirmed" },
      { at: NOW - 20 * DAY, kind: "delivery", actor: "Warehouse", label: "Preparing — stock −1 (DEC-MOD-003)" },
      { at: NOW - 19 * DAY, kind: "delivery", actor: "Courier · SA Paribahan", label: "Delivered in Sylhet" },
      { at: NOW - 19 * DAY, kind: "payment", actor: "Courier", label: "COD collected — ৳3,100" },
      { at: NOW - 19 * DAY, kind: "system", actor: "System", label: "Sales completed — salesCount +1, Customer LTV +৳3,100" },
    ],
    zone: "bangladesh",
    address: "Ward 6, Zindabazar, Sylhet 3100",
    deliveryNotes: "",
    methodLabel: "Nationwide Courier",
    date: null,
    slotLabel: null,
    payment: { method: "cod", status: "cod_collected", paidPaisa: 310000, duePaisa: 0, refundPaisa: 0 },
    lines: [
      line("blush-romance-12-pink-roses", "Blush Romance — 12 Pink Roses", "linear-gradient(160deg,#F8E7F5,#EDC7E6)", "12 stems", "readymade", 2, 149000),
    ],
    subtotalPaisa: 298000,
    couponCode: null,
    discountPaisa: 0,
    deliveryPaisa: 12000,
    deliveryWaivedPaisa: 0,
    totalPaisa: 310000,
    etaLabel: "Delivered",
    prepPhoto: { at: NOW - 20 * DAY, by: "Warehouse · Jamal", caption: "Packed for courier", bg: "linear-gradient(160deg,#F8E7F5,#EDC7E6)" },
    deliveryPhoto: { at: NOW - 19 * DAY, by: "Courier · SA Paribahan", caption: "Delivered in Sylhet", bg: "linear-gradient(160deg,#E7EFDE,#C9D9B4)" },
    internalNote: "NRB sender in USA — send delivery photo to her WhatsApp.",
  },
];

/* ─────────── selectors ─────────── */

export function findOrder(id: string): Order | undefined {
  return ORDERS.find((o) => o.id === id && !o.deletedAt);
}

/** live customer name from FK (One Data One Owner) — falls back to frozen snapshot. */
export function customerName(o: Order): string {
  return findCustomer(o.customerId)?.name ?? o.sender.name;
}

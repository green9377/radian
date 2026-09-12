/*
  Delivery module — demo data + demo-mode switch (§10.4 demo-fallback).
  The Fulfilment board must be fully explorable with no API and no orders, so the
  whole daily pipeline can be reviewed on localhost:3001 straight away.

  Locked rules reflected here:
  - Two status track / One Data One Owner: the board carries `deliveryStatus`
    (Delivery-owned) only. It never stores or edits salesStatus (Sales-owned).
  - DEC-MOD-003: stock -1 happens when an order enters "preparing". On this board
    the Assign action starts preparation -> that is the stock-commit moment.
  - Money = paisa integer.
  Couriers/riders below are demo placeholders. Step 2 (Courier & Rider master)
  replaces the hardcoded COURIERS array in api.ts with an admin-managed master.

  DATA REQUIREMENTS (for the later unified schema pass):
  - Delivery owns: assignment (order -> rider/courier), deliveryStatus transitions,
    proof photos, consignment id, fail reason. FK to Order (Sales-owned) by id.
  - Rider (in-house) is Delivery-owned now; later FK to Employee (Master Data).
  - deliveryType + zone drive availability/charge (Step 3 matrix), not stored here.
*/
import type { DeliveryStatus } from "./api";

const KEY = "radian-delivery-demo";
const DEFAULT_DEMO = true;
export function isDeliveryDemo(): boolean {
  if (typeof window === "undefined") return DEFAULT_DEMO;
  const v = window.localStorage.getItem(KEY);
  return v === null ? DEFAULT_DEMO : v === "1";
}
export function setDeliveryDemo(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
}

/* ---- delivery types: the promise the customer paid for ---- */
export type DeliveryType = "TWO_HOUR" | "SAME_DAY" | "MIDNIGHT" | "NATIONWIDE";
export const DELIVERY_TYPE_META: Record<
  DeliveryType,
  { label: string; short: string; icon: string; tone: string; urgent: boolean }
> = {
  TWO_HOUR: { label: "2-hour express", short: "2-hour", icon: "bolt", tone: "rose", urgent: true },
  SAME_DAY: { label: "Same day", short: "Same-day", icon: "clock", tone: "amber", urgent: false },
  MIDNIGHT: { label: "Midnight surprise", short: "Midnight", icon: "moon", tone: "purple", urgent: true },
  NATIONWIDE: { label: "Nationwide courier", short: "Nationwide", icon: "truck", tone: "blue", urgent: false },
};

/** best-effort: turn a free-text methodLabel from a real order into a delivery type */
export function deliveryTypeFromLabel(label?: string | null): DeliveryType {
  const s = (label || "").toLowerCase();
  if (s.includes("midnight")) return "MIDNIGHT";
  if (s.includes("2") || s.includes("two") || s.includes("express")) return "TWO_HOUR";
  if (s.includes("same")) return "SAME_DAY";
  return "NATIONWIDE";
}

/* ---- who a parcel can be handed to: in-house rider OR a 3PL courier ---- */
export type Provider = "IN_HOUSE" | "STEADFAST" | "PATHAO" | "REDX";
export interface Assignee {
  id: string;
  name: string;
  kind: "RIDER" | "COURIER";
  provider: Provider;
  zone: "DHAKA" | "NATIONWIDE";
  phone?: string;
  activeLoad: number; // parcels currently in hand — helps pick the free rider
}
export const DEMO_ASSIGNEES: Assignee[] = [
  { id: "r1", name: "Rakib Hasan", kind: "RIDER", provider: "IN_HOUSE", zone: "DHAKA", phone: "+8801710000001", activeLoad: 2 },
  { id: "r2", name: "Shuvo Ahmed", kind: "RIDER", provider: "IN_HOUSE", zone: "DHAKA", phone: "+8801710000002", activeLoad: 1 },
  { id: "r3", name: "Nayeem Islam", kind: "RIDER", provider: "IN_HOUSE", zone: "DHAKA", phone: "+8801710000003", activeLoad: 0 },
  { id: "c1", name: "Steadfast", kind: "COURIER", provider: "STEADFAST", zone: "NATIONWIDE", activeLoad: 0 },
  { id: "c2", name: "Pathao Courier", kind: "COURIER", provider: "PATHAO", zone: "NATIONWIDE", activeLoad: 0 },
  { id: "c3", name: "RedX", kind: "COURIER", provider: "REDX", zone: "NATIONWIDE", activeLoad: 0 },
];
export function assigneeById(id?: string | null): Assignee | null {
  if (!id) return null;
  return DEMO_ASSIGNEES.find((a) => a.id === id) ?? null;
}

/* ---- a board order: only the fields the fulfilment screen needs ---- */
export interface BoardOrder {
  id: string;
  orderNo: string;
  customerName: string;
  recipientName?: string;
  isGift: boolean;
  phone: string;
  zone: "DHAKA" | "NATIONWIDE";
  area: string; // e.g. "Gulshan" — display only until Step 3 zones
  address: string;
  type: DeliveryType;
  slotLabel: string;
  dateLabel: string; // "Today", "Tonight 12-2am", "Tomorrow"
  etaLabel: string; // "in 1h 40m" — display only
  totalPaisa: number;
  itemCount: number;
  hasCrafted: boolean;
  deliveryStatus: DeliveryStatus; // Delivery-owned
  assigneeId?: string | null;
  failReason?: string | null;
}

export const FAIL_REASONS = [
  "Recipient unavailable",
  "Wrong / incomplete address",
  "Phone off / unreachable",
  "Recipient refused",
  "Rescheduled by customer",
];

export const DEMO_BOARD: BoardOrder[] = [
  { id: "d1", orderNo: "RAD-24101", customerName: "Ayesha Rahman", recipientName: "Farhan", isGift: true, phone: "+8801712345601", zone: "DHAKA", area: "Gulshan", address: "House 12, Road 5, Gulshan-1", type: "MIDNIGHT", slotLabel: "12am-2am", dateLabel: "Tonight", etaLabel: "starts 12:00am", totalPaisa: 345000, itemCount: 2, hasCrafted: false, deliveryStatus: "unassigned", assigneeId: null },
  { id: "d2", orderNo: "RAD-24102", customerName: "Tanvir Alam", isGift: false, phone: "+8801712345602", zone: "DHAKA", area: "Dhanmondi", address: "Road 27, Dhanmondi", type: "TWO_HOUR", slotLabel: "4pm-6pm", dateLabel: "Today", etaLabel: "due in 1h 40m", totalPaisa: 189000, itemCount: 1, hasCrafted: false, deliveryStatus: "unassigned", assigneeId: null },
  { id: "d3", orderNo: "RAD-24103", customerName: "Nusrat Jahan", recipientName: "Mim", isGift: true, phone: "+8801712345603", zone: "NATIONWIDE", area: "Sylhet", address: "Zindabazar, Sylhet", type: "NATIONWIDE", slotLabel: "1-3 days", dateLabel: "Tomorrow", etaLabel: "courier pickup", totalPaisa: 270000, itemCount: 1, hasCrafted: false, deliveryStatus: "unassigned", assigneeId: null },

  { id: "d4", orderNo: "RAD-24104", customerName: "Sabbir Hossain", isGift: false, phone: "+8801712345604", zone: "DHAKA", area: "Uttara", address: "Sector 7, Uttara", type: "SAME_DAY", slotLabel: "6pm-9pm", dateLabel: "Today", etaLabel: "prep by 4pm", totalPaisa: 420000, itemCount: 3, hasCrafted: true, deliveryStatus: "preparing", assigneeId: "r1" },
  { id: "d5", orderNo: "RAD-24105", customerName: "Maria Khatun", recipientName: "Sadia", isGift: true, phone: "+8801712345605", zone: "DHAKA", area: "Banani", address: "Road 11, Banani", type: "MIDNIGHT", slotLabel: "12am-2am", dateLabel: "Tonight", etaLabel: "prep by 10pm", totalPaisa: 560000, itemCount: 2, hasCrafted: false, deliveryStatus: "preparing", assigneeId: "r2" },
  { id: "d6", orderNo: "RAD-24106", customerName: "Imran Kabir", isGift: false, phone: "+8801712345606", zone: "DHAKA", area: "Mirpur", address: "Mirpur 10", type: "TWO_HOUR", slotLabel: "3pm-5pm", dateLabel: "Today", etaLabel: "due in 55m", totalPaisa: 99000, itemCount: 1, hasCrafted: false, deliveryStatus: "preparing", assigneeId: "r3" },

  { id: "d7", orderNo: "RAD-24107", customerName: "Rafiul Islam", recipientName: "Anika", isGift: true, phone: "+8801712345607", zone: "DHAKA", area: "Bashundhara", address: "Block C, Bashundhara R/A", type: "SAME_DAY", slotLabel: "2pm-5pm", dateLabel: "Today", etaLabel: "on the way", totalPaisa: 310000, itemCount: 2, hasCrafted: false, deliveryStatus: "out_for_delivery", assigneeId: "r1" },
  { id: "d8", orderNo: "RAD-24108", customerName: "Shirin Akter", isGift: false, phone: "+8801712345608", zone: "DHAKA", area: "Mohammadpur", address: "Shyamoli, Mohammadpur", type: "TWO_HOUR", slotLabel: "1pm-3pm", dateLabel: "Today", etaLabel: "arriving ~20m", totalPaisa: 145000, itemCount: 1, hasCrafted: false, deliveryStatus: "out_for_delivery", assigneeId: "r2" },
  { id: "d9", orderNo: "RAD-24109", customerName: "Grameen Corp", isGift: false, phone: "+8801712345609", zone: "NATIONWIDE", area: "Chattogram", address: "Agrabad C/A, Chattogram", type: "NATIONWIDE", slotLabel: "1-3 days", dateLabel: "In transit", etaLabel: "consignment ST-88213", totalPaisa: 1280000, itemCount: 5, hasCrafted: false, deliveryStatus: "out_for_delivery", assigneeId: "c1" },

  { id: "d10", orderNo: "RAD-24110", customerName: "Faria Noor", recipientName: "Tanha", isGift: true, phone: "+8801712345610", zone: "DHAKA", area: "Gulshan", address: "Gulshan-2", type: "SAME_DAY", slotLabel: "11am-1pm", dateLabel: "Today", etaLabel: "delivered 12:40pm", totalPaisa: 230000, itemCount: 1, hasCrafted: false, deliveryStatus: "delivered", assigneeId: "r3" },
  { id: "d11", orderNo: "RAD-24111", customerName: "Jamal Uddin", isGift: false, phone: "+8801712345611", zone: "DHAKA", area: "Jatrabari", address: "Jatrabari mor", type: "TWO_HOUR", slotLabel: "12pm-2pm", dateLabel: "Today", etaLabel: "1st attempt failed", totalPaisa: 120000, itemCount: 1, hasCrafted: false, deliveryStatus: "failed", assigneeId: "r1", failReason: "Phone off / unreachable" },
];

/* ============================================================
   Full-module demo data (Overview · Dispatch · Failed/RTO · Tracking ·
   Proof · Couriers master · Zones & rates · Analytics · Settings).
   Money = paisa. All Delivery-owned. §10.4 demo-fallback.
   ============================================================ */

/* ---- fleet: in-house riders + 3PL couriers (Courier master) ---- */
export type FleetKind = "RIDER" | "COURIER";
export interface FleetMember {
  id: string;
  name: string;
  kind: FleetKind;
  provider: Provider;
  zones: ("DHAKA" | "NATIONWIDE")[];
  baseCostPaisa: number; // what Radian pays per delivery (courier) / stipend (rider)
  phone?: string;
  apiConfigured: boolean; // 3PL consignment API wired?
  active: boolean;
  deliveries30d: number;
  onTimePct: number;
  // editor-only (demo) extras
  vehicle?: string;
  areas?: string;
  note?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  merchantId?: string;
}
export const DEMO_FLEET: FleetMember[] = [
  { id: "r1", name: "Rakib Hasan", kind: "RIDER", provider: "IN_HOUSE", zones: ["DHAKA"], baseCostPaisa: 6000, phone: "+8801710000001", apiConfigured: false, active: true, deliveries30d: 184, onTimePct: 96 },
  { id: "r2", name: "Shuvo Ahmed", kind: "RIDER", provider: "IN_HOUSE", zones: ["DHAKA"], baseCostPaisa: 6000, phone: "+8801710000002", apiConfigured: false, active: true, deliveries30d: 151, onTimePct: 94 },
  { id: "r3", name: "Nayeem Islam", kind: "RIDER", provider: "IN_HOUSE", zones: ["DHAKA"], baseCostPaisa: 6000, phone: "+8801710000003", apiConfigured: false, active: true, deliveries30d: 132, onTimePct: 92 },
  { id: "c1", name: "Steadfast", kind: "COURIER", provider: "STEADFAST", zones: ["NATIONWIDE"], baseCostPaisa: 8000, apiConfigured: true, active: true, deliveries30d: 420, onTimePct: 88 },
  { id: "c2", name: "Pathao Courier", kind: "COURIER", provider: "PATHAO", zones: ["DHAKA", "NATIONWIDE"], baseCostPaisa: 7000, apiConfigured: false, active: true, deliveries30d: 96, onTimePct: 90 },
  { id: "c3", name: "RedX", kind: "COURIER", provider: "REDX", zones: ["NATIONWIDE"], baseCostPaisa: 7500, apiConfigured: false, active: false, deliveries30d: 0, onTimePct: 0 },
];
export const PROVIDER_LABEL: Record<Provider, string> = {
  IN_HOUSE: "In-house", STEADFAST: "Steadfast", PATHAO: "Pathao", REDX: "RedX",
};

/* ---- zones (table-driven; seed coarse, extensible to Dhaka areas later) ---- */
export interface Zone {
  id: string;
  name: string;
  kind: "CITY" | "REGION" | "AREA";
  parentId?: string | null;
  types: DeliveryType[]; // which delivery types are switched ON here
  active: boolean;
}
export const DEMO_ZONES: Zone[] = [
  { id: "z-dhaka", name: "Dhaka Metro", kind: "CITY", parentId: null, types: ["TWO_HOUR", "SAME_DAY", "MIDNIGHT"], active: true },
  { id: "z-nation", name: "Nationwide", kind: "REGION", parentId: null, types: ["NATIONWIDE"], active: true },
];

/* ---- rate card: charge + cut-off + slot capacity per zone x type (Delivery-owned) ---- */
export interface Rate {
  zoneId: string;
  type: DeliveryType;
  chargePaisa: number;
  cutoff: string;
  slotCapacity: number;
  booked: number; // demo utilisation
  active: boolean;
}
export const DEMO_RATES: Rate[] = [
  { zoneId: "z-dhaka", type: "TWO_HOUR", chargePaisa: 15000, cutoff: "—", slotCapacity: 30, booked: 22, active: true },
  { zoneId: "z-dhaka", type: "SAME_DAY", chargePaisa: 8000, cutoff: "2:00 PM", slotCapacity: 80, booked: 41, active: true },
  { zoneId: "z-dhaka", type: "MIDNIGHT", chargePaisa: 25000, cutoff: "8:00 PM", slotCapacity: 20, booked: 18, active: true },
  { zoneId: "z-nation", type: "NATIONWIDE", chargePaisa: 12000, cutoff: "4:00 PM", slotCapacity: 200, booked: 63, active: true },
];
export interface Blackout { date: string; reason: string; scope: string }
export const DEMO_BLACKOUTS: Blackout[] = [
  { date: "2026-08-15", reason: "National Mourning Day", scope: "Midnight paused" },
  { date: "2026-09-05", reason: "Eid rush overload", scope: "Same-day paused (Dhaka)" },
];

/* ---- consignments (3PL tracking console; manual now, API one-click is P1) ---- */
export interface Consignment {
  orderNo: string;
  provider: Provider;
  trackingId: string;
  status: "booked" | "picked" | "in_transit" | "delivered" | "returned";
  zone: string;
  updatedLabel: string;
}
export const DEMO_CONSIGNMENTS: Consignment[] = [
  { orderNo: "RAD-24109", provider: "STEADFAST", trackingId: "ST-88213", status: "in_transit", zone: "Chattogram", updatedLabel: "2h ago" },
  { orderNo: "RAD-24088", provider: "STEADFAST", trackingId: "ST-88190", status: "delivered", zone: "Khulna", updatedLabel: "yesterday" },
  { orderNo: "RAD-24091", provider: "PATHAO", trackingId: "PS-11902", status: "picked", zone: "Dhaka", updatedLabel: "40m ago" },
  { orderNo: "RAD-24077", provider: "REDX", trackingId: "RX-55021", status: "returned", zone: "Rangpur", updatedLabel: "2 days ago" },
];

/* ---- proof of delivery (PREP + DELIVERY photo, Delivery-owned) ---- */
export interface Proof {
  orderNo: string;
  customerName: string;
  prepBg?: string | null;
  deliveryBg?: string | null;
  capturedBy: string;
  capturedLabel: string;
}
export const DEMO_PROOFS: Proof[] = [
  { orderNo: "RAD-24110", customerName: "Faria Noor", prepBg: "linear-gradient(160deg,var(--a-solid),var(--a-solid))", deliveryBg: "linear-gradient(160deg,var(--f-ok),var(--f-ok))", capturedBy: "Nayeem Islam", capturedLabel: "today 12:40pm" },
  { orderNo: "RAD-24107", customerName: "Rafiul Islam", prepBg: "linear-gradient(160deg,var(--f-warn),var(--f-warn))", deliveryBg: null, capturedBy: "Rakib Hasan", capturedLabel: "prep only" },
  { orderNo: "RAD-24088", customerName: "Sadia Afrin", prepBg: "linear-gradient(160deg,var(--f-info),var(--f-info))", deliveryBg: "linear-gradient(160deg,var(--f-bad),var(--f-bad))", capturedBy: "Steadfast", capturedLabel: "yesterday" },
];

/* ---- failed + RTO queue (own workflow — trust risk) ---- */
export interface FailedDelivery {
  orderNo: string;
  customerName: string;
  phone: string;
  zone: string;
  reason: string;
  attempts: number;
  assignee: string;
  valuePaisa: number;
  state: "failed" | "rto"; // rto = return-to-origin in progress
}
export const DEMO_FAILED: FailedDelivery[] = [
  { orderNo: "RAD-24111", customerName: "Jamal Uddin", phone: "+8801712345611", zone: "Dhaka · Jatrabari", reason: "Phone off / unreachable", attempts: 1, assignee: "Rakib Hasan", valuePaisa: 120000, state: "failed" },
  { orderNo: "RAD-24072", customerName: "Sharmin Akter", phone: "+8801712345672", zone: "Dhaka · Badda", reason: "Recipient unavailable", attempts: 2, assignee: "Shuvo Ahmed", valuePaisa: 245000, state: "failed" },
  { orderNo: "RAD-24077", customerName: "Kamrul Hasan", phone: "+8801712345677", zone: "Rangpur", reason: "Wrong / incomplete address", attempts: 3, assignee: "RedX", valuePaisa: 189000, state: "rto" },
];

/* ---- analytics (own DB; source-tagged, never GA4) ---- */
export interface DeliveryAnalytics {
  onTimePct: number;
  failedPct: number;
  avgMins: number;
  delivered30d: number;
  failed30d: number;
  byCourier: { name: string; kind: FleetKind; delivered: number; onTimePct: number; failedPct: number }[];
  byZone: { name: string; delivered: number; onTimePct: number; avgMins: number }[];
  byType: { type: DeliveryType; delivered: number; onTimePct: number }[];
  daily: { label: string; delivered: number; failed: number }[];
}
export const DEMO_ANALYTICS: DeliveryAnalytics = {
  onTimePct: 93,
  failedPct: 4,
  avgMins: 118,
  delivered30d: 1083,
  failed30d: 47,
  byCourier: [
    { name: "Rakib Hasan", kind: "RIDER", delivered: 184, onTimePct: 96, failedPct: 2 },
    { name: "Shuvo Ahmed", kind: "RIDER", delivered: 151, onTimePct: 94, failedPct: 3 },
    { name: "Nayeem Islam", kind: "RIDER", delivered: 132, onTimePct: 92, failedPct: 4 },
    { name: "Steadfast", kind: "COURIER", delivered: 420, onTimePct: 88, failedPct: 6 },
    { name: "Pathao Courier", kind: "COURIER", delivered: 96, onTimePct: 90, failedPct: 5 },
  ],
  byZone: [
    { name: "Dhaka Metro", delivered: 663, onTimePct: 95, avgMins: 96 },
    { name: "Nationwide", delivered: 420, onTimePct: 88, avgMins: 2160 },
  ],
  byType: [
    { type: "SAME_DAY", delivered: 402, onTimePct: 95 },
    { type: "TWO_HOUR", delivered: 168, onTimePct: 91 },
    { type: "MIDNIGHT", delivered: 93, onTimePct: 97 },
    { type: "NATIONWIDE", delivered: 420, onTimePct: 88 },
  ],
  daily: [
    { label: "M", delivered: 34, failed: 2 }, { label: "T", delivered: 41, failed: 1 },
    { label: "W", delivered: 38, failed: 3 }, { label: "T", delivered: 45, failed: 2 },
    { label: "F", delivered: 52, failed: 4 }, { label: "S", delivered: 61, failed: 2 },
    { label: "S", delivered: 40, failed: 1 },
  ],
};

/* ---- delivery settings (admin-configurable; demo defaults) ---- */
export interface DeliverySettings {
  autoAssign: boolean;
  requirePrepPhoto: boolean;
  requireDeliveryPhoto: boolean;
  midnightCutoff: string;
  maxAttempts: number;
  rtoAfterAttempts: number;
  notifyOnOutForDelivery: boolean;
  notifyOnDelivered: boolean;
}
export const DEMO_SETTINGS: DeliverySettings = {
  autoAssign: false,
  requirePrepPhoto: true,
  requireDeliveryPhoto: true,
  midnightCutoff: "8:00 PM",
  maxAttempts: 3,
  rtoAfterAttempts: 3,
  notifyOnOutForDelivery: true,
  notifyOnDelivered: true,
};

export function zoneName(id: string): string {
  return DEMO_ZONES.find((z) => z.id === id)?.name ?? id;
}

/* ---- time slots per zone (slot design; capacity enforced at checkout later) ---- */
export interface TimeSlot { id: string; zoneId: string; label: string; window: string; capacity: number; booked: number; active: boolean; }
export const DEMO_SLOTS: TimeSlot[] = [
  { id: "s1", zoneId: "z-dhaka", label: "Morning", window: "9am-12pm", capacity: 40, booked: 18, active: true },
  { id: "s2", zoneId: "z-dhaka", label: "Afternoon", window: "12pm-4pm", capacity: 60, booked: 37, active: true },
  { id: "s3", zoneId: "z-dhaka", label: "Evening", window: "4pm-9pm", capacity: 80, booked: 52, active: true },
  { id: "s4", zoneId: "z-dhaka", label: "Midnight", window: "12am-2am", capacity: 20, booked: 18, active: true },
  { id: "s5", zoneId: "z-nation", label: "Standard courier", window: "1-3 days", capacity: 200, booked: 63, active: true },
];

/* ============================================================
   Zone → Type → Slot hierarchy (drill-down setup).
   Zone (main, can hold sub-zones) → Delivery types+charge scoped to that zone
   → Time slots+capacity+cut-off scoped to that type.
   ============================================================ */
export interface ZoneNode { id: string; name: string; parentId: string | null; active: boolean; }
export const DEMO_ZONE_TREE: ZoneNode[] = [
  { id: "z-dhaka", name: "Dhaka City", parentId: null, active: true },
  { id: "z-nation", name: "Nationwide", parentId: null, active: true },
  { id: "z-dhanmondi", name: "Dhanmondi", parentId: "z-dhaka", active: true },
  { id: "z-gulshan", name: "Gulshan", parentId: "z-dhaka", active: true },
  { id: "z-uttara", name: "Uttara", parentId: "z-dhaka", active: true },
  { id: "z-ctg", name: "Chattogram", parentId: "z-nation", active: true },
];
export interface ZoneType { id: string; zoneId: string; name: string; kind: DeliveryType; chargePaisa: number; active: boolean; etaText?: string; }
export const DEMO_ZONE_TYPES: ZoneType[] = [
  { id: "t1", zoneId: "z-dhanmondi", name: "2-hour express", kind: "TWO_HOUR", chargePaisa: 15000, active: true },
  { id: "t2", zoneId: "z-dhanmondi", name: "Same day", kind: "SAME_DAY", chargePaisa: 8000, active: true },
  { id: "t3", zoneId: "z-dhanmondi", name: "Midnight surprise", kind: "MIDNIGHT", chargePaisa: 25000, active: true },
  { id: "t4", zoneId: "z-gulshan", name: "Same day", kind: "SAME_DAY", chargePaisa: 8000, active: true },
  { id: "t5", zoneId: "z-gulshan", name: "Midnight surprise", kind: "MIDNIGHT", chargePaisa: 25000, active: true },
  { id: "t6", zoneId: "z-ctg", name: "Standard courier", kind: "NATIONWIDE", chargePaisa: 12000, active: true, etaText: "2–3 days" },
];
export interface ZoneSlot { id: string; typeId: string; label: string; window: string; capacity: number; booked: number; cutoff: string; active: boolean; }
export const DEMO_ZONE_SLOTS: ZoneSlot[] = [
  { id: "sl1", typeId: "t2", label: "Morning", window: "9am - 12pm", capacity: 40, booked: 18, cutoff: "8:00 AM", active: true },
  { id: "sl2", typeId: "t2", label: "Afternoon", window: "12pm - 4pm", capacity: 60, booked: 41, cutoff: "11:00 AM", active: true },
  { id: "sl3", typeId: "t2", label: "Evening", window: "4pm - 9pm", capacity: 80, booked: 52, cutoff: "3:00 PM", active: true },
  { id: "sl4", typeId: "t3", label: "Midnight", window: "12am - 2am", capacity: 20, booked: 18, cutoff: "8:00 PM", active: true },
];

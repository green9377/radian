import type { Zone } from "./products";

/*
  Mock customer data — simulates what the Customer API (:4000) will return later.

  SWAP HERE — Customer module lock হলে:
    list  -> GET /customers (paginated, searchable)
    one   -> GET /customers/:id
    save  -> PATCH /customers/:id  (soft-delete = deletedAt, block = status)

  Constitution rules applied here:
  - Money stored as integer PAISA (ltvPaisa). Taka only for display.
  - Phone = identity key. WhatsApp OTP login — NO password.
    Phone is INTERNATIONAL — customers order from any country. No BD rule.
  - status "blocked" is NOT delete. Delete = soft-hide (deletedAt), never physical remove.
  - Recipients = customer-OWNED sub-entity (rich address book). They never log in
    or order. Whatever phone the customer gives, that's who we contact — any country.
  - ordersCount / ltvPaisa / deliveriesCount = OWNED BY SALES module. read-only
    reference here — never edited (One Data, One Owner).
*/

export type CustomerStatus = "active" | "blocked";

/** CRM segment tag master — admin-configurable, many-to-many (like Product Tag master) */
export type Segment =
  | "vip"
  | "corporate"
  | "birthday"
  | "anniversary"
  | "wholesale";

export const SEGMENT_LABEL: Record<Segment, string> = {
  vip: "VIP",
  corporate: "Corporate",
  birthday: "Birthday buyer",
  anniversary: "Anniversary buyer",
  wholesale: "Wholesale",
};

/* ---------------- Recipient book (customer-owned) ---------------- */

export type Relationship =
  | "mother"
  | "father"
  | "wife"
  | "husband"
  | "partner"
  | "sibling"
  | "friend"
  | "colleague"
  | "self"
  | "other";

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  mother: "Mother",
  father: "Father",
  wife: "Wife",
  husband: "Husband",
  partner: "Partner",
  sibling: "Sibling",
  friend: "Friend",
  colleague: "Colleague",
  self: "Self",
  other: "Other",
};

export type OccasionType = "birthday" | "anniversary" | "custom";

export interface RecipientOccasion {
  type: OccasionType;
  /** recurring day "MM-DD" (year-less) — for reminders */
  date: string;
  /** DEC-CUS-010 — only when the customer volunteered it ("10th anniversary") */
  year?: number | null;
  label?: string; // for custom
}

export interface Recipient {
  id: string;
  name: string;
  /** any country — we contact THIS number as given (no BD requirement) */
  phone: string;
  relationship: Relationship;
  /** delivery zone inside Bangladesh — drives delivery speed */
  zone: Zone;
  addressLine: string;
  occasions: RecipientOccasion[];
  note?: string;
  isFavorite?: boolean;

  /* read-only refs owned by Sales/Delivery */
  deliveriesCount: number;
  lastDeliveryAt?: number;
}

/* ---------------- Customer ---------------- */

export interface Customer {
  id: string;
  name: string;
  /** +<country><number> — international. WhatsApp OTP login key. */
  phone: string;
  email?: string;
  whatsappVerified: boolean;
  /** customer's own country — may live abroad (NRB) */
  country: string;
  ownAddressLine?: string;
  /** UTC ms — first login/join */
  joinedAt: number;
  status: CustomerStatus;

  /** rich recipient address book */
  recipients: Recipient[];

  /** CRM */
  segments: Segment[];
  note?: string;

  /* ---- OWNED BY SALES (read-only reference here) ---- */
  ordersCount: number;
  ltvPaisa: number;
  lastOrderAt?: number;
  firstOrderAt?: number;

  /** avatar gradient (real avatar upload = /me/avatar later) */
  avatarBg: string;
}

/** name -> initials for the avatar circle */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 0 orders = New, 2+ = Repeat, 1 = one-time (derived, never stored) */
export function tier(c: Customer): "new" | "onetime" | "repeat" {
  if (c.ordersCount <= 0) return "new";
  if (c.ordersCount === 1) return "onetime";
  return "repeat";
}

/** customer abroad? (anything other than Bangladesh) */
export function isAbroad(c: Customer): boolean {
  return c.country.trim().toLowerCase() !== "bangladesh";
}

const DAY = 86_400_000;
const now = Date.parse("2026-07-16T00:00:00Z");

/* demo list — mix of local + NRB (non-resident Bangladeshi) customers */
export const CUSTOMERS: Customer[] = [
  {
    id: "cus-nusrat",
    name: "Nusrat Jahan",
    phone: "+8801712345678",
    email: "nusrat.jahan@example.com",
    whatsappVerified: true,
    country: "Bangladesh",
    ownAddressLine: "Level 6, Concord Tower, Gulshan 1, Dhaka 1212",
    joinedAt: Date.parse("2025-11-02T10:14:00Z"),
    status: "active",
    recipients: [
      {
        id: "rcp-meem",
        name: "Meem",
        phone: "+8801611000292",
        relationship: "friend",
        zone: "dhaka",
        addressLine: "House 8, Road 27, Dhanmondi, Dhaka 1209",
        occasions: [{ type: "birthday", date: "03-14" }],
        isFavorite: true,
        deliveriesCount: 4,
        lastDeliveryAt: now - 18 * DAY,
      },
      {
        id: "rcp-ammu",
        name: "Ammu",
        phone: "+8801911000114",
        relationship: "mother",
        zone: "dhaka",
        addressLine: "House 14, Sector 7, Uttara, Dhaka 1230",
        occasions: [
          { type: "birthday", date: "07-22" },
          { type: "custom", date: "05-12", label: "Mother's Day" },
        ],
        deliveriesCount: 3,
        lastDeliveryAt: now - 65 * DAY,
      },
    ],
    segments: ["vip", "anniversary"],
    note: "Prefers midnight delivery. Repeat anniversary gifter.",
    ordersCount: 7,
    ltvPaisa: 1_894_000,
    lastOrderAt: now - 18 * DAY,
    firstOrderAt: Date.parse("2025-11-14T00:00:00Z"),
    avatarBg: "linear-gradient(150deg,#cf43ea,#b76e79)",
  },
  {
    id: "cus-farhana",
    name: "Farhana Rahman",
    phone: "+14155550142",
    email: "farhana.r@example.com",
    whatsappVerified: true,
    country: "United States",
    ownAddressLine: "540 Market St, San Francisco, CA 94104",
    joinedAt: Date.parse("2025-12-12T00:00:00Z"),
    status: "active",
    recipients: [
      {
        id: "rcp-mom-banani",
        name: "Shirin Rahman",
        phone: "+8801755667701",
        relationship: "mother",
        zone: "dhaka",
        addressLine: "House 42, Road 11, Banani, Dhaka 1213",
        occasions: [{ type: "birthday", date: "09-03" }],
        isFavorite: true,
        deliveriesCount: 6,
        lastDeliveryAt: now - 6 * DAY,
      },
      {
        id: "rcp-sister-ctg",
        name: "Nabila",
        phone: "+8801833220099",
        relationship: "sibling",
        zone: "bangladesh",
        addressLine: "Nasirabad Housing Society, Chattogram 4000",
        occasions: [{ type: "anniversary", date: "01-18" }],
        deliveriesCount: 2,
        lastDeliveryAt: now - 120 * DAY,
      },
    ],
    segments: ["vip", "birthday"],
    note: "NRB in USA — sends home to Dhaka and Chattogram. High AOV.",
    ordersCount: 12,
    ltvPaisa: 3_640_000,
    lastOrderAt: now - 6 * DAY,
    firstOrderAt: Date.parse("2025-12-20T00:00:00Z"),
    avatarBg: "linear-gradient(150deg,#cf43ea,#470066)",
  },
  {
    id: "cus-imran",
    name: "Imran Hossain",
    phone: "+966512345678",
    email: "imran.h@example.com",
    whatsappVerified: true,
    country: "Saudi Arabia",
    ownAddressLine: "Al Olaya, Riyadh 12211",
    joinedAt: Date.parse("2026-02-01T00:00:00Z"),
    status: "active",
    recipients: [
      {
        id: "rcp-wife-mirpur",
        name: "Sadia",
        phone: "+8801722003344",
        relationship: "wife",
        zone: "dhaka",
        addressLine: "Road 5, Mirpur DOHS, Dhaka 1216",
        occasions: [
          { type: "birthday", date: "11-09" },
          { type: "anniversary", date: "12-25" },
        ],
        isFavorite: true,
        deliveriesCount: 3,
        lastDeliveryAt: now - 30 * DAY,
      },
    ],
    segments: ["anniversary"],
    note: "Works in Riyadh — regular gifts to wife in Dhaka.",
    ordersCount: 3,
    ltvPaisa: 720_000,
    lastOrderAt: now - 30 * DAY,
    firstOrderAt: Date.parse("2026-02-14T00:00:00Z"),
    avatarBg: "linear-gradient(150deg,#470066,#cf43ea)",
  },
  {
    id: "cus-rafiul",
    name: "Rafiul Islam",
    phone: "+8801933445566",
    email: "rafiul@example.com",
    whatsappVerified: true,
    country: "Bangladesh",
    ownAddressLine: "Zindabazar, Sylhet 3100",
    joinedAt: Date.parse("2026-01-20T09:00:00Z"),
    status: "active",
    recipients: [
      {
        id: "rcp-office",
        name: "Corporate — HR Dept",
        phone: "+8801933445500",
        relationship: "colleague",
        zone: "bangladesh",
        addressLine: "Zindabazar main road, Sylhet 3100",
        occasions: [],
        deliveriesCount: 2,
        lastDeliveryAt: now - 40 * DAY,
      },
    ],
    segments: ["corporate"],
    note: "Corporate account — bulk Eid gifting.",
    ordersCount: 2,
    ltvPaisa: 430_000,
    lastOrderAt: now - 40 * DAY,
    firstOrderAt: Date.parse("2026-02-10T00:00:00Z"),
    avatarBg: "linear-gradient(150deg,#7a6689,#b98fd0)",
  },
  {
    id: "cus-tania",
    name: "Tania Akter",
    phone: "+8801811223344",
    whatsappVerified: true,
    country: "Bangladesh",
    joinedAt: now - 3 * DAY,
    status: "active",
    recipients: [],
    segments: [],
    note: "",
    ordersCount: 0,
    ltvPaisa: 0,
    avatarBg: "linear-gradient(150deg,#b76e79,#e8c9ce)",
  },
];

export function findCustomer(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}

/** "3 Nov 2025" */
export function shortDate(ms?: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "3 days ago" — relative */
export function ago(ms?: number): string {
  if (!ms) return "-";
  const d = Math.round((Date.now() - ms) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

/** "14 Mar" from "MM-DD" */
export function occasionDate(mmdd: string): string {
  const [m, d] = mmdd.split("-").map(Number);
  if (!m || !d) return mmdd;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d} ${months[m - 1] ?? ""}`.trim();
}

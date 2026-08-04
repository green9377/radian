import type { ApiCustomer, ApiRecipient, ApiRecipientOccasion, ApiSegment } from "./api";

/*
  RICH DEMO DATASET for the Customer module.

  Used automatically when the API (:4000) is unreachable or nearly empty, so every
  Customer screen — overview, occasions, segments, consent, risk, duplicates — is
  fully populated and explorable.

  All ids start with "demo-" so screens can tell demo from live data.
  Occasion dates are generated RELATIVE TO TODAY, so "this week" and "next 30 days"
  always have entries no matter when you open the panel.

  ⇄ SWAP HERE: delete this file once the API is seeded with real customers.
*/

const DAY = 86_400_000;
const NOW = Date.now();

const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const pad = (n: number) => String(n).padStart(2, "0");

/** "MM-DD" for a day N days from today — keeps the occasion board alive */
function inDays(days: number): string {
  const d = new Date(NOW + days * DAY);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** fixed "MM-DD" — used to spread the yearly demand calendar */
const on = (m: number, d: number) => `${pad(m)}-${pad(d)}`;

type OccIn = { type: "BIRTHDAY" | "ANNIVERSARY" | "CUSTOM"; in?: number; on?: [number, number]; label?: string };
type RecIn = {
  name: string;
  phone: string;
  rel: string;
  zone?: "DHAKA" | "BANGLADESH";
  addr: string;
  occ?: OccIn[];
  fav?: boolean;
  deliveries?: number;
  lastDeliveryDays?: number;
};
type CustIn = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  country?: string;
  own?: string;
  blocked?: boolean;
  verified?: boolean;
  orders: number;
  ltv: number; // taka (converted to paisa)
  lastOrderDays?: number;
  firstOrderDays?: number;
  segments?: string[];
  note?: string;
  recipients?: RecIn[];
};

const SEG_NAME: Record<string, string> = {
  vip: "VIP",
  corporate: "Corporate",
  birthday: "Birthday buyer",
  anniversary: "Anniversary buyer",
  wholesale: "Wholesale",
};

let occSeq = 0;
function mkOcc(o: OccIn): ApiRecipientOccasion {
  return {
    id: `demo-occ-${++occSeq}`,
    type: o.type,
    date: o.in !== undefined ? inDays(o.in) : on(o.on![0], o.on![1]),
    label: o.label ?? null,
  };
}

let recSeq = 0;
function mkRec(r: RecIn): ApiRecipient {
  return {
    id: `demo-rec-${++recSeq}`,
    name: r.name,
    phone: r.phone,
    relationship: r.rel,
    zone: r.zone ?? "DHAKA",
    addressLine: r.addr,
    note: null,
    isFavorite: !!r.fav,
    deliveriesCount: r.deliveries ?? 0,
    lastDeliveryAt: r.lastDeliveryDays !== undefined ? iso(r.lastDeliveryDays) : null,
    occasions: (r.occ ?? []).map(mkOcc),
  };
}

function mk(c: CustIn): ApiCustomer {
  const country = c.country ?? "Bangladesh";
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email ?? null,
    whatsappVerified: c.verified !== false,
    country,
    ownAddressLine: c.own ?? null,
    status: c.blocked ? "BLOCKED" : "ACTIVE",
    note: c.note ?? null,
    avatarBg: null,
    ordersCount: c.orders,
    ltvPaisa: c.ltv * 100,
    lastOrderAt: c.lastOrderDays !== undefined ? iso(c.lastOrderDays) : null,
    firstOrderAt: c.firstOrderDays !== undefined ? iso(c.firstOrderDays) : null,
    tier: c.orders <= 0 ? "new" : c.orders === 1 ? "onetime" : "repeat",
    isAbroad: country.toLowerCase() !== "bangladesh",
    segments: (c.segments ?? []).map((s) => ({ id: `demo-seg-${s}`, slug: s, name: SEG_NAME[s] ?? s })),
    recipients: (c.recipients ?? []).map(mkRec),
  };
}

const SRC: CustIn[] = [
  {
    id: "demo-nusrat",
    name: "Nusrat Jahan",
    phone: "+8801712345678",
    email: "nusrat.jahan@example.com",
    own: "Level 6, Concord Tower, Gulshan 1, Dhaka 1212",
    orders: 9,
    ltv: 24_600,
    lastOrderDays: 4,
    firstOrderDays: 250,
    segments: ["vip", "anniversary"],
    note: "Prefers midnight delivery. Never misses her mother's birthday.",
    recipients: [
      { name: "Meem", phone: "+8801611000292", rel: "friend", addr: "House 8, Road 27, Dhanmondi, Dhaka 1209", fav: true, deliveries: 4, lastDeliveryDays: 18, occ: [{ type: "BIRTHDAY", in: 2 }] },
      { name: "Ammu", phone: "+8801911000114", rel: "mother", addr: "House 14, Sector 7, Uttara, Dhaka 1230", deliveries: 3, lastDeliveryDays: 65, occ: [{ type: "BIRTHDAY", in: 19 }, { type: "CUSTOM", on: [5, 12], label: "Mother's Day" }] },
      { name: "Rafi", phone: "+8801755001122", rel: "sibling", addr: "Flat 5B, Green Road, Dhaka 1205", deliveries: 1, lastDeliveryDays: 120, occ: [{ type: "BIRTHDAY", on: [11, 9] }] },
    ],
  },
  {
    id: "demo-farhana",
    name: "Farhana Rahman",
    phone: "+14155550142",
    email: "farhana.r@example.com",
    country: "United States",
    own: "540 Market St, San Francisco, CA 94104",
    orders: 14,
    ltv: 41_800,
    lastOrderDays: 6,
    firstOrderDays: 400,
    segments: ["vip", "birthday"],
    note: "NRB in USA — sends home to Dhaka & Chattogram. Highest AOV.",
    recipients: [
      { name: "Shirin Rahman", phone: "+8801755667701", rel: "mother", addr: "House 42, Road 11, Banani, Dhaka 1213", fav: true, deliveries: 7, lastDeliveryDays: 6, occ: [{ type: "BIRTHDAY", in: 5 }] },
      { name: "Nabila", phone: "+8801833220099", rel: "sibling", zone: "BANGLADESH", addr: "Nasirabad Housing Society, Chattogram 4000", deliveries: 3, lastDeliveryDays: 90, occ: [{ type: "ANNIVERSARY", in: 22 }] },
      { name: "Ashiq bhai", phone: "+8801933002211", rel: "friend", addr: "Bashundhara R/A, Block D, Dhaka 1229", deliveries: 2, lastDeliveryDays: 45, occ: [{ type: "BIRTHDAY", on: [3, 14] }] },
    ],
  },
  {
    id: "demo-imran",
    name: "Imran Hossain",
    phone: "+966512345678",
    email: "imran.h@example.com",
    country: "Saudi Arabia",
    own: "Al Olaya, Riyadh 12211",
    orders: 6,
    ltv: 15_400,
    lastOrderDays: 30,
    firstOrderDays: 300,
    segments: ["anniversary"],
    note: "Works in Riyadh — regular gifts to wife in Dhaka.",
    recipients: [
      { name: "Sadia", phone: "+8801722003344", rel: "wife", addr: "Road 5, Mirpur DOHS, Dhaka 1216", fav: true, deliveries: 5, lastDeliveryDays: 30, occ: [{ type: "BIRTHDAY", in: 12 }, { type: "ANNIVERSARY", on: [12, 25] }] },
      { name: "Abbu", phone: "+8801711556677", rel: "father", zone: "BANGLADESH", addr: "Kazipara, Bogura 5800", deliveries: 1, lastDeliveryDays: 200, occ: [{ type: "BIRTHDAY", on: [8, 2] }] },
    ],
  },
  {
    id: "demo-mehjabin",
    name: "Mehjabin Chowdhury",
    phone: "+8801819998877",
    email: "mehjabin.c@example.com",
    own: "Apt 7A, Road 12, Baridhara, Dhaka 1212",
    orders: 11,
    ltv: 31_200,
    lastOrderDays: 2,
    firstOrderDays: 330,
    segments: ["vip", "birthday"],
    note: "Corporate HR — also orders personally.",
    recipients: [
      { name: "Tasnim", phone: "+8801611223344", rel: "friend", addr: "House 3, Road 6, Niketan, Dhaka 1212", fav: true, deliveries: 4, lastDeliveryDays: 2, occ: [{ type: "BIRTHDAY", in: 1 }] },
      { name: "Shohag", phone: "+8801977001100", rel: "husband", addr: "Apt 7A, Road 12, Baridhara, Dhaka 1212", deliveries: 3, lastDeliveryDays: 60, occ: [{ type: "ANNIVERSARY", in: 26 }] },
    ],
  },
  {
    id: "demo-rafiul",
    name: "Rafiul Islam",
    phone: "+8801933445566",
    email: "rafiul@example.com",
    own: "Zindabazar, Sylhet 3100",
    orders: 4,
    ltv: 86_000,
    lastOrderDays: 40,
    firstOrderDays: 160,
    segments: ["corporate", "wholesale"],
    note: "Corporate account — bulk Eid gifting for 60 staff.",
    recipients: [
      { name: "Corporate — HR Dept", phone: "+8801933445500", rel: "colleague", zone: "BANGLADESH", addr: "Zindabazar main road, Sylhet 3100", deliveries: 3, lastDeliveryDays: 40, occ: [{ type: "CUSTOM", on: [4, 10], label: "Eid gifting" }] },
    ],
  },
  {
    id: "demo-arif",
    name: "Arif Mahmud",
    phone: "+971501234567",
    email: "arif.m@example.com",
    country: "United Arab Emirates",
    own: "Al Barsha 1, Dubai",
    orders: 5,
    ltv: 13_900,
    lastOrderDays: 15,
    firstOrderDays: 280,
    segments: ["anniversary"],
    recipients: [
      { name: "Rumana", phone: "+8801611445566", rel: "wife", addr: "House 22, Road 4, Uttara Sector 4, Dhaka 1230", fav: true, deliveries: 4, lastDeliveryDays: 15, occ: [{ type: "ANNIVERSARY", in: 6 }, { type: "BIRTHDAY", on: [2, 18] }] },
    ],
  },
  {
    id: "demo-tanvir",
    name: "Tanvir Ahmed",
    phone: "+8801777112233",
    email: "tanvir.a@example.com",
    own: "Mohammadpur, Dhaka 1207",
    orders: 3,
    ltv: 7_400,
    lastOrderDays: 9,
    firstOrderDays: 140,
    segments: ["birthday"],
    recipients: [
      { name: "Ishrat", phone: "+8801888223344", rel: "partner", addr: "Lalmatia Block C, Dhaka 1207", fav: true, deliveries: 3, lastDeliveryDays: 9, occ: [{ type: "BIRTHDAY", in: 3 }] },
      { name: "Ma", phone: "+8801711998800", rel: "mother", zone: "BANGLADESH", addr: "Station Road, Jashore 7400", deliveries: 1, lastDeliveryDays: 100, occ: [{ type: "BIRTHDAY", on: [9, 21] }] },
    ],
  },
  {
    id: "demo-sumaiya",
    name: "Sumaiya Binte Noor",
    phone: "+8801611778899",
    email: "sumaiya.n@example.com",
    own: "Shantinagar, Dhaka 1217",
    orders: 7,
    ltv: 18_300,
    lastOrderDays: 21,
    firstOrderDays: 220,
    segments: ["vip"],
    recipients: [
      { name: "Nanu", phone: "+8801911223311", rel: "other", addr: "Malibagh Chowdhury Para, Dhaka 1219", deliveries: 4, lastDeliveryDays: 21, occ: [{ type: "BIRTHDAY", in: 27 }] },
      { name: "Sami", phone: "+8801611009988", rel: "sibling", addr: "Khilgaon, Dhaka 1219", deliveries: 2, lastDeliveryDays: 70, occ: [{ type: "BIRTHDAY", on: [6, 5] }] },
    ],
  },
  {
    id: "demo-zubair",
    name: "Zubair Alam",
    phone: "+60123456789",
    email: "zubair.alam@example.com",
    country: "Malaysia",
    own: "Bukit Bintang, Kuala Lumpur 55100",
    orders: 2,
    ltv: 5_600,
    lastOrderDays: 120,
    firstOrderDays: 260,
    recipients: [
      { name: "Ammu", phone: "+8801755119900", rel: "mother", zone: "BANGLADESH", addr: "College Road, Rangpur 5400", deliveries: 2, lastDeliveryDays: 120, occ: [{ type: "BIRTHDAY", on: [10, 30] }] },
    ],
  },
  {
    id: "demo-priya",
    name: "Priya Das",
    phone: "+8801844556677",
    email: "priya.das@example.com",
    own: "Wari, Dhaka 1203",
    orders: 6,
    ltv: 16_700,
    lastOrderDays: 11,
    firstOrderDays: 190,
    segments: ["birthday", "anniversary"],
    recipients: [
      { name: "Anik", phone: "+8801744223311", rel: "partner", addr: "Gopibag, Dhaka 1203", fav: true, deliveries: 5, lastDeliveryDays: 11, occ: [{ type: "ANNIVERSARY", in: 14 }] },
      { name: "Didi", phone: "+8801733445599", rel: "sibling", zone: "BANGLADESH", addr: "Kalibari Road, Barishal 8200", deliveries: 1, lastDeliveryDays: 150, occ: [{ type: "BIRTHDAY", on: [1, 26] }] },
    ],
  },
  {
    id: "demo-mahmudul",
    name: "Mahmudul Hasan",
    phone: "+8801966332211",
    own: "Banasree Block F, Dhaka 1219",
    orders: 1,
    ltv: 2_150,
    lastOrderDays: 210,
    firstOrderDays: 210,
    note: "Bought once during Pohela Boishakh, never returned.",
    recipients: [
      { name: "Jhumur", phone: "+8801955112233", rel: "wife", addr: "Banasree Block F, Dhaka 1219", deliveries: 1, lastDeliveryDays: 210, occ: [{ type: "ANNIVERSARY", on: [4, 14] }] },
    ],
  },
  {
    id: "demo-nafisa",
    name: "Nafisa Tabassum",
    phone: "+8801711224466",
    email: "nafisa.t@example.com",
    own: "Dhanmondi 27, Dhaka 1209",
    orders: 8,
    ltv: 22_400,
    lastOrderDays: 7,
    firstOrderDays: 240,
    segments: ["vip", "birthday"],
    recipients: [
      { name: "Tuli", phone: "+8801611556644", rel: "friend", addr: "Kalabagan, Dhaka 1205", fav: true, deliveries: 5, lastDeliveryDays: 7, occ: [{ type: "BIRTHDAY", in: 9 }] },
      { name: "Baba", phone: "+8801711003322", rel: "father", addr: "Dhanmondi 27, Dhaka 1209", deliveries: 2, lastDeliveryDays: 88, occ: [{ type: "BIRTHDAY", on: [7, 30] }] },
    ],
  },
  {
    id: "demo-kamrul",
    name: "Kamrul Hasan",
    phone: "+8801799887766",
    own: "Agrabad, Chattogram 4100",
    country: "Bangladesh",
    orders: 3,
    ltv: 9_100,
    lastOrderDays: 150,
    firstOrderDays: 320,
    note: "Chattogram customer — nationwide courier only.",
    recipients: [
      { name: "Shanta", phone: "+8801788776655", rel: "wife", zone: "BANGLADESH", addr: "Agrabad Access Road, Chattogram 4100", deliveries: 3, lastDeliveryDays: 150, occ: [{ type: "BIRTHDAY", on: [5, 8] }, { type: "ANNIVERSARY", on: [11, 22] }] },
    ],
  },
  {
    id: "demo-sharmin",
    name: "Sharmin Sultana",
    phone: "+442071234567",
    email: "sharmin.s@example.com",
    country: "United Kingdom",
    own: "12 Brick Lane, London E1 6RF",
    orders: 4,
    ltv: 12_800,
    lastOrderDays: 35,
    firstOrderDays: 290,
    segments: ["vip"],
    recipients: [
      { name: "Ammu", phone: "+8801611667788", rel: "mother", addr: "Mirpur 10, Dhaka 1216", fav: true, deliveries: 4, lastDeliveryDays: 35, occ: [{ type: "BIRTHDAY", in: 17 }] },
    ],
  },
  {
    id: "demo-ashiq",
    name: "Ashiqur Rahman",
    phone: "+8801555443322",
    own: "Badda Link Road, Dhaka 1212",
    orders: 5,
    ltv: 11_600,
    lastOrderDays: 95,
    firstOrderDays: 270,
    note: "Was a regular — gone quiet for 3 months.",
    recipients: [
      { name: "Runa", phone: "+8801544332211", rel: "wife", addr: "Badda Link Road, Dhaka 1212", deliveries: 4, lastDeliveryDays: 95, occ: [{ type: "ANNIVERSARY", on: [2, 3] }] },
    ],
  },
  {
    id: "demo-rakib",
    name: "Rakib Hridoy",
    phone: "+8801866554433",
    orders: 2,
    ltv: 4_300,
    lastOrderDays: 130,
    firstOrderDays: 200,
    verified: false,
    note: "Phone never verified on WhatsApp.",
    recipients: [],
  },
  {
    id: "demo-shakib",
    name: "Shakib Khan",
    phone: "+8801611000292",
    email: "shakib.k@example.com",
    own: "Mirpur DOHS, Dhaka 1216",
    blocked: true,
    orders: 4,
    ltv: 6_800,
    lastOrderDays: 75,
    firstOrderDays: 180,
    segments: ["birthday"],
    note: "Blocked — repeated fake COD orders, refused 3 deliveries.",
    recipients: [
      { name: "Mim", phone: "+8801611000293", rel: "friend", addr: "Pallabi, Mirpur 12, Dhaka 1216", deliveries: 1, lastDeliveryDays: 75, occ: [{ type: "BIRTHDAY", on: [12, 1] }] },
    ],
  },
  {
    id: "demo-anisur",
    name: "Anisur Rahman",
    phone: "+97455112233",
    country: "Qatar",
    own: "Al Sadd, Doha",
    orders: 3,
    ltv: 8_900,
    lastOrderDays: 55,
    firstOrderDays: 240,
    recipients: [
      { name: "Rehana", phone: "+8801733009988", rel: "wife", addr: "Shewrapara, Mirpur, Dhaka 1216", fav: true, deliveries: 3, lastDeliveryDays: 55, occ: [{ type: "BIRTHDAY", on: [3, 27] }, { type: "ANNIVERSARY", in: 29 }] },
    ],
  },
  {
    id: "demo-tania",
    name: "Tania Akter",
    phone: "+8801811223344",
    orders: 0,
    ltv: 0,
    note: "Signed up 3 days ago — no order yet.",
    recipients: [],
  },
  {
    id: "demo-ishrat2",
    name: "Ishrat Jahan",
    phone: "+8801611445599",
    email: "ishrat.j@example.com",
    own: "Nikunja 2, Dhaka 1229",
    orders: 0,
    ltv: 0,
    note: "Browsed and saved a recipient but has not ordered.",
    recipients: [
      { name: "Ammu", phone: "+8801611445500", rel: "mother", addr: "Nikunja 2, Dhaka 1229", occ: [{ type: "BIRTHDAY", in: 24 }] },
    ],
  },

  /* ---- deliberate duplicates so the merge screen has something to show ---- */
  {
    id: "demo-nusrat-dup",
    name: "Nusrat Jahan",
    phone: "+8801712345678",
    email: "nusrat.j.alt@example.com",
    own: "Gulshan 1, Dhaka",
    orders: 2,
    ltv: 4_900,
    lastOrderDays: 60,
    firstOrderDays: 95,
    note: "Created by staff over the phone — same person as the Gulshan profile.",
    recipients: [
      { name: "Meem", phone: "+8801611000292", rel: "friend", addr: "Dhanmondi 27, Dhaka 1209", deliveries: 1, lastDeliveryDays: 60 },
    ],
  },
  {
    id: "demo-arif-dup",
    name: "Arif Mahmud",
    phone: "+8801611334455",
    own: "Uttara Sector 4, Dhaka 1230",
    orders: 1,
    ltv: 2_600,
    lastOrderDays: 170,
    firstOrderDays: 170,
    note: "Walk-in record with a local number — likely the Dubai customer.",
    recipients: [],
  },
];

export const DEMO_CUSTOMERS: ApiCustomer[] = SRC.map(mk);

export const DEMO_SEGMENTS: (ApiSegment & { _count?: { customers: number } })[] = (
  ["vip", "corporate", "birthday", "anniversary", "wholesale"] as const
).map((slug) => ({
  id: `demo-seg-${slug}`,
  slug,
  name: SEG_NAME[slug],
  _count: { customers: DEMO_CUSTOMERS.filter((c) => (c.segments ?? []).some((s) => s.slug === slug)).length },
}));

/** true when a list came from the demo set (ids are prefixed) */
export function isDemoData(rows: { id: string }[]): boolean {
  return rows.length > 0 && rows[0].id.startsWith("demo-");
}

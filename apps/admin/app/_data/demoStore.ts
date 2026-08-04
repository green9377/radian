import type { ApiCustomer, ApiRecipient, ApiSegment } from "./api";
import { DEMO_CUSTOMERS, DEMO_SEGMENTS } from "./customerDemoData";

/*
  Editable demo store.

  The demo dataset alone is read-only, so Save / Add recipient / Block / Merge
  appeared to "do nothing". This store makes demo data behave like a real
  database: every change is applied and kept in the browser (localStorage), so
  edits survive navigation and reload — and "Reset demo" puts it all back.

  ⇄ SWAP HERE: nothing here ships to production; it exists only so the module can
  be experienced before the API stores consent/recipients/segments.
*/

const CUST_KEY = "radian-demo-customers";
const SEG_KEY = "radian-demo-segments";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const hasWindow = () => typeof window !== "undefined";

let custCache: ApiCustomer[] | null = null;
let segCache: ApiSegment[] | null = null;

/* ---------------- customers ---------------- */

function readCustomers(): ApiCustomer[] {
  if (custCache) return custCache;
  if (!hasWindow()) return DEMO_CUSTOMERS;
  try {
    const raw = window.localStorage.getItem(CUST_KEY);
    custCache = raw ? (JSON.parse(raw) as ApiCustomer[]) : clone(DEMO_CUSTOMERS);
  } catch {
    custCache = clone(DEMO_CUSTOMERS);
  }
  return custCache;
}

function writeCustomers(rows: ApiCustomer[]): void {
  custCache = rows;
  if (hasWindow()) {
    try {
      window.localStorage.setItem(CUST_KEY, JSON.stringify(rows));
    } catch {
      /* quota — keep in memory only */
    }
  }
}

const isAbroadOf = (country: string) => (country || "").trim().toLowerCase() !== "bangladesh";
const tierOf = (orders: number): ApiCustomer["tier"] =>
  orders <= 0 ? "new" : orders === 1 ? "onetime" : "repeat";

let seq = 0;
const uid = (p: string) => `demo-${p}-${Date.now().toString(36)}${(++seq).toString(36)}`;

/** DTO recipient (API shape) -> ApiRecipient, preserving counters when we can */
function toRecipient(r: Record<string, unknown>, prev?: ApiRecipient): ApiRecipient {
  const occSrc = Array.isArray(r.occasions) ? (r.occasions as Record<string, unknown>[]) : [];
  return {
    id: prev?.id ?? uid("rec"),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    relationship: String(r.relationship ?? "other"),
    zone: (r.zone === "BANGLADESH" ? "BANGLADESH" : "DHAKA") as ApiRecipient["zone"],
    addressLine: String(r.addressLine ?? ""),
    note: (r.note as string) ?? prev?.note ?? null,
    isFavorite: Boolean(r.isFavorite),
    deliveriesCount: prev?.deliveriesCount ?? 0,
    lastDeliveryAt: prev?.lastDeliveryAt ?? null,
    occasions: occSrc.map((o, i) => ({
      id: prev?.occasions?.[i]?.id ?? uid("occ"),
      type: (String(o.type ?? "BIRTHDAY").toUpperCase() as ApiRecipient["occasions"] extends undefined
        ? never
        : "BIRTHDAY" | "ANNIVERSARY" | "CUSTOM"),
      date: String(o.date ?? ""),
      label: (o.label as string) ?? null,
    })),
  };
}

export function demoList(): ApiCustomer[] {
  return readCustomers();
}

export function demoGet(id: string): ApiCustomer | undefined {
  return readCustomers().find((c) => c.id === id);
}

/** apply an editor DTO (or a partial patch) onto a demo customer */
export function demoUpdate(id: string, body: Record<string, unknown>): ApiCustomer | undefined {
  const rows = readCustomers();
  const i = rows.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  const prev = rows[i];

  const country = (body.country as string) ?? prev.country;
  const next: ApiCustomer = {
    ...prev,
    name: (body.name as string) ?? prev.name,
    phone: (body.phone as string) ?? prev.phone,
    email: body.email !== undefined ? ((body.email as string) || null) : prev.email,
    country,
    isAbroad: isAbroadOf(country),
    ownAddressLine:
      body.ownAddressLine !== undefined ? ((body.ownAddressLine as string) || null) : prev.ownAddressLine,
    note: body.note !== undefined ? ((body.note as string) || null) : prev.note,
    status: (body.status as ApiCustomer["status"]) ?? prev.status,
  };

  if (Array.isArray(body.segmentIds)) {
    const all = demoSegmentList();
    next.segments = (body.segmentIds as string[])
      .map((sid) => all.find((s) => s.id === sid))
      .filter((s): s is ApiSegment => !!s)
      .map(({ id: sid, slug, name }) => ({ id: sid, slug, name }));
  }

  if (Array.isArray(body.recipients)) {
    const prevRecs = prev.recipients ?? [];
    next.recipients = (body.recipients as Record<string, unknown>[]).map((r, idx) =>
      toRecipient(r, prevRecs[idx]),
    );
  }

  rows[i] = next;
  writeCustomers([...rows]);
  return next;
}

export function demoCreate(body: Record<string, unknown>): ApiCustomer {
  const rows = readCustomers();
  const country = (body.country as string) || "Bangladesh";
  const all = demoSegmentList();
  const created: ApiCustomer = {
    id: uid("cus"),
    name: String(body.name ?? "New customer"),
    phone: String(body.phone ?? ""),
    email: (body.email as string) || null,
    whatsappVerified: true,
    country,
    ownAddressLine: (body.ownAddressLine as string) || null,
    status: "ACTIVE",
    note: (body.note as string) || null,
    avatarBg: null,
    ordersCount: 0,
    ltvPaisa: 0,
    lastOrderAt: null,
    firstOrderAt: null,
    tier: "new",
    isAbroad: isAbroadOf(country),
    segments: Array.isArray(body.segmentIds)
      ? (body.segmentIds as string[])
          .map((sid) => all.find((s) => s.id === sid))
          .filter((s): s is ApiSegment => !!s)
          .map(({ id: sid, slug, name }) => ({ id: sid, slug, name }))
      : [],
    recipients: Array.isArray(body.recipients)
      ? (body.recipients as Record<string, unknown>[]).map((r) => toRecipient(r))
      : [],
  };
  writeCustomers([created, ...rows]);
  return created;
}

export function demoRemove(id: string): void {
  writeCustomers(readCustomers().filter((c) => c.id !== id));
}

/** merge duplicates: move recipients + order totals onto the primary, drop the rest */
export function demoMerge(keepId: string, dropIds: string[]): ApiCustomer | undefined {
  const rows = readCustomers();
  const keep = rows.find((c) => c.id === keepId);
  if (!keep) return undefined;
  const drops = rows.filter((c) => dropIds.includes(c.id));

  const seenPhone = new Set((keep.recipients ?? []).map((r) => r.phone.replace(/\D/g, "").slice(-9)));
  const mergedRecipients = [...(keep.recipients ?? [])];
  for (const d of drops) {
    for (const r of d.recipients ?? []) {
      const k = r.phone.replace(/\D/g, "").slice(-9);
      if (k && seenPhone.has(k)) continue; // same recipient already on the primary
      seenPhone.add(k);
      mergedRecipients.push(r);
    }
  }

  const orders = keep.ordersCount + drops.reduce((s, d) => s + d.ordersCount, 0);
  const ltv = keep.ltvPaisa + drops.reduce((s, d) => s + d.ltvPaisa, 0);
  const times = [keep.lastOrderAt, ...drops.map((d) => d.lastOrderAt)].filter(Boolean) as string[];
  const firsts = [keep.firstOrderAt, ...drops.map((d) => d.firstOrderAt)].filter(Boolean) as string[];
  const segSlugs = new Set<string>();
  const segs: ApiSegment[] = [];
  for (const s of [...(keep.segments ?? []), ...drops.flatMap((d) => d.segments ?? [])]) {
    if (!segSlugs.has(s.slug)) {
      segSlugs.add(s.slug);
      segs.push(s);
    }
  }

  const merged: ApiCustomer = {
    ...keep,
    ordersCount: orders,
    ltvPaisa: ltv,
    tier: tierOf(orders),
    lastOrderAt: times.sort().reverse()[0] ?? null,
    firstOrderAt: firsts.sort()[0] ?? null,
    recipients: mergedRecipients,
    segments: segs,
  };

  writeCustomers(rows.filter((c) => !dropIds.includes(c.id)).map((c) => (c.id === keepId ? merged : c)));
  return merged;
}

/* ---------------- segments ---------------- */

function readSegments(): ApiSegment[] {
  if (segCache) return segCache;
  if (!hasWindow()) return DEMO_SEGMENTS.map(({ id, slug, name }) => ({ id, slug, name }));
  try {
    const raw = window.localStorage.getItem(SEG_KEY);
    segCache = raw
      ? (JSON.parse(raw) as ApiSegment[])
      : DEMO_SEGMENTS.map(({ id, slug, name }) => ({ id, slug, name }));
  } catch {
    segCache = DEMO_SEGMENTS.map(({ id, slug, name }) => ({ id, slug, name }));
  }
  return segCache;
}

function writeSegments(rows: ApiSegment[]): void {
  segCache = rows;
  if (hasWindow()) {
    try {
      window.localStorage.setItem(SEG_KEY, JSON.stringify(rows));
    } catch {
      /* ignore */
    }
  }
}

/** segments with live customer counts derived from the store */
export function demoSegmentList(): (ApiSegment & { _count?: { customers: number } })[] {
  const custs = readCustomers();
  return readSegments().map((s) => ({
    ...s,
    _count: { customers: custs.filter((c) => (c.segments ?? []).some((x) => x.slug === s.slug)).length },
  }));
}

export function demoAddSegment(name: string): ApiSegment {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const seg: ApiSegment = { id: uid("seg"), slug, name: name.trim() };
  writeSegments([...readSegments(), seg]);
  return seg;
}

export function demoRenameSegment(id: string, name: string): void {
  writeSegments(readSegments().map((s) => (s.id === id ? { ...s, name } : s)));
}

export function demoRemoveSegment(id: string): void {
  const seg = readSegments().find((s) => s.id === id);
  writeSegments(readSegments().filter((s) => s.id !== id));
  if (seg) {
    // pull the tag off every customer too
    writeCustomers(
      readCustomers().map((c) => ({
        ...c,
        segments: (c.segments ?? []).filter((x) => x.slug !== seg.slug),
      })),
    );
  }
}

/* ---------------- reset ---------------- */

export function demoReset(): void {
  custCache = null;
  segCache = null;
  if (hasWindow()) {
    window.localStorage.removeItem(CUST_KEY);
    window.localStorage.removeItem(SEG_KEY);
    window.localStorage.removeItem("radian-demo-consent");
  }
}

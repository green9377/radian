/*
  DEMO-ONLY customer attributes the API does not store yet
  (consent, risk/blocklist detail, duplicate hints).

  Values are derived deterministically from the customer id, so the same customer
  always shows the same demo values — the screens feel real and are safe to explore.

  ⇄ SWAP HERE — when Consent & Risk are locked in the architecture project these
  become real Customer-owned fields (Customer Management owns them; Marketing and
  Delivery only READ them).
*/

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const DAY = 86_400_000;

/* ---------------- Consent / communication preference ---------------- */

export type ConsentSource = "Signup" | "Checkout" | "WhatsApp opt-in" | "Staff (phone)";

export interface Consent {
  /** transactional WhatsApp (order updates) — practically always on */
  orderUpdates: boolean;
  /** promotional WhatsApp blasts */
  marketingWhatsapp: boolean;
  /** occasion reminders (birthday/anniversary of their recipients) */
  occasionReminders: boolean;
  email: boolean;
  sms: boolean;
  source: ConsentSource;
  updatedAt: number;
}

const SOURCES: ConsentSource[] = ["Signup", "Checkout", "WhatsApp opt-in", "Staff (phone)"];

export function demoConsent(id: string): Consent {
  const h = hash(id);
  return {
    orderUpdates: h % 17 !== 5,
    marketingWhatsapp: h % 4 !== 0,
    occasionReminders: h % 3 !== 0,
    email: h % 5 !== 1,
    sms: h % 3 === 0,
    source: SOURCES[h % SOURCES.length],
    updatedAt: Date.now() - (h % 120) * DAY,
  };
}

/* ---------------- Risk / blocklist ---------------- */

export type RiskLevel = "low" | "medium" | "high";

export interface Risk {
  level: RiskLevel;
  /** delivery attempted, customer refused / unreachable */
  failedDeliveries: number;
  /** COD order placed then denied — the real BD problem */
  fakeCod: number;
  refunds: number;
  blockReason?: string;
}

const BLOCK_REASONS = [
  "Repeated fake COD orders",
  "Abusive to delivery rider",
  "Chargeback / payment dispute",
  "Duplicate spam account",
];

export function demoRisk(id: string, ordersCount: number, blocked: boolean): Risk {
  const h = hash(id + "risk");
  const failed = ordersCount > 0 ? h % 3 : 0;
  const fake = ordersCount > 2 ? (h >> 3) % 3 : 0;
  const refunds = ordersCount > 1 ? (h >> 6) % 2 : 0;
  let level: RiskLevel = "low";
  if (fake >= 2 || failed >= 2) level = "high";
  else if (fake === 1 || failed === 1 || refunds >= 1) level = "medium";
  if (blocked) level = "high";
  return {
    level,
    failedDeliveries: failed,
    fakeCod: fake,
    refunds,
    blockReason: blocked ? BLOCK_REASONS[h % BLOCK_REASONS.length] : undefined,
  };
}

export const RISK_META: Record<RiskLevel, { label: string; chip: string; dot: string; c: string }> = {
  low: { label: "Low", chip: "bg-[var(--s-ok)] text-[var(--t-ok)] border-[var(--l-ok)]", dot: "bg-[var(--s-ok)]", c: "var(--s-ok)" },
  medium: { label: "Watch", chip: "bg-[var(--s-warn)] text-[var(--t-warn)] border-[var(--l-warn)]", dot: "bg-[var(--s-warn)]", c: "var(--s-warn)" },
  high: { label: "High risk", chip: "bg-[var(--s-bad)] text-[var(--t-bad)] border-[var(--l-bad)]", dot: "bg-[var(--s-bad)]", c: "var(--s-bad)" },
};

/* ---------------- Duplicate detection ---------------- */

/** digits only — "+880 1712-345678" and "01712345678" compare equal on the last 9 */
export function phoneKey(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  return d.slice(-9);
}

/** loose name key — lowercase, no spaces/punctuation */
export function nameKey(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface DupGroup<T> {
  reason: "phone" | "name";
  key: string;
  members: T[];
}

/** find customers that look like the same person (same last-9 phone, or same name) */
export function findDuplicates<T extends { id: string; name: string; phone: string }>(
  rows: T[],
): DupGroup<T>[] {
  const out: DupGroup<T>[] = [];
  const byPhone = new Map<string, T[]>();
  const byName = new Map<string, T[]>();

  for (const r of rows) {
    const pk = phoneKey(r.phone);
    if (pk.length >= 7) {
      byPhone.set(pk, [...(byPhone.get(pk) ?? []), r]);
    }
    const nk = nameKey(r.name);
    if (nk.length >= 4) {
      byName.set(nk, [...(byName.get(nk) ?? []), r]);
    }
  }

  const seen = new Set<string>();
  for (const [key, members] of byPhone) {
    if (members.length > 1) {
      out.push({ reason: "phone", key, members });
      for (const m of members) seen.add(m.id);
    }
  }
  for (const [key, members] of byName) {
    if (members.length > 1 && !members.every((m) => seen.has(m.id))) {
      out.push({ reason: "name", key, members });
    }
  }
  return out;
}

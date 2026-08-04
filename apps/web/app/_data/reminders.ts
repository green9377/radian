/*
  ═══════════════════════════════════════════════════════════════════
  OCCASION REMINDERS (mock) — "Dates Radian Remembers"।

  Customer গুরুত্বপূর্ণ তারিখ save করে; আমরা কয়েকদিন আগে WhatsApp
  reminder পাঠাই (মক — আসল পাঠানো নেই)।

  তারিখ month+day হিসেবে রাখি (বছর নয়) — প্রতি বছর ফিরে আসে।

  ⇄ SWAP HERE — CRM/Marketing module lock হলে reminder হবে server-side
  scheduled WhatsApp campaign; এই store শুধু UI থাকবে।
  ═══════════════════════════════════════════════════════════════════
*/

export interface Reminder {
  id: string;
  title: string;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  /** কত দিন আগে reminder */
  daysBefore: number;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const SEED_REMINDERS: Reminder[] = [
  { id: "rem-meem-bd", title: "Meem's birthday", month: 8, day: 12, daysBefore: 5 },
  { id: "rem-anniv", title: "Our anniversary", month: 10, day: 4, daysBefore: 7 },
  { id: "rem-ammu-bd", title: "Ammu's birthday", month: 6, day: 22, daysBefore: 3 },
];

/** month/day-এর পরবর্তী occurrence (আজ বা ভবিষ্যতে) */
export function nextOccurrence(month: number, day: number, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(now.getFullYear(), month - 1, day);
  if (d < today) d = new Date(now.getFullYear() + 1, month - 1, day);
  return d;
}

/** আজ থেকে কত দিন বাকি (date-only) */
export function daysUntil(target: Date, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

/** "Today" / "Tomorrow" / "In N days" */
export function untilLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

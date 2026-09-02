import type { Zone } from "../_store/useZoneStore";
import { normalizeBdPhone } from "../_store/useCheckoutStore";

/*
  ═══════════════════════════════════════════════════════════════════
  AUTH — WhatsApp login. No password: in Bangladesh a code on WhatsApp is
  what people expect, and it is the number we already deliver to.

  The code half is REAL as of 2 Sep 2026 — see §OTP below.

  The profile half below (DEMO_CUSTOMER and the addresses) is still demo
  data, and is the next thing to replace: GET /me once the Customer module
  exposes it. Logging in is now safe; what the account SHOWS afterwards is
  not yet the customer's own.
  ═══════════════════════════════════════════════════════════════════
*/

export interface Address {
  id: string;
  label: string; // Home / Office
  recipient: string;
  phone: string;
  zone: Zone;
  line: string;
  isDefault?: boolean;
}

export interface Customer {
  name: string;
  phone: string; // +8801XXXXXXXXX
  email: string;
  /** UTC ms — কবে join করল */
  joinedAt: number;
  addresses: Address[];
}

/* demo — orders.ts-এর SENDER-এর সাথে মিল */
export const DEMO_CUSTOMER: Customer = {
  name: "Nusrat Jahan",
  phone: "+8801712345678",
  email: "nusrat.jahan@example.com",
  joinedAt: Date.parse("2025-11-02T00:00:00Z"),
  addresses: [
    {
      id: "addr-home",
      label: "Home",
      recipient: "Nusrat Jahan",
      phone: "+8801712345678",
      zone: "dhaka",
      line: "House 42, Road 11, Banani, Dhaka 1213",
      isDefault: true,
    },
    {
      id: "addr-office",
      label: "Office",
      recipient: "Nusrat Jahan",
      phone: "+8801712345678",
      zone: "dhaka",
      line: "Level 6, Concord Tower, Gulshan 1, Dhaka 1212",
    },
  ],
};

/* নিজের personal address (Profile tab) — delivery address নয় */
export interface OwnAddress {
  line: string;
  zone: Zone;
  phone: string;
}

export const DEMO_OWN_ADDRESS: OwnAddress = {
  line: "Level 6, Concord Tower, Gulshan 1, Dhaka 1212",
  zone: "dhaka",
  phone: "+8801712345678",
};

/* delivery/recipient address seed (Addresses tab) — যাদের কাছে gift যায় */
export const SEED_DELIVERY_ADDRESSES: Address[] = [
  {
    id: "addr-meem",
    label: "Meem — Dhanmondi",
    recipient: "Meem",
    phone: "+8801611000292",
    zone: "dhaka",
    line: "House 8, Road 27, Dhanmondi · opposite Star Kabab, Dhaka 1209",
    isDefault: true,
  },
  {
    id: "addr-ammu",
    label: "Ammu — Uttara",
    recipient: "Ammu",
    phone: "+8801911000114",
    zone: "dhaka",
    line: "House 14, Sector 7, Uttara, Dhaka 1230",
  },
];

/* ─────────────────── OTP ───────────────────

   DEC-WA-010. Real, as of 2 Sep 2026.

   ⚠️ What was here until today: a DEMO_OTP of "123456" that let anybody into
   anybody's account — order history, addresses, the lot — on a system taking
   real orders. It was written when nothing behind it existed. Nothing behind
   it is missing any more, so it is gone; if a code cannot be sent, login
   fails rather than falling back to something that always works.

   The server decides the channel (WhatsApp → SMS → email) and never says
   which one failed, so a login screen cannot be used to find out who has
   WhatsApp.
*/

export const OTP_LENGTH = 6;

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** valid BD ফোন? → normalized (+880…) নাকি null */
export function normalizeLoginPhone(raw: string): string | null {
  return normalizeBdPhone(raw);
}

/** Ask for a code. Returns null when sent, or the reason it was not. */
export async function requestLoginOtp(phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/shop/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "LOGIN" }),
    });
    const j = (await res.json()) as { sent?: boolean; error?: string; message?: string };
    if (j.sent) return null;
    return j.error || j.message || "We could not send the code. Try again.";
  } catch {
    return "We could not reach Radian. Check your connection and try again.";
  }
}

/** True only if the server says the code is right. Never decided here. */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/shop/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "LOGIN", code: code.replace(/\s/g, "") }),
    });
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

/** logged-in customer বানাও — entered phone বসিয়ে DEMO profile */
export function customerFromPhone(phone: string): Customer {
  return { ...DEMO_CUSTOMER, phone };
}

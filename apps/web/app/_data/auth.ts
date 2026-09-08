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
  /** UTC ms — when they joined */
  joinedAt: number;
  addresses: Address[];
}

/* demo — matches the SENDER in orders.ts */
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

/* the customer's own address (Profile tab) — not a delivery address */
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

/* delivery / recipient address seed (Addresses tab) — where gifts go */
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

/** a valid BD phone → normalised (+880…), else null */
export function normalizeLoginPhone(raw: string): string | null {
  return normalizeBdPhone(raw);
}

/**
 * Which channel actually carried the last code — "WhatsApp", "SMS", "email".
 *
 * The screen used to say "on WhatsApp" whatever happened, and the owner's
 * first real code arrived by SMS (2 Sep). A screen that names the wrong app
 * sends the customer hunting in the wrong place, so it now says what the
 * server did. A FAILED channel is still never named: that would turn a login
 * box into a way of asking who has WhatsApp.
 */
export let lastOtpChannel: string | null = null;

/** Ask for a code. Returns null when sent, or the reason it was not. */
export async function requestLoginOtp(phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/shop/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "LOGIN" }),
    });
    const j = (await res.json()) as {
      sent?: boolean;
      via?: string | null;
      error?: string;
      message?: string;
      statusCode?: number;
    };
    if (j.sent) {
      lastOtpChannel =
        { WHATSAPP: "WhatsApp", SMS: "SMS", EMAIL: "email" }[j.via ?? ""] ?? null;
      return null;
    }

    /*
      Two shapes come back, and reading them in the wrong order is what put
      "Bad Request" on the screen where "Please wait 57 seconds" belonged
      (found by the owner, 2 Sep):

        refused   { message: "Please wait 57 seconds…", error: "Bad Request",
                    statusCode: 400 }   ← Nest: `error` is the HTTP class name
        undelivered { sent: false, error: "We could not reach that number…" }
                                        ← ours: `error` IS the sentence

      So statusCode is the tell: when it is there, the sentence is in
      `message`. A customer should never be shown either word "Bad Request".
    */
    if (j.statusCode) return j.message || "That did not work. Try again.";
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

/** the signed-in customer: the entered phone (and, from Google, the name and email) over the demo profile */
export function customerFromPhone(phone: string, extra?: { name?: string; email?: string }): Customer {
  return {
    ...DEMO_CUSTOMER,
    phone,
    ...(extra?.name ? { name: extra.name } : {}),
    ...(extra?.email ? { email: extra.email } : {}),
  };
}

/* ─────────────────── GOOGLE ───────────────────
   "Continue with Google" (owner, 8 Sep 2026). Google's own button hands the
   browser an ID token; the server checks it with Google and answers with the
   customer — the record with that email, or just the name and email Google
   vouched for (phone null) for someone new; checkout takes the phone the
   first time they order. The button is drawn only when the server has a
   Client ID (Setup → Integrations → Google Sign-In). */

export type GoogleSignInAnswer = {
  ok: true;
  customer: { name: string; phone: string | null; email: string };
};

export async function googleClientId(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/shop/auth/google`);
    const j = (await res.json()) as { clientId?: string | null };
    return j.clientId ?? null;
  } catch {
    return null;
  }
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as T & { message?: string | string[]; statusCode?: number };
  if (!res.ok) {
    const m = Array.isArray(j.message) ? j.message[0] : j.message;
    throw new Error(m || "That did not work. Please try again.");
  }
  return j;
}

export const googleSignIn = (credential: string) =>
  postAuth<GoogleSignInAnswer>("/shop/auth/google", { credential });


import type { Zone } from "../_store/useZoneStore";
import { normalizeBdPhone } from "../_store/useCheckoutStore";

/*
  ═══════════════════════════════════════════════════════════════════
  AUTH (MOCK) — WhatsApp login।

  Customer BD ফোন দেয় → আমরা "WhatsApp-এ code পাঠালাম" (আসলে পাঠাই না)
  → code মিলে গেলে session। Password নেই — BD-তে WhatsApp/OTP-ই স্বাভাবিক।

  ⚠️ এটা mock। কোনো আসল যাচাই হয় না — যেকোনো valid BD ফোন +
     DEMO_OTP দিলেই ঢোকা যায়। শুধু UI/flow বানানো, যাতে backend এলে
     swap সহজ হয়।

  ⇄ SWAP HERE — Auth/Customer module lock হলে:
     requestOtp() → POST /auth/otp/request (আসল WhatsApp Business API),
     verifyOtp()  → POST /auth/otp/verify → JWT/session cookie,
     DEMO_CUSTOMER → GET /me।
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

/* ─────────────────── MOCK OTP ─────────────────── */

export const OTP_LENGTH = 6;
/** demo-তে সবসময় এই code কাজ করে (আসল কিছু পাঠানো হয় না) */
export const DEMO_OTP = "123456";

/** valid BD ফোন? → normalized (+880…) নাকি null */
export function normalizeLoginPhone(raw: string): string | null {
  return normalizeBdPhone(raw);
}

/** mock verify — যেকোনো ফোনে DEMO_OTP মিললেই pass */
export function verifyOtp(code: string): boolean {
  return code.replace(/\s/g, "") === DEMO_OTP;
}

/** logged-in customer বানাও — entered phone বসিয়ে DEMO profile */
export function customerFromPhone(phone: string): Customer {
  return { ...DEMO_CUSTOMER, phone };
}

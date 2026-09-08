/*
  ═══════════════════════════════════════════════════════════════════════════
  THE ACCOUNT, FROM THE SHOP  —  `/shop/account/*`   (owner, 8 Sep 2026)

  Every screen behind the login used to read hand-written data in this app:
  a customer called "Nusrat Jahan", two Banani addresses, six orders nobody
  placed. The owner's instruction was one line — *"sob jen real hoy, kon mock
  jen na hoy"* — and this file is the door that made it possible.

  ⚠️ THE TOKEN IS THE SESSION. It is issued by the server after the one-time
  code (or Google) is verified, and it goes in `Authorization: Bearer`. It is
  NOT the admin's `x-radian-token`: two different populations, two doors.

  ⚠️ A 401 means the session is over — expired, or logged out somewhere else.
  Every call routes that to one place (`onExpired`), so the app cannot end up
  half-signed-in: the store clears and the login screen takes over.
  ═══════════════════════════════════════════════════════════════════════════
*/

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export interface AccountCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  joinedAt: string;
  imageUrl: string | null;
  birthday: string | null;
  ownAddress: { line: string; zone: string } | null;
  /** only on /me */
  orderCount?: number;
  creditPaisa?: number;
}

export interface AccountOrderLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantLabel: string | null;
  sizeLabel: string | null;
  qty: number;
  linePaisa: number;
}

export interface AccountOrder {
  id: string;
  orderNo: string;
  placedAt: string;
  status: string;
  deliveryStatus: string;
  paymentStatus: string;
  isGift: boolean;
  recipientName: string | null;
  methodLabel: string;
  date: string | null;
  etaLabel: string;
  totalPaisa: number;
  lines: AccountOrderLine[];
}

export interface AccountOrderDetail extends AccountOrder {
  address: string;
  deliveryNotes: string | null;
  recipientPhone: string | null;
  giftMessage: string | null;
  slotLabel: string | null;
  subtotalPaisa: number;
  discountPaisa: number;
  deliveryPaisa: number;
  photos: { kind: string; url: string | null; at: string }[];
}

export interface AccountAddress {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  zone: string;
  line: string;
  note: string | null;
  isDefault: boolean;
}

export interface AccountReminder {
  id: string;
  recipientId: string;
  who: string;
  type: string;
  label: string | null;
  date: string;
  year: number | null;
}

export interface AccountWish {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  pricePaisa: number;
}

export interface AccountCredit {
  balancePaisa: number;
  lines: {
    id: string;
    at: string;
    kind: string;
    amountPaisa: number;
    note: string | null;
    refType: string | null;
    refId: string | null;
  }[];
}

export interface AccountReviews {
  waiting: {
    productId: string;
    slug: string;
    name: string;
    imageUrl: string | null;
    orderNo: string;
    orderId: string;
    deliveredAt: string | null;
    forWhom: string | null;
  }[];
  written: {
    id: string;
    productId: string;
    slug: string;
    name: string;
    imageUrl: string | null;
    rating: number;
    body: string;
    status: string;
    at: string;
  }[];
}

/* ─────────────────── the wire ─────────────────── */

/** what to do when the server says the session is over — set once by the store */
let onExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onExpired = fn;
}

export class AccountError extends Error {}

async function call<T>(
  path: string,
  token: string | null,
  init?: RequestInit & { body?: string },
): Promise<T> {
  const res = await fetch(`${API}/shop/account${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    onExpired?.();
    throw new AccountError("Please sign in again.");
  }

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg =
      (json as { message?: string | string[] })?.message ?? "Something went wrong.";
    throw new AccountError(Array.isArray(msg) ? msg[0] : String(msg));
  }
  return json as T;
}

/* ─────────────────── signing in ─────────────────── */

export function accountLogin(phone: string, code: string) {
  return call<{ ok: true; token: string; customer: AccountCustomer }>("/login", null, {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export function accountLoginGoogle(credential: string) {
  return call<{ ok: true; token: string; customer: AccountCustomer }>("/login/google", null, {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export function accountLogout(token: string) {
  return call<{ ok: true }>("/logout", token, { method: "POST" });
}

/* ─────────────────── the panels ─────────────────── */

export const getMe = (t: string) => call<AccountCustomer>("/me", t);

export const saveMe = (t: string, b: Record<string, string | null>) =>
  call<AccountCustomer>("/me", t, { method: "PATCH", body: JSON.stringify(b) });

export const getOrders = (t: string) => call<AccountOrder[]>("/orders", t);
export const getOrder = (t: string, id: string) =>
  call<AccountOrderDetail>(`/orders/${id}`, t);

export const getAddresses = (t: string) => call<AccountAddress[]>("/addresses", t);
export const addAddress = (t: string, b: Record<string, unknown>) =>
  call<AccountAddress[]>("/addresses", t, { method: "POST", body: JSON.stringify(b) });
export const editAddress = (t: string, id: string, b: Record<string, unknown>) =>
  call<AccountAddress[]>(`/addresses/${id}`, t, { method: "PATCH", body: JSON.stringify(b) });
export const removeAddress = (t: string, id: string) =>
  call<AccountAddress[]>(`/addresses/${id}`, t, { method: "DELETE" });

export const getReminders = (t: string) => call<AccountReminder[]>("/reminders", t);
export const addReminder = (t: string, b: Record<string, unknown>) =>
  call<AccountReminder[]>("/reminders", t, { method: "POST", body: JSON.stringify(b) });
export const removeReminder = (t: string, id: string) =>
  call<AccountReminder[]>(`/reminders/${id}`, t, { method: "DELETE" });

export const getWishlist = (t: string) => call<AccountWish[]>("/wishlist", t);
export const addWish = (t: string, slug: string) =>
  call<AccountWish[]>("/wishlist", t, { method: "POST", body: JSON.stringify({ slug }) });
export const removeWish = (t: string, productId: string) =>
  call<AccountWish[]>(`/wishlist/${productId}`, t, { method: "DELETE" });

export const getCredit = (t: string) => call<AccountCredit>("/credit", t);
export const getReviews = (t: string) => call<AccountReviews>("/reviews", t);

export const deleteAccount = (t: string) => call<{ ok: true }>("", t, { method: "DELETE" });

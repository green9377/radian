import { API_BASE } from "./shop";

/*
  Live chat — Inbox module-এর গ্রাহক-দিক (RADIAN_INBOX_MODULE_ARCHITECTURE.md)।

  পরিচয় = `clientKey`, ব্রাউজারের localStorage-এ (DEC-INB-006-এর guest পথ)।
  Login-করা গ্রাহক থাকলে widget নিজেই তার নাম/ফোন দিয়ে শুরু করে — form আসে না।

  সব call ব্রাউজার থেকে (client component) — SSR নয়, তাই API_BASE-ই ঠিক।
*/

export interface ChatMessage {
  id: string;
  direction: "IN" | "OUT";
  authorType: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM";
  body: string;
  createdAt: string;
}

export interface ChatView {
  conversationId: string;
  clientKey: string;
  status: "OPEN" | "WAITING_CUSTOMER" | "RESOLVED";
  guestName: string | null;
  identified: boolean;
  messages: ChatMessage[];
}

const STORE_KEY = "radian.chat";

export function storedChat(): { conversationId: string; clientKey: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { conversationId?: string; clientKey?: string };
    return v.conversationId && v.clientKey
      ? { conversationId: v.conversationId, clientKey: v.clientKey }
      : null;
  } catch {
    return null;
  }
}

function remember(v: ChatView) {
  try {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ conversationId: v.conversationId, clientKey: v.clientKey }),
    );
  } catch {
    /* private mode ইত্যাদি — chat তবু এই session-এ চলবে */
  }
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `chat ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function startChat(identity?: { name?: string; phone?: string }): Promise<ChatView> {
  const v = await j<ChatView>("/shop/chat/start", {
    method: "POST",
    body: JSON.stringify(identity ?? {}),
  });
  remember(v);
  return v;
}

export async function sendChatMessage(
  conversationId: string,
  clientKey: string,
  body: string,
): Promise<ChatView> {
  return j<ChatView>("/shop/chat/message", {
    method: "POST",
    body: JSON.stringify({ conversationId, clientKey, body }),
  });
}

export async function identifyChat(
  conversationId: string,
  clientKey: string,
  identity: { name?: string; phone?: string },
): Promise<ChatView> {
  return j<ChatView>("/shop/chat/identify", {
    method: "POST",
    body: JSON.stringify({ conversationId, clientKey, ...identity }),
  });
}

export async function pollChat(conversationId: string, clientKey: string): Promise<ChatView> {
  return j<ChatView>(
    `/shop/chat/poll?conversationId=${encodeURIComponent(conversationId)}&clientKey=${encodeURIComponent(clientKey)}`,
  );
}

/** server thread টা মুছে/হারিয়ে গেলে ব্রাউজারের পুরনো চাবিটাও ফেলে দিই */
export function forgetChat() {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* noop */
  }
}

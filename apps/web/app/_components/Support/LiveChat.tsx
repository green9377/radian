"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../_store/useAuthStore";
import {
  type ChatView,
  forgetChat,
  pollChat,
  sendChatMessage,
  startChat,
  storedChat,
} from "../../_data/chat";

/*
  Live chat panel — SupportPanel-এর "Live Chat" খুললে এটা ভাসে।

  DEC-INB-006:
    • login-করা গ্রাহক → কিছু জিজ্ঞেস করা হয় না, session-এর নাম/ফোন দিয়েই শুরু
    • guest → নাম+ফোন form, স্পষ্ট Skip সহ; skip করলেও chat চলে
  Poll প্রতি ৪ সেকেন্ডে, panel খোলা থাকলে — WebSocket ইচ্ছা করেই নয়:
  Render free tier + সরলতা, আর ৪ সেকেন্ডের দেরি support chat-এ চোখে পড়ে না।
*/

const POLL_MS = 4000;

export default function LiveChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const customer = useAuthStore((s) => s.customer);

  const [view, setView] = useState<ChatView | null>(null);
  const [phase, setPhase] = useState<"boot" | "identity" | "chat">("boot");
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  /* ── প্রথম খোলা: পুরনো thread ধরা, নয়তো পরিচয়-ধাপ ─────────────────── */
  useEffect(() => {
    if (!open || phase !== "boot") return;
    let cancelled = false;

    (async () => {
      const stored = storedChat();
      if (stored) {
        try {
          const v = await pollChat(stored.conversationId, stored.clientKey);
          if (!cancelled) {
            setView(v);
            setPhase("chat");
            scrollDown();
          }
          return;
        } catch {
          forgetChat(); // thread হারিয়েছে — নতুন করে শুরু
        }
      }
      /*  DEC-INB-006 — nothing is asked of a signed-in customer. A Google
          sign-in may not have a number yet (8 Sep 2026), and then the chat
          asks for one like any visitor's rather than opening nameless.  */
      if (customer?.phone) {
        try {
          const v = await startChat({ name: customer.name, phone: customer.phone });
          if (!cancelled) {
            setView(v);
            setPhase("chat");
          }
        } catch {
          if (!cancelled) setError("Chat could not start — please try again.");
        }
      } else {
        if (!cancelled) setPhase("identity");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, phase, customer, scrollDown]);

  /* ── poll, panel খোলা থাকলে ─────────────────────────────────────────── */
  useEffect(() => {
    if (!open || !view) return;
    const t = setInterval(async () => {
      try {
        const v = await pollChat(view.conversationId, view.clientKey);
        setView((old) => {
          if (old && v.messages.length > old.messages.length) scrollDown();
          return v;
        });
      } catch {
        /* সাময়িক network — পরের tick-এ আবার */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [open, view, scrollDown]);

  /* ── identity form (guest) ──────────────────────────────────────────── */
  const beginAs = async (identity?: { name?: string; phone?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const v = await startChat(identity);
      setView(v);
      setPhase("chat");
    } catch {
      setError("Chat could not start — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !view || busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await sendChatMessage(view.conversationId, view.clientKey, body);
      setView(v);
      setDraft("");
      scrollDown();
    } catch {
      setError("Message did not send — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-[90] w-[min(94vw,380px)] rounded-3xl bg-white shadow-[0_24px_64px_rgba(71,0,102,.35)] border border-purple/10 overflow-hidden flex flex-col"
      style={{ height: "min(70vh, 560px)" }}
    >
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-[#470066] to-[#7b1fa2] text-white shrink-0">
        <span className="relative inline-flex w-2.5 h-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-green-400" />
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-bold leading-tight">Radian Support</p>
          <p className="text-[11.5px] opacity-80 leading-tight">
            We reply as fast as we arrange flowers
          </p>
        </div>
        <button
          aria-label="Close chat"
          onClick={onClose}
          className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/15 transition"
        >
          <svg className="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* body */}
      {phase !== "chat" ? (
        <div className="flex-1 grid place-items-center p-6">
          {phase === "boot" ? (
            <p className="text-[13px] text-gray-500">Opening chat…</p>
          ) : (
            <div className="w-full">
              <p className="text-[15px] font-bold text-purple mb-1">Before we chat 🌸</p>
              <p className="text-[12.5px] text-gray-500 mb-4">
                Your name and number help us find your orders instantly — or skip and just ask.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full mb-2 rounded-xl border border-purple/20 px-4 py-2.5 text-[13.5px] outline-none focus:border-purple/50"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01X XXX XXXXX"
                inputMode="tel"
                className="w-full mb-3 rounded-xl border border-purple/20 px-4 py-2.5 text-[13.5px] outline-none focus:border-purple/50"
              />
              {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
              <button
                disabled={busy}
                onClick={() => beginAs({ name, phone })}
                className="w-full rounded-xl bg-[#470066] text-white font-semibold text-[13.5px] py-3 hover:opacity-90 transition disabled:opacity-50"
              >
                Start chat
              </button>
              <button
                disabled={busy}
                onClick={() => beginAs()}
                className="w-full mt-2 text-[12.5px] text-gray-400 hover:text-purple transition"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[#FBF7FD]">
            {view && view.messages.length === 0 && (
              <p className="text-center text-[12.5px] text-gray-400 mt-6">
                Say hello — ask about a gift, an order, anything 🌸
              </p>
            )}
            {view?.messages.map((m) => {
              const mine = m.authorType === "CUSTOMER";
              const system = m.authorType === "SYSTEM";
              return (
                <div key={m.id}>
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        system
                          ? "mx-auto text-center text-[11.5px] text-gray-400 bg-white border border-purple/10 rounded-full px-4 py-1.5"
                          : `max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug ${
                              mine
                                ? "bg-[#470066] text-white rounded-br-md"
                                : "bg-white text-gray-800 border border-purple/10 rounded-bl-md"
                            }`
                      }
                    >
                      {m.body}
                    </div>
                  </div>

                  {/* DEC-INB-007 — AI-র সাজানো পণ্যের card; দাম server-এর */}
                  {m.products && m.products.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 pr-1">
                      {m.products.map((p) => (
                        <a
                          key={p.slug}
                          href={`/p/${p.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="shrink-0 w-[150px] bg-white border border-purple/10 rounded-2xl overflow-hidden hover:shadow-md transition"
                        >
                          <div
                            className="h-[100px] w-full"
                            style={{
                              background: p.imageUrl
                                ? `url(${p.imageUrl}) center/cover no-repeat`
                                : "linear-gradient(150deg,#F7E4F1,#EBC7E4)",
                            }}
                          />
                          <div className="p-2.5">
                            <p className="text-[12px] font-semibold text-gray-800 leading-tight line-clamp-2">
                              {p.name}
                            </p>
                            <p className="text-[12.5px] font-bold text-[#470066] mt-1">
                              ৳ {(p.pricePaisa / 100).toLocaleString("en-IN")}
                            </p>
                            <span className="mt-1.5 inline-block text-[11px] font-bold text-white bg-[#470066] rounded-full px-3 py-1">
                              View
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {view?.status === "RESOLVED" && (
              <p className="text-center text-[11.5px] text-gray-400 pt-2">
                This chat was marked resolved — write again any time.
              </p>
            )}
          </div>

          {/* composer */}
          <div className="shrink-0 border-t border-purple/10 bg-white p-3">
            {error && <p className="text-[12px] text-red-500 px-1 pb-1">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Type a message…"
                className="flex-1 resize-none rounded-xl border border-purple/20 px-4 py-2.5 text-[13.5px] outline-none focus:border-purple/50 max-h-28"
              />
              <button
                aria-label="Send"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
                className="w-10 h-10 shrink-0 rounded-full bg-[#470066] text-white grid place-items-center hover:opacity-90 transition disabled:opacity-40"
              >
                <svg className="w-[18px] h-[18px] fill-current" viewBox="0 0 24 24">
                  <path d="M3.4 20.6 21 12 3.4 3.4 3.3 10l12 2-12 2z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

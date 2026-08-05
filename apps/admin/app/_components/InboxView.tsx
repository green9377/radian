"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiInboxDetail,
  type ApiInboxListItem,
  type ApiInboxSetting,
  type ApiAppUser,
  assignInboxConversation,
  getInboxConversation,
  getInboxSettings,
  listAppUsers,
  listInboxConversations,
  replyInboxConversation,
  reopenInboxConversation,
  resolveInboxConversation,
  setInboxAi,
  updateInboxSettings,
} from "../_data/api";

/*
  Inbox — সব channel-এর গ্রাহক-কথোপকথন এক পর্দায় (Phase 1: WEB_CHAT)।
  RADIAN_INBOX_MODULE_ARCHITECTURE.md · DEC-INB-003/004।

  বাঁয়ে thread-তালিকা (unread আগে চোখে পড়ে), ডানে খোলা কথোপকথন।
  Staff reply পাঠালেই server ওই thread-এর AI বন্ধ করে দেয় (INB-RULE-003) —
  UI-তে switch-টা দেখা যায়, Phase 2-তে ওটাই আসল কাজ করবে।

  Poll: তালিকা ১০ সেকেন্ডে, খোলা thread ৫ সেকেন্ডে — দোকানের গ্রাহকের
  widget-ও ৪ সেকেন্ডে টানে, তাই কথোপকথন প্রায়-তাজা থাকে।
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "WAITING_CUSTOMER", label: "Waiting on customer" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function displayName(c: ApiInboxListItem): string {
  return c.customer?.name || c.guestName || "Guest";
}

const CHANNEL_BADGE: Record<string, string> = {
  WEB_CHAT: "💬",
  MESSENGER: "Ⓜ️",
  INSTAGRAM: "📷",
  WHATSAPP: "🟢",
  SMS: "✉️",
};

export default function InboxView() {
  const [items, setItems] = useState<ApiInboxListItem[] | null>(null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiInboxDetail | null>(null);
  const [users, setUsers] = useState<ApiAppUser[] | null>(null);
  const [settings, setSettings] = useState<ApiInboxSetting | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const patchSettings = async (dto: Partial<ApiInboxSetting>) => {
    try {
      setSettings(await updateInboxSettings(dto));
    } catch {
      setError("Settings did not save — try again.");
    }
  };

  const loadList = useCallback(async () => {
    try {
      const rows = await listInboxConversations({
        status: tab,
        search: search || undefined,
      });
      setItems(rows);
    } catch {
      /* সাময়িক — পরের poll-এ */
    }
  }, [tab, search]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await getInboxConversation(id);
      setDetail(d);
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch {
      /* thread হারালে তালিকায় ফিরুন */
    }
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 10_000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!openId) return;
    void loadDetail(openId);
    const t = setInterval(() => void loadDetail(openId), 5_000);
    return () => clearInterval(t);
  }, [openId, loadDetail]);

  useEffect(() => {
    // assignee dropdown — OWNER-only endpoint; না পারলে চুপচাপ লুকাই
    listAppUsers()
      .then(setUsers)
      .catch(() => setUsers(null));
    getInboxSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const send = async () => {
    const body = draft.trim();
    if (!body || !openId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await replyInboxConversation(openId, body);
      setDetail(d);
      setDraft("");
      void loadList();
    } catch {
      setError("Reply did not send — try again.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<ApiInboxDetail>) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await fn();
      setDetail(d);
      void loadList();
    } catch {
      setError("That did not work — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={WRAP}>
      <div className="mb-5">
        <p className="text-[11px] font-bold tracking-[.14em] text-gray-400 uppercase">
          Commerce · Support
        </p>
        <h1 className="text-[26px] font-extrabold text-gray-900">Inbox</h1>
        <p className="text-[13px] text-gray-500 mt-1 max-w-2xl">
          Every customer conversation, one screen. Live chat today — Messenger,
          Instagram, WhatsApp land here when connected. Reply, and the AI
          steps aside for that thread automatically.
        </p>

        {/* AI নিয়ন্ত্রণ — DEC-INB-003/005 + provider seam (মালিকের রায় ৫ আগস্ট) */}
        {settings && (
          <div className="mt-3 flex items-center gap-3 flex-wrap bg-white border border-gray-200 rounded-xl px-4 py-2.5">
            <button
              onClick={() => void patchSettings({ aiGloballyEnabled: !settings.aiGloballyEnabled })}
              className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition ${
                settings.aiGloballyEnabled
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              AI auto-reply: {settings.aiGloballyEnabled ? "ON" : "OFF"}
            </button>
            <label className="text-[12px] text-gray-500 flex items-center gap-1.5">
              Provider
              <select
                value={settings.aiProvider}
                onChange={(e) =>
                  void patchSettings({ aiProvider: e.target.value as "ANTHROPIC" | "OPENAI" })
                }
                className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] outline-none"
              >
                <option value="ANTHROPIC">Claude (Anthropic)</option>
                <option value="OPENAI">OpenAI</option>
              </select>
            </label>
            <span className="text-[11.5px] text-gray-400">
              model: {settings.aiModel} · key server-এর env-এ — এখানে কখনো নয়
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-5 items-start">
        {/* ── বাঁ পাশ: thread list ── */}
        <div className="w-[340px] shrink-0 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-purple-400"
            />
            <div className="flex gap-1 mt-2 flex-wrap">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition ${
                    tab === t.key
                      ? "bg-[#470066] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto divide-y divide-gray-50">
            {items === null && (
              <p className="p-4 text-[13px] text-gray-400">Loading…</p>
            )}
            {items?.length === 0 && (
              <p className="p-4 text-[13px] text-gray-400">
                No conversations yet — the shop&apos;s Live Chat lands here.
              </p>
            )}
            {items?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setOpenId(c.id);
                  setDetail(null);
                }}
                className={`w-full text-left px-4 py-3 hover:bg-purple-50/50 transition ${
                  openId === c.id ? "bg-purple-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">{CHANNEL_BADGE[c.channel] ?? "💬"}</span>
                  <span className="text-[13.5px] font-bold text-gray-900 flex-1 truncate">
                    {displayName(c)}
                  </span>
                  {c.unreadForStaff > 0 && (
                    <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-[#cf43ea] text-white text-[11px] font-bold">
                      {c.unreadForStaff}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400">{ago(c.lastMessageAt)}</span>
                </div>
                <p className="text-[12px] text-gray-500 truncate mt-0.5">
                  {c.lastMessage
                    ? `${c.lastMessage.authorType === "STAFF" ? "You: " : ""}${c.lastMessage.body}`
                    : "—"}
                </p>
                <div className="flex gap-1.5 mt-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      c.status === "OPEN"
                        ? "bg-amber-100 text-amber-700"
                        : c.status === "WAITING_CUSTOMER"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {c.status === "WAITING_CUSTOMER" ? "WAITING" : c.status}
                  </span>
                  {c.customer && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      {c.customer.ordersCount} orders
                    </span>
                  )}
                  {c.assignee && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      → {c.assignee.name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── ডান পাশ: খোলা কথোপকথন ── */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden min-h-[65vh] flex flex-col">
          {!openId ? (
            <div className="flex-1 grid place-items-center">
              <p className="text-[13.5px] text-gray-400">
                Pick a conversation from the left
              </p>
            </div>
          ) : !detail ? (
            <div className="flex-1 grid place-items-center">
              <p className="text-[13.5px] text-gray-400">Loading…</p>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-[15px] font-bold text-gray-900">
                    {detail.customer?.name || detail.guestName || "Guest"}
                  </p>
                  <p className="text-[12px] text-gray-500">
                    {detail.customer?.phone || detail.guestPhone || "No phone shared"}
                    {detail.customer && ` · ${detail.customer.ordersCount} orders`}
                  </p>
                </div>

                {/* AI state — DEC-INB-004-এর switch */}
                <button
                  onClick={() => void act(() => setInboxAi(detail.id, !detail.aiEnabled))}
                  title="Phase 2-তে AI এখান থেকেই চলবে; reply দিলে নিজে বন্ধ হয়"
                  className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-full transition ${
                    detail.aiEnabled
                      ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  AI {detail.aiEnabled ? "on" : "off"}
                </button>

                {users && (
                  <select
                    value={detail.assignee?.id ?? ""}
                    onChange={(e) =>
                      void act(() => assignInboxConversation(detail.id, e.target.value || null))
                    }
                    className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {users
                      .filter((u) => u.isActive)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                )}

                {detail.status === "RESOLVED" ? (
                  <button
                    onClick={() => void act(() => reopenInboxConversation(detail.id))}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => void act(() => resolveInboxConversation(detail.id))}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition"
                  >
                    Resolve
                  </button>
                )}
              </div>

              {/* messages */}
              <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 bg-[#FBF9FD]">
                {detail.messages.map((m) => {
                  const fromCustomer = m.authorType === "CUSTOMER";
                  const system = m.authorType === "SYSTEM";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${fromCustomer ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={
                          system
                            ? "mx-auto text-center text-[11.5px] text-gray-400 bg-white border border-gray-200 rounded-full px-4 py-1.5"
                            : `max-w-[70%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug ${
                                fromCustomer
                                  ? "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
                                  : m.authorType === "AI"
                                    ? "bg-purple-100 text-purple-900 rounded-br-md"
                                    : "bg-[#470066] text-white rounded-br-md"
                              }`
                        }
                      >
                        {!system && !fromCustomer && (
                          <p className="text-[10.5px] opacity-70 font-bold mb-0.5">
                            {m.authorType === "AI" ? "AI" : m.authorUser?.name ?? "Staff"}
                          </p>
                        )}
                        {m.body}
                        <p
                          className={`text-[10px] mt-1 ${
                            fromCustomer || system ? "text-gray-400" : "opacity-60"
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* composer */}
              <div className="border-t border-gray-100 p-3">
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
                    rows={2}
                    placeholder="Reply to the customer… (sending switches AI off for this thread)"
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-400"
                  />
                  <button
                    disabled={busy || !draft.trim()}
                    onClick={() => void send()}
                    className="px-5 h-11 rounded-xl bg-[#470066] text-white font-bold text-[13.5px] hover:opacity-90 transition disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

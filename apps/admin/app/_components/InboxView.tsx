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
  Inbox — every channel's customer conversations on one screen.
  RADIAN_INBOX_MODULE_ARCHITECTURE.md · DEC-INB-003/004.

  Thread list on the left, unread first; the open conversation on the right.
  The moment a staff member replies, the server switches that thread's AI off
  (INB-RULE-003) — the switch is visible in the UI and does the real work.

  Poll: the list every 10 seconds, the open thread every 5. The shop's own chat
  widget pulls every 4, so a conversation stays close to live on both ends.

  A reply can also arrive from outside Radian — typed into Meta's inbox, or the
  Messenger/Instagram app on a phone. Those land here too (meta-poll.service.ts)
  and are labelled "Replied from Meta", because Meta's API returns only the shop
  account as the sender and never the person who typed it. Better an honest
  label than a name we invented.
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

/*
  One colour and one short word per channel. Four channels will land in this
  list, and "who is this and where did they come from" has to be answerable
  without opening the thread — the reply, the tone and the deadline all differ
  by channel.
*/
const CHANNELS = {
  WEB_CHAT:  { label: "Web chat",  short: "Web", bg: "#ede9fe", fg: "#5b21b6", dot: "#7c3aed" },
  WHATSAPP:  { label: "WhatsApp",  short: "WA",  bg: "#dcfce7", fg: "#166534", dot: "#25d366" },
  MESSENGER: { label: "Messenger", short: "FB",  bg: "#dbeafe", fg: "#1e40af", dot: "#0084ff" },
  INSTAGRAM: { label: "Instagram", short: "IG",  bg: "#fce7f3", fg: "#9d174d", dot: "#e1306c" },
  SMS:       { label: "SMS",       short: "SMS", bg: "#f1f5f9", fg: "#334155", dot: "#64748b" },
} as const;

type ChannelKey = keyof typeof CHANNELS;

const channelOf = (k: string) => CHANNELS[k as ChannelKey] ?? CHANNELS.WEB_CHAT;

/*
  Attachments arrive as `[image](https://...)` — the webhook keeps Meta's CDN
  URL so the picture itself can be shown. The URL expires eventually, so a
  broken image quietly falls back to the plain label.
*/
const ATTACHMENT = /^\[(image|video|audio|file|sticker|share)\]\((https?:\/\/\S+)\)$/;

function MessageBody({ body }: { body: string }) {
  const m = body.match(ATTACHMENT);
  if (!m) return <>{body}</>;
  const [, kind, url] = m;
  if (kind === "image" || kind === "sticker") {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt="attachment"
          className="max-w-[240px] max-h-[240px] rounded-xl"
          onError={(e) => { e.currentTarget.outerHTML = `[${kind}]`; }}
        />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="underline font-semibold">
      [{kind}] open attachment
    </a>
  );
}

/** The one-line preview in the thread list should not show a raw CDN URL. */
const previewOf = (body: string) => {
  const m = body.match(ATTACHMENT);
  return m ? `[${m[1]}]` : body;
};

function ChannelTag({ channel }: { channel: string }) {
  const c = channelOf(channel);
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.short}
    </span>
  );
}

export default function InboxView() {
  const [items, setItems] = useState<ApiInboxListItem[] | null>(null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("ALL");
  /*  Channel is a second, independent filter rather than more status tabs:
      "unanswered WhatsApp" is a real question and mixing the two into one row
      of buttons makes it unaskable.  */
  const [channel, setChannel] = useState<"ALL" | ChannelKey>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiInboxDetail | null>(null);
  const [users, setUsers] = useState<ApiAppUser[] | null>(null);
  const [settings, setSettings] = useState<ApiInboxSetting | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /*  Counts come from the list already on screen, not a second request: the
      badge has to agree with what the filter will actually show.  */
  const stats = (items ?? []).reduce<Record<string, { total: number; unread: number; open: number }>>(
    (a, c) => {
      const k = c.channel;
      a[k] ??= { total: 0, unread: 0, open: 0 };
      a[k].total += 1;
      a[k].unread += c.unreadForStaff > 0 ? 1 : 0;
      a[k].open += c.status === "OPEN" ? 1 : 0;
      return a;
    },
    {},
  );
  const totalAll = items?.length ?? 0;
  const unreadAll = (items ?? []).filter((c) => c.unreadForStaff > 0).length;

  const shown = items
    ?.filter((c) => channel === "ALL" || c.channel === channel)
    .filter((c) => !unreadOnly || c.unreadForStaff > 0);

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
      /* Temporary — the next poll will settle it. */
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
      /* Thread is gone — go back to the list. */
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
    // Assignee dropdown — an OWNER-only endpoint; if it refuses, hide it quietly.
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

        {/* AI controls — DEC-INB-003/005, plus the provider seam. */}
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
              model: {settings.aiModel} · the key lives in the server env, never here
            </span>
          </div>
        )}
      </div>

      {/*
        One card per channel. Four channels will land here and the first
        question every morning is "where is the work" — that has to be legible
        before anything is clicked. The cards are the channel filter too: a
        number you can see but not act on is half a feature.
      */}
      <div className="grid gap-3 mb-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <button
          onClick={() => setChannel("ALL")}
          className={`text-left rounded-2xl px-4 py-3 border transition ${
            channel === "ALL"
              ? "border-transparent bg-[#470066] text-white shadow-lg"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className={`text-[11.5px] font-bold ${channel === "ALL" ? "text-white/70" : "text-gray-500"}`}>
            Everything
          </p>
          <p className="text-[24px] font-extrabold leading-tight">{totalAll}</p>
          <p className={`text-[11px] ${channel === "ALL" ? "text-white/70" : "text-gray-400"}`}>
            {unreadAll > 0 ? `${unreadAll} unread` : "all read"}
          </p>
        </button>

        {(Object.keys(CHANNELS) as ChannelKey[]).map((k) => {
          const c = CHANNELS[k];
          const st = stats[k] ?? { total: 0, unread: 0, open: 0 };
          const on = channel === k;
          const idle = st.total === 0;
          return (
            <button
              key={k}
              onClick={() => setChannel(k)}
              className={`text-left rounded-2xl px-4 py-3 border transition ${
                on ? "border-transparent shadow-lg" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
              style={on ? { background: c.fg, color: "#fff" } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: on ? "#fff" : c.dot }}
                />
                <p
                  className="text-[11.5px] font-bold truncate"
                  style={{ color: on ? "rgba(255,255,255,.75)" : idle ? "#cbd5e1" : "#6b7280" }}
                >
                  {c.label}
                </p>
              </div>
              <p
                className="text-[24px] font-extrabold leading-tight"
                style={{ color: on ? "#fff" : idle ? "#cbd5e1" : "#111827" }}
              >
                {st.total}
              </p>
              <p
                className="text-[11px]"
                style={{ color: on ? "rgba(255,255,255,.75)" : idle ? "#e2e8f0" : c.fg }}
              >
                {idle ? "not connected yet" : st.unread > 0 ? `${st.unread} unread` : "all read"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-5 items-start">
        {/* left: the thread list */}
        <div className="w-[340px] shrink-0 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_2px_10px_rgba(70,0,102,0.04)]">
          <div className="p-3 border-b border-gray-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-purple-400"
            />
            <div className="flex gap-1 mt-2 flex-wrap">
              {STATUS_TABS.map((t) => {
                const n =
                  t.key === "ALL"
                    ? (items?.length ?? 0)
                    : (items ?? []).filter((c) => c.status === t.key).length;
                return (
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
                  {n > 0 && <span className="ml-1 opacity-60">{n}</span>}
                </button>
                );
              })}
            </div>

            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`mt-2 w-full px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition ${
                unreadOnly
                  ? "bg-[#cf43ea] text-white"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {unreadOnly ? "Showing unread only" : `Unread only${unreadAll ? ` (${unreadAll})` : ""}`}
            </button>

            {(channel !== "ALL" || tab !== "ALL" || unreadOnly || search) && (
              <button
                onClick={() => {
                  setChannel("ALL");
                  setTab("ALL");
                  setUnreadOnly(false);
                  setSearch("");
                }}
                className="mt-1.5 w-full text-[11px] text-gray-400 hover:text-gray-600"
              >
                Clear filters
              </button>
            )}
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
            {shown?.length === 0 && items && items.length > 0 && (
              <p className="p-4 text-[13px] text-gray-400">
                Nothing matches these filters.
              </p>
            )}
            {shown?.map((c) => (
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
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: channelOf(c.channel).dot }}
                    title={channelOf(c.channel).label}
                  />
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
                    ? `${
                        c.lastMessage.authorType === "STAFF"
                          ? c.lastMessage.authorUser?.name
                            ? "You: "
                            : "Meta: "
                          : ""
                      }${previewOf(c.lastMessage.body)}`
                    : "—"}
                </p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <ChannelTag channel={c.channel} />
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

        {/* right: the open conversation */}
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
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: channelOf(detail.channel).bg,
                        color: channelOf(detail.channel).fg,
                      }}
                    >
                      {channelOf(detail.channel).label}
                    </span>
                    <p className="text-[15px] font-bold text-gray-900">
                      {detail.customer?.name || detail.guestName || "Guest"}
                    </p>
                  </div>
                  <p className="text-[12px] text-gray-500">
                    {detail.customer?.phone || detail.guestPhone || "No phone shared"}
                    {detail.customer && ` · ${detail.customer.ordersCount} orders`}
                  </p>
                </div>

                {/* DEC-INB-008 — replying no longer silences the AI; this is the only hard off. */}
                <button
                  onClick={() => void act(() => setInboxAi(detail.id, !detail.aiEnabled))}
                  title="Off silences the AI completely in this thread. Replying does not switch it off — it only gives you a few minutes to answer first."
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
                            {m.authorType === "AI"
                              ? "AI"
                              : (m.authorUser?.name ??
                                /*
                                  A staff reply sent THROUGH Radian always carries
                                  its author (inbox.ts writes it). One that does
                                  not was typed somewhere else - Meta's own inbox,
                                  or the Messenger/Instagram app on a phone - and
                                  Meta's API does not name the person, only the
                                  shop account (checked 31 Aug: `from` comes back
                                  as radiangiftshop). So the screen says where it
                                  came from rather than inventing a who.
                                */
                                "Replied from Meta")}
                          </p>
                        )}
                        <MessageBody body={m.body} />
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
                    placeholder="Reply to the customer… (AI waits a few minutes for you before answering)"
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

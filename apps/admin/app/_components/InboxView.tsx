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
import { Info } from "./ItemEditor";

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

/*
  SMS is deliberately NOT one of the cards (owner, 31 Aug). The gateways Radian
  uses - BULKSMSBD, MIMSMS, REVE - are one-way masking SMS: they send and cannot
  receive. An inbound SMS would need a two-way short or long code bought from the
  operator, and until that exists an "SMS 0, not connected yet" card only looks
  like something is broken. It stays in CHANNELS so any old row still renders its
  tag.
*/
const CHANNEL_CARDS = (Object.keys(CHANNELS) as ChannelKey[]).filter((k) => k !== "SMS");

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
    /*
      THE SHELL HOLDS STILL. 1 Sep 2026.

      The owner: "sms joto barte thake ataw avabe niche namte thake pura inbox."
      He was right and it was a real bug, not a taste: the panes had a
      `min-h-[65vh]` and nothing above it, so a long thread grew the PAGE. The
      list slid off the top, the composer walked off the bottom, and answering
      a chatty customer meant scrolling the whole screen to find the box.

      A chat screen is an app, not a document. So: the page is exactly one
      viewport tall and never scrolls. Exactly two things scroll, each inside
      itself — the thread list and the messages. Everything else (filters,
      thread header, composer) is pinned where the hand expects it.

      `min-h-0` on every flex child is what makes that true. Without it a flex
      item refuses to shrink below its content and the overflow silently moves
      up to the page — which is precisely how this broke in the first place.
    */
    <div className="h-[100dvh] flex flex-col overflow-hidden px-6 md:px-8 pt-6 pb-6 max-w-[1600px] mx-auto w-full">
      {/* ── title row: the name, and the one switch that changes everything ── */}
      <div className="shrink-0 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[11px] font-extrabold tracking-[.16em] text-[#a78bb5] uppercase">
            Commerce · Support
          </p>
          <h1 className="text-[30px] font-extrabold text-gray-900 leading-tight flex items-center gap-2">
            Inbox
            <Info text="Every customer conversation on one screen — live chat, Messenger, Instagram and WhatsApp. Reply here and the AI steps aside for that thread. A reply typed in Meta's own app appears here too, marked 'Replied from Meta', because Meta names only the shop account and never the person who typed it." />
          </h1>
        </div>

        {/* DEC-INB-003/005 — the AI switch is a switch you can read across the room. */}
        {settings && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => void patchSettings({ aiGloballyEnabled: !settings.aiGloballyEnabled })}
              className={`text-[13px] font-extrabold px-4 h-11 rounded-2xl transition-transform active:scale-[0.98] flex items-center gap-2 ${
                settings.aiGloballyEnabled
                  ? "bg-emerald-500 text-white shadow-[0_6px_18px_rgba(16,185,129,0.35)]"
                  : "bg-white text-gray-400 border-2 border-gray-200"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${settings.aiGloballyEnabled ? "bg-white" : "bg-gray-300"}`} />
              AI auto-reply {settings.aiGloballyEnabled ? "ON" : "OFF"}
            </button>
            <select
              value={settings.aiProvider}
              onChange={(e) =>
                void patchSettings({ aiProvider: e.target.value as "ANTHROPIC" | "OPENAI" })
              }
              className="h-11 rounded-2xl border-2 border-gray-200 bg-white px-3 text-[13px] font-bold text-gray-700 outline-none focus:border-[#cf43ea]"
            >
              <option value="ANTHROPIC">Claude (Anthropic)</option>
              <option value="OPENAI">OpenAI</option>
            </select>
            <Info text={`Model in use: ${settings.aiModel}. The API key lives in the server environment and is never shown on this screen.`} />
          </div>
        )}
      </div>

      {/*
        One card per channel, and each one is the filter too. The first question
        every morning is "where is the work", and a number you can see but not
        act on is half a feature. Channel colours rather than brand colours on
        purpose: which channel a customer came from changes the tone, the
        deadline and the reply, so it has to be recognisable at a glance.
      */}
      <div className="shrink-0 grid gap-3 mt-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => setChannel("ALL")}
          className={`text-left rounded-2xl pl-4 pr-4 py-3 border-2 transition-transform active:scale-[0.99] ${
            channel === "ALL"
              ? "border-transparent bg-[#470066] text-white shadow-[0_8px_22px_rgba(70,0,102,0.28)]"
              : "border-gray-200 bg-white hover:border-[#cf43ea]"
          }`}
        >
          <p className={`text-[12px] font-extrabold ${channel === "ALL" ? "text-white/75" : "text-gray-500"}`}>
            Everything
          </p>
          <p className="text-[28px] font-extrabold leading-none mt-1">{totalAll}</p>
          <p className={`text-[11.5px] font-bold mt-1.5 ${channel === "ALL" ? "text-white/75" : "text-gray-400"}`}>
            {unreadAll > 0 ? `${unreadAll} unread` : "all read"}
          </p>
        </button>

        {CHANNEL_CARDS.map((k) => {
          const c = CHANNELS[k];
          const st = stats[k] ?? { total: 0, unread: 0, open: 0 };
          const on = channel === k;
          const idle = st.total === 0;
          return (
            <button
              key={k}
              onClick={() => setChannel(k)}
              className={`relative text-left rounded-2xl pl-5 pr-4 py-3 border-2 overflow-hidden transition-transform active:scale-[0.99] ${
                on ? "border-transparent shadow-[0_8px_22px_rgba(0,0,0,0.18)]" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
              style={on ? { background: c.fg, color: "#fff" } : undefined}
            >
              {/* the coloured spine — the channel is legible before the number is read */}
              <span
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ background: on ? "rgba(255,255,255,.55)" : idle ? "#e5e7eb" : c.dot }}
              />
              <p
                className="text-[12px] font-extrabold truncate"
                style={{ color: on ? "rgba(255,255,255,.8)" : idle ? "#c3c9d4" : "#6b7280" }}
              >
                {c.label}
              </p>
              <p
                className="text-[28px] font-extrabold leading-none mt-1"
                style={{ color: on ? "#fff" : idle ? "#c3c9d4" : "#111827" }}
              >
                {st.total}
              </p>
              <p
                className="text-[11.5px] font-bold mt-1.5"
                style={{ color: on ? "rgba(255,255,255,.8)" : idle ? "#dbe0e8" : c.fg }}
              >
                {idle ? "nothing yet" : st.unread > 0 ? `${st.unread} unread` : "all read"}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── the two panes. This row owns the rest of the screen and no more. ── */}
      <div className="flex-1 min-h-0 flex gap-5 mt-5">
        {/* left: the thread list */}
        <div className="w-[360px] shrink-0 flex flex-col min-h-0 bg-white rounded-3xl border-2 border-[#f0edf5] overflow-hidden shadow-[0_4px_20px_rgba(70,0,102,0.05)]">
          <div className="shrink-0 p-3.5 border-b-2 border-[#f6f4f9]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full h-11 rounded-2xl border-2 border-gray-200 px-4 text-[13.5px] font-medium outline-none focus:border-[#cf43ea]"
            />
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {STATUS_TABS.map((t) => {
                const n =
                  t.key === "ALL"
                    ? (items?.length ?? 0)
                    : (items ?? []).filter((c) => c.status === t.key).length;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-extrabold transition ${
                      tab === t.key
                        ? "bg-[#470066] text-white shadow-[0_4px_12px_rgba(70,0,102,0.25)]"
                        : "bg-[#f6f4f9] text-gray-500 hover:bg-[#ece7f2]"
                    }`}
                  >
                    {t.label}
                    {n > 0 && <span className="ml-1.5 opacity-65">{n}</span>}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`mt-2.5 w-full h-10 rounded-2xl text-[12.5px] font-extrabold transition ${
                unreadOnly
                  ? "bg-[#cf43ea] text-white shadow-[0_4px_14px_rgba(207,67,234,0.35)]"
                  : "bg-[#f6f4f9] text-gray-500 hover:bg-[#ece7f2]"
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
                className="mt-2 w-full text-[11.5px] font-bold text-gray-400 hover:text-[#cf43ea]"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* the first of the two things that scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y-2 divide-[#faf8fc]">
            {items === null && <p className="p-5 text-[13px] font-bold text-gray-300">Loading…</p>}
            {items?.length === 0 && (
              <p className="p-5 text-[13px] font-bold text-gray-300">
                No conversations yet — the shop&apos;s Live Chat lands here.
              </p>
            )}
            {shown?.length === 0 && items && items.length > 0 && (
              <p className="p-5 text-[13px] font-bold text-gray-300">Nothing matches these filters.</p>
            )}
            {shown?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setOpenId(c.id);
                  setDetail(null);
                }}
                className={`w-full text-left px-4 py-3.5 transition ${
                  openId === c.id ? "bg-[#f7f0fb]" : "hover:bg-[#fbf9fd]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: channelOf(c.channel).dot }}
                    title={channelOf(c.channel).label}
                  />
                  <span className="text-[14px] font-extrabold text-gray-900 flex-1 truncate">
                    {displayName(c)}
                  </span>
                  {c.unreadForStaff > 0 && (
                    <span className="min-w-[22px] h-[22px] px-1.5 grid place-items-center rounded-full bg-[#cf43ea] text-white text-[11px] font-extrabold">
                      {c.unreadForStaff}
                    </span>
                  )}
                  <span className="text-[11px] font-bold text-gray-400">{ago(c.lastMessageAt)}</span>
                </div>
                <p className="text-[12.5px] text-gray-500 truncate mt-1">
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
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  <ChannelTag channel={c.channel} />
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                      c.status === "OPEN"
                        ? "bg-amber-100 text-amber-700"
                        : c.status === "WAITING_CUSTOMER"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {c.status === "WAITING_CUSTOMER" ? "WAITING" : c.status}
                  </span>
                  {c.customer && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      {c.customer.ordersCount} orders
                    </span>
                  )}
                  {c.assignee && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      → {c.assignee.name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* right: the open conversation */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white rounded-3xl border-2 border-[#f0edf5] overflow-hidden shadow-[0_4px_20px_rgba(70,0,102,0.05)]">
          {!openId ? (
            <div className="flex-1 grid place-items-center">
              <p className="text-[14px] font-bold text-gray-300">Pick a conversation from the left</p>
            </div>
          ) : !detail ? (
            <div className="flex-1 grid place-items-center">
              <p className="text-[14px] font-bold text-gray-300">Loading…</p>
            </div>
          ) : (
            <>
              {/* header — pinned */}
              <div className="shrink-0 px-5 py-3.5 border-b-2 border-[#f6f4f9] flex items-center gap-2.5 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                      style={{
                        background: channelOf(detail.channel).bg,
                        color: channelOf(detail.channel).fg,
                      }}
                    >
                      {channelOf(detail.channel).label}
                    </span>
                    <p className="text-[17px] font-extrabold text-gray-900 truncate">
                      {detail.customer?.name || detail.guestName || "Guest"}
                    </p>
                  </div>
                  <p className="text-[12px] font-medium text-gray-400 mt-0.5">
                    {detail.customer?.phone || detail.guestPhone || "No phone shared"}
                    {detail.customer && ` · ${detail.customer.ordersCount} orders`}
                  </p>
                </div>

                {/* DEC-INB-008 — replying no longer silences the AI; this is the only hard off. */}
                <button
                  onClick={() => void act(() => setInboxAi(detail.id, !detail.aiEnabled))}
                  className={`text-[12px] font-extrabold px-3.5 h-10 rounded-2xl transition ${
                    detail.aiEnabled
                      ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  AI {detail.aiEnabled ? "on" : "off"}
                </button>
                <Info text="Off silences the AI completely in this thread. Replying does not switch it off — it only gives you a few minutes to answer first." />

                {users && (
                  <select
                    value={detail.assignee?.id ?? ""}
                    onChange={(e) =>
                      void act(() => assignInboxConversation(detail.id, e.target.value || null))
                    }
                    className="h-10 text-[12.5px] font-bold border-2 border-gray-200 rounded-2xl px-2.5 outline-none focus:border-[#cf43ea]"
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
                    className="text-[12.5px] font-extrabold px-4 h-10 rounded-2xl bg-amber-400 text-white shadow-[0_4px_14px_rgba(251,191,36,0.4)] hover:opacity-90 transition"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => void act(() => resolveInboxConversation(detail.id))}
                    className="text-[12.5px] font-extrabold px-4 h-10 rounded-2xl bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)] hover:opacity-90 transition"
                  >
                    Resolve
                  </button>
                )}
              </div>

              {/* the second of the two things that scroll */}
              <div
                ref={listRef}
                className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-3 bg-[#FBF9FD]"
              >
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
                            ? "mx-auto text-center text-[11.5px] font-bold text-gray-400 bg-white border-2 border-gray-100 rounded-full px-4 py-1.5"
                            : `max-w-[72%] rounded-3xl px-4 py-3 text-[14px] leading-snug ${
                                fromCustomer
                                  ? "bg-white text-gray-800 border-2 border-[#f0edf5] rounded-bl-lg shadow-[0_2px_8px_rgba(70,0,102,0.04)]"
                                  : m.authorType === "AI"
                                    ? "bg-purple-100 text-purple-900 rounded-br-lg"
                                    : "bg-[#470066] text-white rounded-br-lg shadow-[0_4px_14px_rgba(70,0,102,0.25)]"
                              }`
                        }
                      >
                        {!system && !fromCustomer && (
                          <p className="text-[10.5px] opacity-70 font-extrabold mb-1 tracking-wide">
                            {m.authorType === "AI"
                              ? "AI"
                              : (m.authorUser?.name ??
                                /*
                                  A staff reply sent THROUGH Radian always carries
                                  its author (inbox.ts writes it). One that does
                                  not was typed somewhere else — Meta's own inbox,
                                  or the Messenger/Instagram app on a phone — and
                                  Meta's API names only the shop account, never
                                  the person (checked on both channels, 31 Aug).
                                  So the screen says where it came from rather
                                  than inventing a who.
                                */
                                "Replied from Meta")}
                          </p>
                        )}
                        <MessageBody body={m.body} />
                        <p
                          className={`text-[10.5px] font-bold mt-1.5 ${
                            fromCustomer || system ? "text-gray-300" : "opacity-55"
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

              {/* composer — pinned, and it never walks off the bottom again */}
              <div className="shrink-0 border-t-2 border-[#f6f4f9] p-3.5">
                {error && <p className="text-[12px] font-bold text-rose-500 px-1 pb-1.5">{error}</p>}
                <div className="flex items-end gap-2.5">
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
                    placeholder="Reply to the customer…"
                    className="flex-1 resize-none rounded-2xl border-2 border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#cf43ea]"
                  />
                  <button
                    disabled={busy || !draft.trim()}
                    onClick={() => void send()}
                    className="px-7 h-[52px] rounded-2xl bg-[#470066] text-white font-extrabold text-[14px] shadow-[0_6px_18px_rgba(70,0,102,0.3)] hover:opacity-90 transition-transform active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
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

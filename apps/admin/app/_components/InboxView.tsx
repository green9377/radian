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

/*
  The owner's rule (2 Sep): never leave a thread reading "Guest" when we know
  the number. A hundred conversations came in from the phone with numbers and
  no names, and "Guest · Guest · Guest" cannot be worked through — the number
  at least tells one from another, and staff recognise regulars by it.

  "Guest" is now only for a web-chat visitor who has given nothing at all.
*/
function displayName(c: { customer?: { name: string } | null; guestName?: string | null; guestPhone?: string | null }): string {
  return c.customer?.name || c.guestName || c.guestPhone || "Guest";
}

/*
  DEC-INB-009 — the face beside the name.

  Messenger and Instagram hand us a profile picture; WhatsApp never does, and
  that is Meta's restriction on every platform, not a gap here. So initials are
  the normal case, not the error case, and they are drawn to look deliberate:
  the same name always gets the same brand colour, so a thread is recognisable
  by its tile before the text is read.
*/
const AVATAR_TONES = [
  { bg: "#f3e8ff", fg: "#6b21a8" }, // brand purple
  { bg: "#fce7f3", fg: "#9d174d" }, // brand pink
  { bg: "#ede9fe", fg: "#5b21b6" }, // soft lavender
  { bg: "#fdf0e3", fg: "#9a5b21" }, // rose gold
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/*
  DEC-INB-010 — the picture, the voice note and the file, shown as themselves.

  Until now a customer sending a photo of the bouquet they wanted produced the
  word "[image]", and staff had to open WhatsApp on a phone to see it. The file
  is ours (copied out of Meta, whose links expire), so it can simply be drawn.

  A caption that is only the placeholder is dropped — the picture says it.
*/
function MessageMedia({
  m,
}: {
  m: {
    mediaUrl?: string | null;
    mediaKind?: string | null;
    mediaMime?: string | null;
    mediaName?: string | null;
  };
}) {
  if (!m.mediaUrl) return null;
  const url = m.mediaUrl;

  if (m.mediaKind === "image" || m.mediaKind === "sticker") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={m.mediaKind === "sticker" ? "Sticker" : "Photo"}
          className={
            m.mediaKind === "sticker"
              ? "w-28 h-28 object-contain"
              : "rounded-2xl max-h-72 w-auto object-cover"
          }
        />
      </a>
    );
  }

  if (m.mediaKind === "audio") {
    // Voice notes are how customers actually order here, so the player is
    // full width rather than a link that has to be opened.
    return (
      <audio controls preload="none" src={url} className="mb-2 w-56 max-w-full" />
    );
  }

  if (m.mediaKind === "video") {
    return (
      <video controls preload="metadata" src={url} className="mb-2 rounded-2xl max-h-72 w-auto" />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={m.mediaName ?? undefined}
      className="mb-2 flex items-center gap-2 underline font-bold break-all"
    >
      📎 {m.mediaName || "Attachment"}
    </a>
  );
}

function Avatar({
  name,
  url,
  size = 38,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  // Meta's picture URLs are signed and expire, so a dead one is expected —
  // it falls back to initials instead of showing a torn-image icon.
  const showPhoto = Boolean(url) && !broken;
  const tone =
    AVATAR_TONES[
      Math.abs(
        [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7),
      ) % AVATAR_TONES.length
    ];

  return (
    <span
      className="shrink-0 rounded-full overflow-hidden grid place-items-center font-extrabold"
      style={{
        width: size,
        height: size,
        background: showPhoto ? "#f1f5f9" : tone.bg,
        color: tone.fg,
        fontSize: Math.round(size * 0.36),
      }}
      title={name}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url as string}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
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
  ATTACHMENTS. 1 Sep 2026.

  An attachment is stored as `[kind](url)` — the webhook and the poller both
  write that shape, keeping Meta's CDN link so the thing itself can be shown.

  The old matcher only knew image·video·audio·file·sticker·share, so the kinds
  Instagram actually sends most — `ig_post`, `ig_reel`, `unsupported_type` —
  fell through and printed as raw text: a wall of signed URL that was not
  clickable and pushed a horizontal scrollbar across the whole thread (owner,
  1 Sep, with a screenshot).

  So the matcher now takes ANY kind, and the kind only decides how to draw it.
  Asked directly, Meta hands back `image_data.url` for a shared post exactly as
  it does for a photo, which is why treating the picture kinds alike works.

  Everything is clickable, and nothing is allowed to widen the bubble: a URL is
  never printed, only ever wrapped in a link with a human label.
*/
const ATTACHMENT = /^\[([a-z_]+)\]\((https?:\/\/\S+)\)$/;

/** Kinds Meta serves as a picture, whatever they are called. */
const PICTURE = new Set(["image", "sticker", "ig_post", "ig_reel", "story", "share", "unsupported_type"]);

const KIND_LABEL: Record<string, string> = {
  ig_post: "Shared an Instagram post",
  ig_reel: "Shared a reel",
  story: "Shared a story",
  share: "Shared a post",
  unsupported_type: "Attachment",
  file: "File",
  video: "Video",
  audio: "Voice message",
  image: "Photo",
  sticker: "Sticker",
};

/** What is shown when the CDN link has expired, or the kind cannot be drawn. */
function AttachmentCard({ kind, url }: { kind: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-2xl bg-black/10 px-3 py-2.5 hover:bg-black/15 transition max-w-full"
    >
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-black/15 text-[16px] shrink-0">
        {kind === "video" ? "▶" : kind === "audio" ? "♪" : kind === "file" ? "▤" : "◍"}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-extrabold truncate">
          {KIND_LABEL[kind] ?? "Attachment"}
        </span>
        <span className="block text-[11.5px] opacity-70 font-bold">Tap to open</span>
      </span>
    </a>
  );
}

/*
  A picture, until the link expires. Meta signs these CDN URLs and they stop
  working after a while, so a thread from last week would otherwise show a row
  of broken-image icons — and a staff member still needs to know the customer
  sent something.
*/
function Picture({ kind, url }: { kind: string; url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <AttachmentCard kind={kind} url={url} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={KIND_LABEL[kind] ?? "attachment"}
        className="max-w-full w-auto max-h-[300px] rounded-2xl block"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

function MessageBody({ body }: { body: string }) {
  const m = body.match(ATTACHMENT);
  // Plain text still has to wrap — a long unbroken word must not widen the pane.
  if (!m) return <span className="block break-words whitespace-pre-wrap">{body}</span>;
  const [, kind, url] = m;

  if (PICTURE.has(kind)) return <Picture kind={kind} url={url} />;

  if (kind === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} controls className="max-w-full max-h-[300px] rounded-2xl block" />
    );
  }

  if (kind === "audio") {
    return <audio src={url} controls className="max-w-full block" />;
  }

  return <AttachmentCard kind={kind} url={url} />;
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
                <div className="flex items-center gap-2.5">
                  <span className="relative shrink-0">
                    <Avatar name={displayName(c)} url={c.guestAvatarUrl} size={38} />
                    {/* the channel dot rides the tile, so it costs no width */}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white"
                      style={{ background: channelOf(c.channel).dot }}
                      title={channelOf(c.channel).label}
                    />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-extrabold text-gray-900 truncate">
                      {displayName(c)}
                    </span>
                    {c.guestHandle && (
                      <span className="block text-[11.5px] font-semibold text-gray-400 truncate">
                        @{c.guestHandle}
                      </span>
                    )}
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
                    <Avatar
                      name={displayName(detail)}
                      url={detail.guestAvatarUrl}
                      size={30}
                    />
                    <p className="text-[17px] font-extrabold text-gray-900 truncate">
                      {displayName(detail)}
                    </p>
                  </div>
                  <p className="text-[12px] font-medium text-gray-400 mt-0.5">
                    {detail.guestHandle && `@${detail.guestHandle} · `}
                    {detail.customer?.phone || detail.guestPhone || "No phone shared"}
                    {detail.customer && ` · ${detail.customer.ordersCount} orders`}
                  </p>
                </div>

                {/*
                  DEC-INB-011 (the owner, 1 Sep) — there is no per-thread AI
                  switch. One switch at the top of the Inbox, true everywhere.
                */}
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
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-5 space-y-3 bg-[#FBF9FD]"
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
                            : `max-w-[72%] min-w-0 break-words rounded-3xl px-4 py-3 text-[14px] leading-snug ${
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
                        <MessageMedia m={m} />
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

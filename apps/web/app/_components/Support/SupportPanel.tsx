"use client";

import { useState, useEffect } from "react";
import LiveChat from "./LiveChat";

/*
  Floating Support Panel — the SOLE support channel of the site
  (Constitution: the "Need Help" section was permanently removed).
  Global: rendered in layout.tsx, appears on every page.
  FAB bottom-right → opens 4 channels: WhatsApp / Call / Messenger / Live Chat.
  Real links (wa.me number, page IDs) drop in when the business
  profiles are live.
*/

function Ic({ name }: { name: string }) {
  const cls = "w-[19px] h-[19px] stroke-current fill-none stroke-[1.8]";
  if (name === "wa")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 8.8c.5 2.6 2.5 4.9 5.2 5.9l1.3-1.3-2-1-.9.6a6.4 6.4 0 0 1-2.2-2.4l.6-.8-1-2h-1z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "phone")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M6.8 3.5h2.9l1.4 3.9-2 1.5a12.5 12.5 0 0 0 5.9 5.9l1.5-2 3.9 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "msgr")
    return (
      <svg className="w-[19px] h-[19px] fill-current" viewBox="0 0 24 24">
        <path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.2 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3zm1 11-2.3-2.4L6.5 14l4.6-4.9 2.3 2.4 4.1-2.4L13 14z" />
      </svg>
    );
  if (name === "chat")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.4-.2-3.4-.7L4 20.5l1.2-4.1A8.5 8.5 0 1 1 21 11.5z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    );
  // close (x)
  return (
    <svg className="w-[22px] h-[22px] stroke-current fill-none stroke-[2]" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

/*
  Agent avatars — illustrated placeholders, swap with real support-team
  photos (from the photo shoot) later. They rotate every few seconds
  like a live team being online.
*/
function AgentAvatar({ variant }: { variant: "female" | "male" }) {
  return (
    <svg viewBox="0 0 58 58" className="w-full h-full">
      <circle cx="29" cy="29" r="29" fill={variant === "female" ? "#F3E2FA" : "#EFE4F7"} />
      {variant === "female" ? (
        <>
          <path d="M29 12c-8 0-12 6-12 13 0 4 1 7 1 10l2 5h18l2-5c0-3 1-6 1-10 0-7-4-13-12-13z" fill="#3a2547" />
          <circle cx="29" cy="26" r="8.5" fill="#C68863" />
          <path d="M20.5 25c0-6 3.5-9.5 8.5-9.5s8.5 3.5 8.5 9.5c-1-4-3-5.5-8.5-5.5s-7.5 1.5-8.5 5.5z" fill="#3a2547" />
          <path d="M15 47c2-8 7-11 14-11s12 3 14 11l.5 11h-29z" fill="#470066" />
          <path d="M19.5 26.5c-1.8 0-2 3.8 0 4.2M38.5 26.5c1.8 0 2 3.8 0 4.2" stroke="#cf43ea" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M19.5 22v-1.5C19.5 15 23.5 12 29 12s9.5 3 9.5 8.5V22" stroke="#cf43ea" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <rect x="34" y="31" width="6" height="3" rx="1.5" fill="#cf43ea" />
        </>
      ) : (
        <>
          <circle cx="29" cy="26" r="8.5" fill="#A9714B" />
          <path d="M20.5 24c.5-5 3.5-8 8.5-8s8 3 8.5 8c-1.5-3-4-4.5-8.5-4.5s-7 1.5-8.5 4.5z" fill="#2e2018" />
          <path d="M15 47c2-8 7-11 14-11s12 3 14 11l.5 11h-29z" fill="#320049" />
          <path d="M19.5 26.5c-1.8 0-2 3.8 0 4.2M38.5 26.5c1.8 0 2 3.8 0 4.2" stroke="#cf43ea" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M19.5 22v-1c0-5.5 4-8.5 9.5-8.5s9.5 3 9.5 8.5V22" stroke="#cf43ea" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <rect x="34" y="31" width="6" height="3" rx="1.5" fill="#cf43ea" />
        </>
      )}
    </svg>
  );
}

const CHANNELS = [
  { icon: "wa", label: "WhatsApp Us", href: "#", bg: "#25D366" },
  { icon: "phone", label: "Call the Studio", href: "tel:+8801XXXXXXXXX", bg: "#470066" },
  { icon: "msgr", label: "Messenger", href: "#", bg: "#1877F2" },
];

export default function SupportPanel() {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [agent, setAgent] = useState<"female" | "male">("female");

  // Rotate the on-duty agent every 5 seconds
  useEffect(() => {
    const t = setInterval(
      () => setAgent((a) => (a === "female" ? "male" : "female")),
      5000
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed right-6 bottom-6 z-[80] flex flex-col items-end gap-3">
      {/* Menu */}
      <div
        className={`flex flex-col gap-[10px] mb-1 transition-all duration-300 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-[10px] pointer-events-none"
        }`}
      >
        {CHANNELS.map((ch) => (
          <a
            key={ch.label}
            href={ch.href}
            className="flex items-center gap-3 bg-white rounded-full py-[9px] pl-[9px] pr-[18px] shadow-lift text-[13.5px] font-semibold text-purple whitespace-nowrap transition-transform duration-200 hover:scale-[1.04]"
          >
            <span
              className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
              style={{ background: ch.bg }}
            >
              <Ic name={ch.icon} />
            </span>
            {ch.label}
          </a>
        ))}
        {/* Live Chat — আর মরা "#" নয়; Inbox module-এর আসল chat (Phase 1) */}
        <button
          onClick={() => {
            setChatOpen(true);
            setOpen(false);
          }}
          className="flex items-center gap-3 bg-white rounded-full py-[9px] pl-[9px] pr-[18px] shadow-lift text-[13.5px] font-semibold text-purple whitespace-nowrap transition-transform duration-200 hover:scale-[1.04] cursor-pointer"
        >
          <span
            className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
            style={{ background: "#cf43ea" }}
          >
            <Ic name="chat" />
          </span>
          Live Chat
        </button>
      </div>

      {/* FAB — live agent avatar with online dot */}
      <div className="relative">
        <button
          aria-label={open ? "Close support menu" : "Chat with our support team"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`w-[58px] h-[58px] rounded-full overflow-hidden border-[3px] border-white transition-all duration-200 hover:scale-[1.08] cursor-pointer grid place-items-center ${
            open ? "bg-orchid text-white" : "bg-white"
          }`}
          style={{
            boxShadow:
              "0 14px 36px rgba(71,0,102,.45), 0 3px 10px rgba(0,0,0,.22)",
          }}
        >
          {open ? (
            <Ic name="x" />
          ) : (
            <span key={agent} className="block w-full h-full animate-[fadeIn_.5s_ease]">
              <AgentAvatar variant={agent} />
            </span>
          )}
        </button>

        {/* Online dot */}
        {!open && (
          <span className="absolute top-0 right-0 z-10 flex w-[15px] h-[15px]">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-50" />
            <span className="relative inline-flex w-[15px] h-[15px] rounded-full bg-green-500 border-2 border-white" />
          </span>
        )}
      </div>

      <LiveChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

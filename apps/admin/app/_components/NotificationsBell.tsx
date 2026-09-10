"use client";

/*
  NOTIFICATION BELL — every system notice in ONE place.
  Owner, 18 Aug 2026: "asob notification avabe akdom upore dile manay na —
  user akhane akta notification system rakho jekhane agula asbe."

  Warnings used to be banners glued to the top of whichever page happened to
  compute them (the stale-backup banner on the audit page was the last straw).
  Now the working pages stay clean and the notices collect behind this bell.

  What it watches (all recomputed on open — these are STATES, not events, so
  nothing needs storing or marking read):
    · backup never run / stale                → Backups
    · access requests the guard refused       → Access templates
    · invites still waiting to be accepted    → People & access
    · trade licence running out (< 60 days)   → Company
    · company papers missing for Mushak       → Company
    · checkout cannot take money / sandbox on → Integrations
    · new screens no template reaches yet     → Access templates

  OWNER only — every source endpoint is OWNER-gated, and these are owner
  worries. Anyone else sees no bell at all.
*/

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBackups, getCompanyReadiness, getIntegrations, getUndecidedNodes,
  getWouldBlock, listPeople,
} from "../_data/api";
import { useAuth } from "./AuthGate";
import Icon from "./Icon";

interface Notice {
  id: string;
  tone: "rose" | "amber" | "sky";
  icon: string;
  title: string;
  body: string;
  href: string;
}

const TONE = {
  rose: { bg: "#3b1a16", fg: "#e1837a" },
  amber: { bg: "#3c2f17", fg: "#edc278" },
  sky: { bg: "#17273a", fg: "#82a7d9" },
} as const;

export default function NotificationsBell() {
  const { me } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const out: Notice[] = [];
    const soft = async (run: () => Promise<void>) => { try { await run(); } catch { /* endpoint closed or down — skip */ } };

    await Promise.all([
      soft(async () => {
        const b = await getBackups();
        if (b.state === "never")
          out.push({
            id: "backup-never", tone: "rose", icon: "download",
            title: "No backup has ever been recorded",
            body: "The whole business is in one database. Run the backup once, then schedule it nightly.",
            href: "/administration/backup",
          });
        else if (b.state === "stale" || b.state === "bad")
          out.push({
            id: "backup-stale", tone: "amber", icon: "download",
            title: `Last backup was ${b.hoursSince}h ago`,
            body: "The nightly routine looks like it has stopped.",
            href: "/administration/backup",
          });
      }),
      soft(async () => {
        const g = await getWouldBlock();
        if (g.rows.length)
          out.push({
            id: "guard-refused", tone: "amber", icon: "shield",
            title: `${g.rows.length} request${g.rows.length === 1 ? "" : "s"} refused by access templates`,
            body: "Someone tried a part of the system their template does not open.",
            href: "/administration",
          });
      }),
      soft(async () => {
        const ppl = await listPeople();
        const waiting = ppl.filter((p) => p.pending?.kind === "INVITE");
        if (waiting.length)
          out.push({
            id: "invites-open", tone: "sky", icon: "mail",
            title: `${waiting.length} invite${waiting.length === 1 ? "" : "s"} not yet accepted`,
            body: waiting.map((p) => p.name).slice(0, 3).join(", ") + (waiting.length > 3 ? "…" : ""),
            href: "/settings/people",
          });
      }),
      soft(async () => {
        const d = await getIntegrations();
        const pay = d.groups.find((g) => g.kind === "PAYMENT")?.services ?? [];
        const sandboxOn = pay.filter((p) => p.isEnabled && !p.isLive);
        if (!pay.some((p) => p.isEnabled))
          out.push({
            id: "pay-off", tone: "rose", icon: "cash",
            title: "Checkout cannot take money",
            body: "No payment gateway is switched on - the website shows a total and then takes nothing.",
            href: "/administration/integrations",
          });
        else if (sandboxOn.length)
          out.push({
            id: "pay-sandbox", tone: "amber", icon: "cash",
            title: `${sandboxOn.map((p) => p.label).join(", ")} is ON but in sandbox`,
            body: "Payments look successful and no money arrives.",
            href: "/administration/integrations",
          });
      }),
      soft(async () => {
        const u = await getUndecidedNodes();
        if (u.length)
          out.push({
            id: "undecided", tone: "sky", icon: "layers",
            title: `${u.length} new screen${u.length === 1 ? "" : "s"} reach nobody yet`,
            body: "A new screen is handed to no one until you decide.",
            href: "/administration/access",
          });
      }),
      soft(async () => {
        const c = await getCompanyReadiness();
        if (c.licence && c.licence.daysLeft < 60)
          out.push({
            id: "licence", tone: c.licence.daysLeft < 30 ? "rose" : "amber", icon: "store",
            title: `Trade licence expires in ${c.licence.daysLeft} days`,
            body: "Renew it before the number on the challan goes stale.",
            href: "/administration/company",
          });
        if (!c.ready && c.missing.length)
          out.push({
            id: "papers", tone: "sky", icon: "store",
            title: `${c.missing.length} company paper${c.missing.length === 1 ? "" : "s"} missing`,
            body: "The Mushak 6.3 challan refuses to print until these exist.",
            href: "/administration/company",
          });
      }),
    ]);

    setNotices(out);
  }, []);

  useEffect(() => {
    if (me?.role !== "OWNER") return;
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(t);
  }, [me, load]);

  /* click-away closes the panel */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (me?.role !== "OWNER") return null;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-[30px] h-[30px] rounded-[9px] grid place-items-center transition-colors shrink-0"
        style={{ background: open ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)" }}
      >
        <span className="text-white"><Icon name="alert" size={15} strokeWidth={2.2} /></span>
        {notices.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full grid place-items-center text-[9px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#c0392b,#e8604f)", boxShadow: "0 0 0 2px #2f1246" }}>
            {notices.length}
          </span>
        )}
      </button>

      {/*  FIXED, not absolute — the sidebar scrolls its own overflow, and an
          absolute panel was clipped inside it ("90 vag vitore chole jay").
          Fixed positioning escapes the sidebar entirely: the panel floats
          just to the right of it, bottom-aligned with the bell's home.  */}
      {open && (
        <div className="fixed left-[258px] bottom-[14px] w-[310px] z-50 rounded-[16px] overflow-hidden bg-white"
          style={{ boxShadow: "0 12px 40px rgba(40,20,55,0.38)", border: "1px solid #3c3249" }}>
          <div className="px-3.5 py-2.5 flex items-center gap-2"
            style={{ background: "linear-gradient(120deg,#8a2bb0,#cf43ea)" }}>
            <span className="text-[11.5px] font-extrabold tracking-[0.1em] uppercase text-white flex-1">Notifications</span>
            <span className="text-[10px] font-bold px-2 py-[1px] rounded-full bg-white/25 text-white">{notices.length}</span>
          </div>

          {notices.length === 0 ? (
            <p className="text-[12.5px] text-body-soft px-4 py-4 m-0">
              Nothing needs you — everything the system watches is in order.
            </p>
          ) : (
            <div className="max-h-[340px] overflow-y-auto">
              {notices.map((n) => (
                <Link key={n.id} href={n.href} onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-3.5 py-3 border-b border-[#3c3149] last:border-0 hover:bg-[#271a34] transition-colors">
                  <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center shrink-0 mt-[1px]"
                    style={{ background: TONE[n.tone].bg, color: TONE[n.tone].fg }}>
                    <Icon name={n.icon} size={13} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold leading-snug" style={{ color: TONE[n.tone].fg }}>{n.title}</span>
                    <span className="block text-[11px] text-body-soft leading-snug mt-0.5">{n.body}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

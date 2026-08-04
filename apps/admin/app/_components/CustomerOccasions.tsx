"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import { setDemoMode } from "../_data/demoMode";
import { listCustomersSafe, type ApiCustomer, type ApiRecipient, type ApiRecipientOccasion } from "../_data/api";

/*
  Customer Management · Occasions — every saved birthday / anniversary across all
  recipient books, as a working outreach board. This is the gifting business's
  demand calendar: who to message, when, and on whose behalf.

  Occasion DATES are Customer-owned (recipient book). Actually SENDING the reminder
  belongs to CRM / Marketing — this screen only surfaces the list.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const OCC_META: Record<string, { label: string; c: string; icon: string; bg: string }> = {
  BIRTHDAY: { label: "Birthday", c: "#c01fd8", icon: "sparkle", bg: "#fbe8fe" },
  ANNIVERSARY: { label: "Anniversary", c: "#d64fa0", icon: "heart", bg: "#fbecf1" },
  CUSTOM: { label: "Special day", c: "#3182c9", icon: "star", bg: "#e9f1fb" },
};

function nextOccurrence(raw: string): { label: string; daysAway: number; month: number } | null {
  if (!raw) return null;
  let m: number, d: number;
  const mmdd = /^(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (mmdd) {
    m = Number(mmdd[1]);
    d = Number(mmdd[2]);
  } else {
    const t = Date.parse(raw);
    if (!t) return null;
    const dt = new Date(t);
    m = dt.getMonth() + 1;
    d = dt.getDate();
  }
  if (!m || !d || m > 12 || d > 31) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let occ = new Date(today.getFullYear(), m - 1, d);
  if (occ.getTime() < today.getTime()) occ = new Date(today.getFullYear() + 1, m - 1, d);
  return {
    label: `${d} ${MONTHS[m - 1]}`,
    daysAway: Math.round((occ.getTime() - today.getTime()) / 86_400_000),
    month: m,
  };
}

type Row = {
  cust: ApiCustomer;
  rec: ApiRecipient;
  occ: ApiRecipientOccasion;
  label: string;
  daysAway: number;
  month: number;
};

const RANGES = [
  { k: "7", label: "Next 7 days", days: 7 },
  { k: "30", label: "Next 30 days", days: 30 },
  { k: "90", label: "Next 90 days", days: 90 },
  { k: "365", label: "Whole year", days: 366 },
];

export default function CustomerOccasions() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("30");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /* Sending belongs to CRM/Marketing — what we CAN do here is hand staff a
     ready-to-paste WhatsApp message for the customer. */
  function copyReminder(r: Row, typeLabel: string) {
    const occasion = (r.occ.label || typeLabel).toLowerCase();
    const when = r.daysAway === 0 ? "today" : r.daysAway === 1 ? "tomorrow" : `on ${r.label} (in ${r.daysAway} days)`;
    const msg =
      `Hi ${r.cust.name}, this is Radian. ${r.rec.name}'s ${occasion} is ${when}. ` +
      `Would you like us to deliver flowers or a gift to ${r.rec.name}? We can arrange same-day delivery.`;
    navigator.clipboard
      ?.writeText(msg)
      .then(() => {
        setCopied(r.rec.id + r.occ.id);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => alert(msg));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomersSafe();
      setAll(res.items);
      setIsDemo(res.isDemo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const allRows = useMemo(() => {
    const out: Row[] = [];
    for (const c of all) {
      for (const r of c.recipients ?? []) {
        for (const o of r.occasions ?? []) {
          const n = nextOccurrence(o.date);
          if (n) out.push({ cust: c, rec: r, occ: o, ...n });
        }
      }
    }
    return out.sort((a, b) => a.daysAway - b.daysAway);
  }, [all]);

  const days = RANGES.find((r) => r.k === range)?.days ?? 30;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        r.daysAway <= days &&
        (!type || r.occ.type === type) &&
        (!s ||
          r.rec.name.toLowerCase().includes(s) ||
          r.cust.name.toLowerCase().includes(s) ||
          r.cust.phone.includes(s)),
    );
  }, [allRows, days, type, q]);

  /* month histogram — the demand calendar for the whole year */
  const byMonth = useMemo(() => {
    const counts = new Array(12).fill(0) as number[];
    for (const r of allRows) counts[r.month - 1]++;
    return counts;
  }, [allRows]);
  const maxMonth = Math.max(...byMonth, 1);

  const within7 = allRows.filter((r) => r.daysAway <= 7).length;
  const within30 = allRows.filter((r) => r.daysAway <= 30).length;
  const birthdays = allRows.filter((r) => r.occ.type === "BIRTHDAY").length;
  const annivs = allRows.filter((r) => r.occ.type === "ANNIVERSARY").length;

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · occasions
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Occasion board</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">
            Every birthday and anniversary saved in your customers&apos; recipient books — your demand calendar and outreach list.
          </p>
        </div>
        <Link href="/customers" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
          Overview
        </Link>
      </div>

      {error && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. API (:4000) চলছে কিনা দেখো। <button className="underline" onClick={load}>Retry</button>
        </div>
      )}
      <DemoBanner isDemo={isDemo} onReload={load} />
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading occasions…</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { l: "This week", v: String(within7), c: "#c0287f", bg: "#fdecf5", icon: "bolt" },
          { l: "Next 30 days", v: String(within30), c: "#7a2ea8", bg: "#f5eafb", icon: "clock" },
          { l: "Birthdays", v: String(birthdays), c: "#c01fd8", bg: "#fbe8fe", icon: "sparkle" },
          { l: "Anniversaries", v: String(annivs), c: "#d64fa0", bg: "#fbecf1", icon: "heart" },
          { l: "Total saved dates", v: String(allRows.length), c: "#12a172", bg: "#e6f7ef", icon: "star" },
        ].map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}>
              <Icon name={k.icon} size={13} />
            </span>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>

      {/* year calendar */}
      <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft mb-4">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-white" style={{ background: "#8b3fb0" }}>
            <Icon name="grid" size={16} />
          </span>
          <div>
            <div className="font-display text-[16px] text-purple leading-tight">Demand calendar</div>
            <div className="text-[13px] text-body-soft">saved occasions per month — plan stock and campaigns around the peaks</div>
          </div>
        </div>
        <div className="flex items-end gap-2 h-[130px]">
          {byMonth.map((n, i) => {
            const now = new Date().getMonth();
            const isNow = i === now;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <div className="text-[11px] font-semibold text-purple">{n || ""}</div>
                <div
                  className="w-full rounded-t-[6px] transition-all"
                  style={{
                    height: `${(n / maxMonth) * 82}%`,
                    minHeight: n ? 6 : 2,
                    background: isNow ? "linear-gradient(180deg,#cf43ea,#470066)" : "linear-gradient(180deg,#e3b8f0,#b57cd0)",
                  }}
                />
                <div className={"text-[11px] " + (isNow ? "text-purple font-bold" : "text-body-soft")}>{MONTHS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* filters */}
      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search recipient or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[170px] h-[44px]" value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map((r) => (
            <option key={r.k} value={r.k}>{r.label}</option>
          ))}
        </select>
        <select className="ipt max-w-[170px] h-[44px]" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All occasions</option>
          <option value="BIRTHDAY">Birthday</option>
          <option value="ANNIVERSARY">Anniversary</option>
          <option value="CUSTOM">Special day</option>
        </select>
        <span className="text-[13px] text-body-soft ml-auto">{rows.length} occasion{rows.length === 1 ? "" : "s"}</span>
      </div>

      {/* list */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-5 py-2.5">When</th>
              <th className="text-left font-medium px-4 py-2.5">Occasion</th>
              <th className="text-left font-medium px-4 py-2.5">Recipient</th>
              <th className="text-left font-medium px-4 py-2.5">Deliver to</th>
              <th className="text-left font-medium px-4 py-2.5">Gift sender (customer)</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const meta = OCC_META[r.occ.type] ?? OCC_META.CUSTOM;
              const soon = r.daysAway <= 7;
              return (
                <tr key={i} className={"border-t border-lavender-deep hover:bg-lavender/50 " + (soon ? "bg-[#fffafd]" : "")}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-purple">{r.label}</div>
                    <div className={"text-[11px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 " + (soon ? "bg-[#fdecf5] text-[#c0287f]" : "bg-lavender-deep/60 text-body-soft")}>
                      {r.daysAway === 0 ? "today" : r.daysAway === 1 ? "tomorrow" : `in ${r.daysAway}d`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full font-medium" style={{ background: meta.bg, color: meta.c }}>
                      <Icon name={meta.icon} size={13} /> {r.occ.label || meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-purple">{r.rec.name}</div>
                    <div className="text-[13px] text-body-soft capitalize">{r.rec.relationship} · {r.rec.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[13px] text-body truncate max-w-[220px]">{r.rec.addressLine}</div>
                    <div className="text-[13px] text-body-soft">{r.rec.zone === "DHAKA" ? "Inside Dhaka" : "Nationwide"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${r.cust.id}`} className="font-medium text-orchid">{r.cust.name}</Link>
                    <div className="text-[13px] text-body-soft">{r.cust.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyReminder(r, meta.label)}
                      className={
                        "border text-[12px] font-medium px-3 py-1.5 rounded-[9px] whitespace-nowrap transition-colors " +
                        (copied === r.rec.id + r.occ.id
                          ? "border-[#0e7a3d] text-[#0e7a3d] bg-[#e8f9ee]"
                          : "border-lavender-deep hover:border-orchid text-purple")
                      }
                      title="Copy a ready WhatsApp message"
                    >
                      {copied === r.rec.id + r.occ.id ? "Copied ✓" : "Remind"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-center py-12 border-t border-lavender-deep">
                  {allRows.length === 0 && !isDemo ? (
                    <>
                      <div className="text-purple font-medium">No saved occasions yet</div>
                      <p className="text-body-soft text-[13px] mt-1 max-w-[460px] mx-auto">
                        Your live customers have no birthdays or anniversaries in their recipient book, so there is
                        nothing to show. Add them in a customer&apos;s profile — or explore this screen with sample data.
                      </p>
                      <button
                        onClick={() => {
                          setDemoMode(true);
                          load();
                        }}
                        className="mt-3 bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-4 py-2 rounded-[10px] shadow-soft"
                      >
                        Show demo data
                      </button>
                    </>
                  ) : (
                    <span className="text-body-soft">
                      No occasions in this range. Try a wider range, or clear the filters.
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-body-soft text-[12px] mt-3.5">
        Dates are <b>Customer-owned</b> (recipient book). Sending the reminder is a <b>CRM / Marketing</b> job — that module is not
        locked yet, so “Remind” is a prototype here.
      </p>
    </div>
  );
}

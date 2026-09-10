"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import {
  listCustomersSafe,
  listSegmentsSafe,
  formatTaka,
  initials,
  ago,
  genAvatar,
  type ApiCustomer,
  type ApiSegment,
  type ApiRecipient,
  type ApiRecipientOccasion,
} from "../_data/api";

/*
  Customer Management · Overview — read-only rollups from :4000 /customers + /segments.
  Orders / LTV are SALES-owned (One Data One Owner) — shown here, never edited here.
  The occasion radar is the money screen for a gift business: who to message this month.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const MIX = ["#8b3fb0", "#e08a0f", "#3182c9", "#d64fa0", "#1aa06a", "#b5642f", "#00a1a7"];

function takaShort(paisa: number): string {
  const t = paisa / 100;
  if (t >= 10_000_000) return "৳ " + (t / 10_000_000).toFixed(2) + "Cr";
  if (t >= 100_000) return "৳ " + (t / 100_000).toFixed(2) + "L";
  if (t >= 1000) return "৳ " + (t / 1000).toFixed(1) + "K";
  return "৳ " + Math.round(t).toLocaleString("en-IN");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "MM-DD" or ISO → next upcoming occurrence + days away */
function nextOccurrence(raw: string): { label: string; daysAway: number } | null {
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
  const daysAway = Math.round((occ.getTime() - today.getTime()) / 86_400_000);
  return { label: `${d} ${MONTHS[m - 1]}`, daysAway };
}

const OCC_META: Record<string, { label: string; c: string; icon: string }> = {
  BIRTHDAY: { label: "Birthday", c: "#db70eb", icon: "sparkle" },
  ANNIVERSARY: { label: "Anniversary", c: "#e07bb8", icon: "heart" },
  CUSTOM: { label: "Special day", c: "#7cb1df", icon: "star" },
};

function Chip({ icon, c, sm }: { icon: string; c: string; sm?: boolean }) {
  const s = sm ? "w-[24px] h-[24px] rounded-[7px]" : "w-[28px] h-[28px] rounded-[8px]";
  return (
    <span className={`${s} flex items-center justify-center text-white shrink-0`} style={{ background: c }}>
      <Icon name={icon} size={sm ? 13 : 16} />
    </span>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; right: string; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-body truncate pr-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="font-semibold text-purple shrink-0">{r.right}</span>
          </div>
          <div className="h-[10px] bg-lavender rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-[13px] text-body-soft py-2">No data yet.</div>}
    </div>
  );
}

type OccRow = {
  cust: ApiCustomer;
  rec: ApiRecipient;
  occ: ApiRecipientOccasion;
  label: string;
  daysAway: number;
};

export default function CustomerOverview() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [segments, setSegments] = useState<(ApiSegment & { _count?: { customers: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [res, segs] = await Promise.all([listCustomersSafe(), listSegmentsSafe()]);
      setAll(res.items);
      setSegments(segs.items);
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

  const s = useMemo(() => {
    let repeat = 0, onetime = 0, neu = 0, abroad = 0, blocked = 0, verified = 0;
    let ltv = 0, orders = 0, recipients = 0, withRecipients = 0, favourites = 0;
    let dhaka = 0, nationwide = 0, churn = 0, noPhoneVerify = 0;
    const byCountry: Record<string, number> = {};
    const byRel: Record<string, number> = {};
    const cutoff = Date.now() - 90 * 86_400_000;

    for (const c of all) {
      if (c.tier === "repeat") repeat++;
      else if (c.tier === "onetime") onetime++;
      else neu++;
      if (c.isAbroad) abroad++;
      if (c.status === "BLOCKED") blocked++;
      if (c.whatsappVerified) verified++;
      else noPhoneVerify++;
      ltv += c.ltvPaisa;
      orders += c.ordersCount;
      byCountry[c.country || "Unknown"] = (byCountry[c.country || "Unknown"] || 0) + 1;

      if (c.ordersCount > 0 && c.lastOrderAt && Date.parse(c.lastOrderAt) < cutoff) churn++;

      const rs = c.recipients ?? [];
      recipients += rs.length;
      if (rs.length) withRecipients++;
      for (const r of rs) {
        if (r.isFavorite) favourites++;
        if (r.zone === "DHAKA") dhaka++;
        else nationwide++;
        const key = (r.relationship || "other").toLowerCase();
        byRel[key] = (byRel[key] || 0) + 1;
      }
    }

    const total = all.length;
    return {
      total, repeat, onetime, neu, abroad, blocked, verified, noPhoneVerify,
      ltv, orders, recipients, withRecipients, favourites, dhaka, nationwide, churn,
      aov: orders ? Math.round(ltv / orders) : 0,
      avgLtv: total ? Math.round(ltv / total) : 0,
      repeatRate: total ? Math.round((repeat / total) * 100) : 0,
      verifiedPct: total ? Math.round((verified / total) * 100) : 0,
      avgOrders: total ? (orders / total).toFixed(1) : "0",
      avgRecipients: total ? (recipients / total).toFixed(1) : "0",
      noRecipients: total - withRecipients,
      byCountry, byRel,
    };
  }, [all]);

  /** occasion radar — next 30 days across every recipient */
  const upcoming = useMemo(() => {
    const out: OccRow[] = [];
    for (const c of all) {
      for (const r of c.recipients ?? []) {
        for (const o of r.occasions ?? []) {
          const n = nextOccurrence(o.date);
          if (n && n.daysAway <= 30) out.push({ cust: c, rec: r, occ: o, label: n.label, daysAway: n.daysAway });
        }
      }
    }
    return out.sort((a, b) => a.daysAway - b.daysAway);
  }, [all]);

  const topCustomers = useMemo(
    () => [...all].filter((c) => c.ltvPaisa > 0).sort((a, b) => b.ltvPaisa - a.ltvPaisa).slice(0, 8),
    [all],
  );
  const atRisk = useMemo(() => {
    const cutoff = Date.now() - 90 * 86_400_000;
    return all
      .filter((c) => c.ordersCount > 0 && c.lastOrderAt && Date.parse(c.lastOrderAt) < cutoff)
      .sort((a, b) => b.ltvPaisa - a.ltvPaisa)
      .slice(0, 6);
  }, [all]);

  const HERO = [
    { l: "Total customers", v: String(s.total), sub: `${s.withRecipients} have a recipient book`, icon: "user", c: "#b97fdc", bg: "#2e1a38" },
    { l: "Repeat buyers", v: String(s.repeat), sub: `${s.repeatRate}% repeat rate`, icon: "heart", c: "#75f0c7", bg: "#1e362b" },
    { l: "Yet to order", v: String(s.neu), sub: "signed up, no order yet", icon: "bolt", c: "#e1b17a", bg: "#3b2d18" },
    { l: "Ordering from abroad", v: String(s.abroad), sub: "NRB — gifts sent home", icon: "truck", c: "#7cb1df", bg: "#192739" },
    { l: "Lifetime value", v: takaShort(s.ltv), sub: `${takaShort(s.avgLtv)} avg per customer`, icon: "cash", c: "#db70eb", bg: "#36163b" },
    { l: "Gift network", v: String(s.recipients), sub: `${s.avgRecipients} recipients per customer`, icon: "pin", c: "#d388a1", bg: "#371a24" },
  ];

  const SECOND = [
    { l: "Avg order value", v: takaShort(s.aov), icon: "bag", c: "#b97fdc" },
    { l: "Orders (all time)", v: String(s.orders), icon: "bag", c: "#b09ac1" },
    { l: "Avg orders / customer", v: s.avgOrders, icon: "layers", c: "#7cb1df" },
    { l: "One-time buyers", v: String(s.onetime), icon: "user", c: "#f4bd66" },
    { l: "WhatsApp verified", v: s.verifiedPct + "%", icon: "shield", c: "#75f0c7" },
    { l: "Favourite recipients", v: String(s.favourites), icon: "star", c: "#c9929a" },
    { l: "Dhaka recipients", v: String(s.dhaka), icon: "pin", c: "#bb87d4" },
    { l: "Nationwide recipients", v: String(s.nationwide), icon: "truck", c: "#dda37d" },
    { l: "No recipient yet", v: String(s.noRecipients), icon: "hash", c: "#b09ac1" },
    { l: "Quiet 90+ days", v: String(s.churn), icon: "clock", c: s.churn > 0 ? "#e1837a" : "#75f0c7" },
    { l: "Unverified phone", v: String(s.noPhoneVerify), icon: "phone", c: s.noPhoneVerify > 0 ? "#f4bd66" : "#75f0c7" },
    { l: "Blocked", v: String(s.blocked), icon: "trash", c: s.blocked > 0 ? "#e1837a" : "#75f0c7" },
  ];

  const mixTotal = s.total || 1;
  const countryRows = Object.entries(s.byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n], i) => ({ label: name, value: n, right: `${n} · ${Math.round((n / mixTotal) * 100)}%`, color: MIX[i % MIX.length] }));
  const relRows = Object.entries(s.byRel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n], i) => ({ label: name.charAt(0).toUpperCase() + name.slice(1), value: n, right: String(n), color: MIX[(i + 2) % MIX.length] }));
  const segRows = [...segments]
    .sort((a, b) => (b._count?.customers ?? 0) - (a._count?.customers ?? 0))
    .slice(0, 7)
    .map((sg, i) => ({ label: sg.name, value: sg._count?.customers ?? 0, right: String(sg._count?.customers ?? 0), color: MIX[i % MIX.length] }));

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · overview
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Overview</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">
            Who your customers are, who they gift to, and who to reach out to this month.
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <Link href="/customers/occasions" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
            Occasion board
          </Link>
          <Link href="/customers/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
            All customers
          </Link>
          <Link href="/customers/new" className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] inline-flex items-center gap-2 shadow-soft">
            <Icon name="plus" size={17} /> Add customer
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-[#3b1a16] border border-[#4d2e2e] text-[#e1837a] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. Is the API (:4000) running?{" "}
          <button className="underline" onClick={load}>Retry</button>
        </div>
      )}
      <DemoBanner isDemo={isDemo} onReload={load} />
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading customer analytics…</div>}

      {/* hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        {HERO.map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <Chip icon={k.icon} c={k.c} sm />
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5 leading-tight">{k.l}</div>
            <div className="text-[13px] text-body-soft mt-0.5 leading-tight">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* secondary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 mb-5">
        {SECOND.map((x, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[11px] px-3 py-2.5 shadow-soft flex items-center gap-2.5">
            <Chip icon={x.icon} c={x.c} sm />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold font-display leading-none" style={{ color: x.c }}>{x.v}</div>
              <div className="text-[10px] text-body-soft mt-1 leading-tight truncate">{x.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* occasion radar + customer mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 2xl:gap-5 mb-4">
        <div className="lg:col-span-2 bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Chip icon="sparkle" c="#cf43ea" />
              <div>
                <div className="font-display text-[16px] text-purple leading-tight">Upcoming occasions · next 30 days</div>
                <div className="text-[13px] text-body-soft">from every customer&apos;s recipient book — your WhatsApp outreach list</div>
              </div>
            </div>
            <span className="text-[11.5px] font-semibold text-orchid">{upcoming.length} coming up</span>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-[13px] text-body-soft py-6 text-center">
              No occasions in the next 30 days. Add birthdays &amp; anniversaries in each customer&apos;s recipient book.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[340px] overflow-auto">
              {upcoming.slice(0, 12).map((u, i) => {
                const meta = OCC_META[u.occ.type] ?? OCC_META.CUSTOM;
                const soon = u.daysAway <= 7;
                return (
                  <div key={i} className={"flex items-center gap-3 border rounded-[12px] px-3 py-2.5 " + (soon ? "bg-[#39152f] border-[#4e2d4d]" : "bg-lavender/40 border-lavender-deep")}>
                    <Chip icon={meta.icon} c={meta.c} sm />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-purple truncate">
                        {u.rec.name}
                        <span className="text-body-soft font-normal"> · {u.occ.label || meta.label}</span>
                      </div>
                      <div className="text-[13px] text-body-soft truncate">
                        {u.rec.relationship} of{" "}
                        <Link href={`/customers/${u.cust.id}`} className="text-orchid font-medium">{u.cust.name}</Link>
                        {" · "}{u.cust.phone}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-semibold" style={{ color: meta.c }}>{u.label}</div>
                      <div className={"text-[11px] font-bold px-2 py-0.5 rounded-full mt-0.5 " + (soon ? "bg-[#3b172a] text-[#e378b5]" : "bg-lavender-deep/60 text-body-soft")}>
                        {u.daysAway === 0 ? "today" : u.daysAway === 1 ? "tomorrow" : `in ${u.daysAway}d`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* customer mix */}
        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3">
            <Chip icon="grid" c="#8b3fb0" />
            <div>
              <div className="font-display text-[16px] text-purple leading-tight">Customer mix</div>
              <div className="text-[13px] text-body-soft">derived from order count</div>
            </div>
          </div>
          <div className="flex h-[14px] rounded-full overflow-hidden mb-4 mt-1 bg-lavender">
            <div style={{ width: `${(s.repeat / mixTotal) * 100}%`, background: "linear-gradient(90deg,#12a172,#3fce9a)" }} />
            <div style={{ width: `${(s.onetime / mixTotal) * 100}%`, background: "linear-gradient(90deg,#d98a0f,#f0b95a)" }} />
            <div style={{ width: `${(s.neu / mixTotal) * 100}%`, background: "linear-gradient(90deg,#470066,#cf43ea)" }} />
          </div>
          {[
            { l: "Repeat (2+ orders)", v: s.repeat, c: "#75f0c7" },
            { l: "One-time", v: s.onetime, c: "#f4bd66" },
            { l: "Yet to order", v: s.neu, c: "#bb87d4" },
          ].map((r) => (
            <div key={r.l} className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="flex items-center gap-2 text-body">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.c }} />{r.l}
              </span>
              <span className="font-semibold text-purple">{r.v} · {Math.round((r.v / mixTotal) * 100)}%</span>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-lavender-deep text-[13px] text-body-soft">
            Turning one-time buyers into repeat is the cheapest growth — they already trust you.
          </div>
        </div>
      </div>

      {/* segments + country + relationship */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 2xl:gap-5 mb-4">
        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3">
            <Chip icon="hash" c="#c01fd8" />
            <div>
              <div className="font-display text-[16px] text-purple leading-tight">Segments</div>
              <div className="text-[13px] text-body-soft">customers per tag</div>
            </div>
          </div>
          <Bars rows={segRows} />
        </div>

        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3">
            <Chip icon="truck" c="#3182c9" />
            <div>
              <div className="font-display text-[16px] text-purple leading-tight">Where they order from</div>
              <div className="text-[13px] text-body-soft">customer country</div>
            </div>
          </div>
          <Bars rows={countryRows} />
        </div>

        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3">
            <Chip icon="heart" c="#d64fa0" />
            <div>
              <div className="font-display text-[16px] text-purple leading-tight">Who they gift to</div>
              <div className="text-[13px] text-body-soft">recipient relationship</div>
            </div>
          </div>
          <Bars rows={relRows} />
        </div>
      </div>

      {/* top customers + at risk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 2xl:gap-5">
        <div className="lg:col-span-2 bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-lavender-deep">
            <div className="flex items-center gap-2.5">
              <Chip icon="star" c="#b76e79" />
              <div className="font-display text-[16px] text-purple">Top customers by lifetime value</div>
            </div>
            <Link href="/customers/list" className="text-[12.5px] font-semibold text-orchid">All customers →</Link>
          </div>
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
                <th className="text-left font-medium px-5 py-2.5">Customer</th>
                <th className="text-left font-medium px-4 py-2.5">Orders</th>
                <th className="text-left font-medium px-4 py-2.5">Lifetime value</th>
                <th className="text-left font-medium px-4 py-2.5">Last order</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => (
                <tr key={c.id} className="border-t border-lavender-deep hover:bg-lavender/50">
                  <td className="px-5 py-3">
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                      <span
                        className="w-[34px] h-[34px] rounded-full grid place-items-center text-white text-[12px] font-medium font-display shrink-0"
                        style={{ background: c.avatarBg || genAvatar(c.id) }}
                      >
                        {initials(c.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-purple truncate">{c.name}</span>
                        <span className="block text-[13px] text-body-soft truncate">{c.country} · {c.phone}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.ordersCount}</td>
                  <td className="px-4 py-3 font-semibold text-purple">{formatTaka(c.ltvPaisa)}</td>
                  <td className="px-4 py-3 text-body-soft">{ago(c.lastOrderAt)}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-body-soft py-10 border-t border-lavender-deep">
                    No orders yet — lifetime value appears once Sales records orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* needs attention */}
        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3">
            <Chip icon="clock" c="#d98a0f" />
            <div>
              <div className="font-display text-[16px] text-purple leading-tight">Needs attention</div>
              <div className="text-[13px] text-body-soft">bought before, quiet 90+ days</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {atRisk.map((c) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex items-center gap-3 border border-[#534528] bg-[#3a2e16] rounded-[12px] px-3 py-2.5 hover:border-orchid"
              >
                <span
                  className="w-[30px] h-[30px] rounded-full grid place-items-center text-white text-[11px] font-medium font-display shrink-0"
                  style={{ background: c.avatarBg || genAvatar(c.id) }}
                >
                  {initials(c.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-purple truncate">{c.name}</div>
                  <div className="text-[13px] text-body-soft">{formatTaka(c.ltvPaisa)} · last {ago(c.lastOrderAt)}</div>
                </div>
              </Link>
            ))}
            {atRisk.length === 0 && (
              <div className="text-[13px] text-body-soft py-2">Nobody has gone quiet. Good retention.</div>
            )}
          </div>
        </div>
      </div>

      <p className="text-body-soft text-[12px] mt-3.5">
        Orders, lifetime value and delivery counts are <b>owned by Sales/Delivery</b> — read-only here (One Data, One Owner).
        Customer Management owns identity, recipient book, segments and consent.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  OFFERS,
  LEADERBOARD,
  REDEMPTION_TREND,
  TYPE_MIX,
  CHANNEL_PERF,
  OCCASION_PERF,
  AUTO_VS_COUPON,
  OVERVIEW,
  SHAPE_LABEL,
  roi,
  pct,
  taka,
  takaShort,
  type LeaderRow,
} from "../_data/offers";

/*
  Offers & Promotions · Overview (MOCK, §9) — colorful, compact dashboard.
  Covers every angle: financial, customer, offer performance, channel, occasion,
  operational. Read-only rollups from Sales Order + Customer.
  Charts inline SVG; magnitude single-hue, categorical = validated CVD-safe palette.
  ⇄ SWAP HERE: :4000 /offers/analytics.
*/

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1320px]";
const INK = "#470066", GREEN = "#0f9d6b", AMBER = "#d98a0f", RED = "#c0392b";
const MIX = ["#8b3fb0", "#e08a0f", "#3182c9", "#d64fa0", "#1aa06a", "#b5642f", "#00a1a7"];

function toneMeta(t: LeaderRow["marginTone"]) {
  if (t === "ok") return { c: GREEN, bg: "bg-[#e8f6ef]", tx: "text-[#0f7d55]", cardBg: "bg-[#f2fbf6]", ring: "border-[#bfe6d1]", label: "Healthy" };
  if (t === "warn") return { c: AMBER, bg: "bg-[#fff4e2]", tx: "text-[#b45309]", cardBg: "bg-[#fffaf0]", ring: "border-[#f0d9a8]", label: "Thin" };
  return { c: RED, bg: "bg-[#fdecec]", tx: "text-[#c0392b]", cardBg: "bg-[#fef4f4]", ring: "border-[#f0c2c2]", label: "Below cost" };
}
function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-[#fff4e2] text-[#b45309]"}`}>{up ? "▲" : "▼"} {Math.abs(v)}%</span>;
}
function Chip({ icon, c, sm }: { icon: string; c: string; sm?: boolean }) {
  const s = sm ? "w-[24px] h-[24px] rounded-[7px]" : "w-[28px] h-[28px] rounded-[8px]";
  return <span className={`${s} flex items-center justify-center text-white shrink-0`} style={{ background: c }}><Icon name={icon} size={sm ? 13 : 16} /></span>;
}

function TrendArea() {
  const d = REDEMPTION_TREND;
  const W = 640, H = 168, P = 18;
  const max = Math.max(...d.map((p) => p.value)) * 1.12;
  const x = (i: number) => P + (i * (W - 2 * P)) / (d.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = d.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(d.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="168" preserveAspectRatio="none" role="img" aria-label="Redemptions over 12 weeks">
      <defs>
        <linearGradient id="ovArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cf43ea" stopOpacity="0.34" /><stop offset="60%" stopColor="#e75a9c" stopOpacity="0.12" /><stop offset="100%" stopColor="#e75a9c" stopOpacity="0.02" /></linearGradient>
        <linearGradient id="ovLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#470066" /><stop offset="60%" stopColor="#cf43ea" /><stop offset="100%" stopColor="#e75a9c" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (<line key={g} x1={P} x2={W - P} y1={P + g * (H - 2 * P)} y2={P + g * (H - 2 * P)} stroke="#efe4f7" strokeWidth="1" />))}
      <path d={area} fill="url(#ovArea)" />
      <path d={line} fill="none" stroke="url(#ovLine)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {d.map((p, i) => (<g key={i}><circle cx={x(i)} cy={y(p.value)} r={i === d.length - 1 ? 5 : 3} fill="#fff" stroke="#cf43ea" strokeWidth="2.4" /><title>{`${p.label}: ${p.value} redemptions`}</title></g>))}
      <text x={x(d.length - 1)} y={y(d[d.length - 1].value) - 10} textAnchor="end" fontSize="12.5" fontWeight="700" fill={INK}>{d[d.length - 1].value}</text>
    </svg>
  );
}

/* reusable categorical horizontal bars */
function Bars({ rows }: { rows: { label: string; value: number; right: string; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-[12px] mb-1"><span className="text-body truncate pr-2 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span><span className="font-semibold text-purple">{r.right}</span></div>
          <div className="h-[10px] bg-lavender rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function OffersOverview() {
  const [range, setRange] = useState("30d");
  const [sortKey, setSortKey] = useState<"redemptions" | "revenuePaisa" | "discountPaisa" | "roi" | "newCustomers">("revenuePaisa");
  const [sortDir, setSortDir] = useState(-1);
  const RF = range === "7d" ? 0.28 : range === "90d" ? 2.7 : 1;
  const rf = (n: number) => Math.round(n * RF);
  const totalRed = rf(LEADERBOARD.reduce((s, r) => s + r.redemptions, 0));
  const discount = rf(LEADERBOARD.reduce((s, r) => s + r.discountPaisa, 0));
  const revenue = rf(LEADERBOARD.reduce((s, r) => s + r.revenuePaisa, 0));
  const newCust = rf(LEADERBOARD.reduce((s, r) => s + r.newCustomers, 0));
  const sortVal = (r: (typeof LEADERBOARD)[number]) => (sortKey === "roi" ? roi(r) : r[sortKey]);
  const sortedBoard = [...LEADERBOARD].sort((a, b) => (sortVal(a) - sortVal(b)) * sortDir);
  const net = revenue - discount;
  const avgRoi = discount ? revenue / discount : 0;
  const marginPct = revenue ? Math.round((net / revenue) * 100) : 0;
  const cac = newCust ? Math.round(discount / newCust) : 0;
  const dependency = Math.round((discount / OVERVIEW.storeRevenuePaisa) * 100);
  const attributed = Math.round((revenue / OVERVIEW.storeRevenuePaisa) * 100);
  const aovLift = Math.round(((OVERVIEW.aovWithPaisa - OVERVIEW.aovWithoutPaisa) / OVERVIEW.aovWithoutPaisa) * 100);
  const redemptionRate = Math.round((OVERVIEW.couponRedeemed / OVERVIEW.couponIssued) * 100);
  const penetration = Math.round((OVERVIEW.ordersWithOffer / OVERVIEW.storeOrders) * 100);
  const avgDiscOrder = OVERVIEW.ordersWithOffer ? Math.round(discount / OVERVIEW.ordersWithOffer) : 0;

  const byRoi = [...LEADERBOARD].sort((a, b) => roi(b) - roi(a));
  const best = [...LEADERBOARD].sort((a, b) => b.revenuePaisa - a.revenuePaisa)[0];
  const watch = LEADERBOARD.filter((r) => r.marginTone !== "ok");
  const mixTotal = TYPE_MIX.reduce((s, m) => s + m.count, 0);
  const acTotal = AUTO_VS_COUPON.automaticPaisa + AUTO_VS_COUPON.couponPaisa;
  const autoPct = Math.round((AUTO_VS_COUPON.automaticPaisa / acTotal) * 100);

  const HERO = [
    { l: "Revenue influenced", v: takaShort(revenue), delta: pct(revenue, OVERVIEW.revenuePrevPaisa), sub: `${attributed}% of store revenue`, icon: "cash", c: "#7a2ea8", bg: "#f5eafb" },
    { l: "Net after discount", v: takaShort(net), sub: `${marginPct}% margin retained`, icon: "shield", c: "#2f6fb0", bg: "#e9f1fb" },
    { l: "Redemptions · 30d", v: String(totalRed), delta: pct(totalRed, OVERVIEW.redemptionsPrev), sub: `${redemptionRate}% coupon redemption`, icon: "tag", c: "#c01fd8", bg: "#fbe8fe" },
    { l: "New customers", v: String(newCust), delta: pct(newCust, OVERVIEW.newCustPrev), sub: `${taka(cac)} acquisition cost`, icon: "user", c: "#12a172", bg: "#e6f7ef" },
    { l: "Avg ROI", v: avgRoi.toFixed(1) + "×", sub: "revenue ÷ discount", icon: "star", c: "#c07a2b", bg: "#fbf1e2" },
    { l: "Offer penetration", v: penetration + "%", sub: "of all orders used an offer", icon: "bolt", c: "#c0567a", bg: "#fbecf1" },
  ];

  const SECOND = [
    { l: "AOV with offer", v: takaShort(OVERVIEW.aovWithPaisa), icon: "bag", c: "#7a2ea8" },
    { l: "AOV without", v: takaShort(OVERVIEW.aovWithoutPaisa), icon: "bag", c: "#8a6aa3" },
    { l: "AOV lift", v: "+" + aovLift + "%", icon: "bolt", c: "#12a172" },
    { l: "Avg discount / order", v: taka(avgDiscOrder), icon: "cash", c: "#d98a0f" },
    { l: "Discount dependency", v: dependency + "%", icon: "shield", c: dependency > 12 ? "#c0392b" : "#2f6fb0" },
    { l: "Repeat rate", v: OVERVIEW.repeatRatePct + "%", icon: "heart", c: "#c01fd8" },
    { l: "Offer-cust. LTV", v: takaShort(OVERVIEW.offerCustomerLtvPaisa), icon: "star", c: "#12a172" },
    { l: "Coupons issued", v: OVERVIEW.couponIssued.toLocaleString("en-IN"), icon: "hash", c: "#3182c9" },
    { l: "Gift / bonus cost", v: takaShort(OVERVIEW.giftBonusCostPaisa), icon: "box", c: "#b5642f" },
    { l: "Active offers", v: String(OFFERS.filter((o) => o.status === "active").length), icon: "sparkle", c: "#b76e79" },
    { l: "Scheduled", v: String(OVERVIEW.scheduledCount), icon: "clock", c: "#8b3fb0" },
    { l: "Expiring soon", v: String(OVERVIEW.expiringSoon), icon: "clock", c: "#d98a0f" },
  ];

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offers & Promotions · overview</div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Overview</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Every angle — revenue, profit, customers, channels, occasions, and which offer worked hardest. Read from completed orders (mock).</p>
        </div>
        <div className="flex gap-1 bg-lavender p-1 rounded-[11px] shrink-0">
          {["7d", "30d", "90d"].map((r) => (<button key={r} onClick={() => setRange(r)} className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-[8px] transition-colors ${range === r ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{r}</button>))}
        </div>
      </div>

      {/* hero KPIs — compact colored tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        {HERO.map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <div className="flex items-center justify-between gap-1">
              <Chip icon={k.icon} c={k.c} sm />
              {typeof k.delta === "number" && <Delta v={k.delta} />}
            </div>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5 leading-tight">{k.l}</div>
            <div className="text-[13px] text-body-soft mt-0.5 leading-tight">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* secondary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 mb-5">
        {SECOND.map((s, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[11px] px-3 py-2.5 shadow-soft flex items-center gap-2.5">
            <Chip icon={s.icon} c={s.c} sm />
            <div className="min-w-0"><div className="text-[14px] font-semibold font-display leading-none" style={{ color: s.c }}>{s.v}</div><div className="text-[10px] text-body-soft mt-1 leading-tight truncate">{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* best offer + trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="relative overflow-hidden rounded-[18px] p-5 shadow-lift text-white" style={{ background: "linear-gradient(145deg,#470066 0%,#7a1b9e 45%,#cf43ea 100%)" }}>
          <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
          <div className="absolute -right-2 bottom-2 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white/80"><Icon name="star" size={14} /> Best-performing offer</div>
            <div className="font-display text-[21px] mt-2 leading-tight">{best.name}</div>
            <div className="text-[12.5px] text-white/80 mt-1">{SHAPE_LABEL[best.shape]} · {best.redemptions} redemptions</div>
            <div className="flex gap-5 mt-4">
              <div><div className="font-display text-[20px]">{takaShort(best.revenuePaisa)}</div><div className="text-[11px] text-white/70">revenue</div></div>
              <div><div className="font-display text-[20px]">{roi(best).toFixed(1)}×</div><div className="text-[11px] text-white/70">ROI</div></div>
              <div><div className="font-display text-[20px]">{best.newCustomers}</div><div className="text-[11px] text-white/70">new cust.</div></div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5"><Chip icon="bolt" c="#cf43ea" /><div className="font-display text-[16px] text-purple">Redemptions over time</div></div>
            <div className="text-[13px] text-body-soft">last 12 weeks · <span className="text-[#0f7d55] font-semibold">▲ trending up</span></div>
          </div>
          <TrendArea />
        </div>
      </div>

      {/* ROI + type mix + acquisition */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="cash" c="#12a172" /><div><div className="font-display text-[16px] text-purple leading-tight">ROI by offer</div><div className="text-[13px] text-body-soft">revenue ÷ discount</div></div></div>
          <div className="flex flex-col gap-2.5">
            {byRoi.map((r, i) => (
              <div key={i}>
                <div className="flex justify-between text-[12px] mb-1"><span className="text-body truncate pr-2">{r.name}</span><span className="font-semibold" style={{ color: roi(r) >= 8 ? GREEN : roi(r) >= 3 ? INK : AMBER }}>{roi(r).toFixed(1)}×</span></div>
                <div className="h-[10px] bg-lavender rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(roi(r) / Math.max(...byRoi.map(roi))) * 100}%`, background: roi(r) >= 8 ? "linear-gradient(90deg,#12a172,#3fce9a)" : roi(r) >= 3 ? "linear-gradient(90deg,#470066,#cf43ea)" : "linear-gradient(90deg,#d98a0f,#f0b95a)" }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="grid" c="#3182c9" /><div><div className="font-display text-[16px] text-purple leading-tight">Offer-type mix</div><div className="text-[13px] text-body-soft">share by family</div></div></div>
          <Bars rows={TYPE_MIX.map((m, i) => ({ label: m.family, value: m.count, right: Math.round((m.count / mixTotal) * 100) + "%", color: MIX[i % MIX.length] }))} />
        </div>

        <div className="rounded-[18px] p-5 shadow-soft border border-[#bfe6d1]" style={{ background: "linear-gradient(160deg,#eafaf2,#ffffff 70%)" }}>
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="user" c="#12a172" /><div><div className="font-display text-[16px] text-purple leading-tight">Acquisition</div><div className="text-[13px] text-body-soft">new customers · 30d</div></div></div>
          <div className="font-display text-[38px] text-[#0f9d6b] leading-none">{newCust}</div>
          <div className="mt-3 pt-3 border-t border-[#cdeede] text-[13px] text-body">
            <div className="flex justify-between py-1"><span className="text-body-soft">First-order coupon</span><span className="font-semibold text-purple">39</span></div>
            <div className="flex justify-between py-1"><span className="text-body-soft">Referral</span><span className="font-semibold text-purple">88</span></div>
            <div className="flex justify-between py-1"><span className="text-body-soft">Repeat from offer users</span><span className="font-semibold text-[#0f9d6b]">{OVERVIEW.repeatRatePct}%</span></div>
          </div>
        </div>
      </div>

      {/* channel + occasion + auto vs coupon */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="bag" c="#8b3fb0" /><div><div className="font-display text-[16px] text-purple leading-tight">By channel</div><div className="text-[13px] text-body-soft">offer revenue per channel</div></div></div>
          <Bars rows={CHANNEL_PERF.map((c, i) => ({ label: c.name, value: c.revenuePaisa, right: takaShort(c.revenuePaisa), color: MIX[i % MIX.length] }))} />
        </div>

        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="heart" c="#d64fa0" /><div><div className="font-display text-[16px] text-purple leading-tight">By occasion</div><div className="text-[13px] text-body-soft">offer-driven revenue</div></div></div>
          <Bars rows={OCCASION_PERF.map((o, i) => ({ label: o.name, value: o.revenuePaisa, right: takaShort(o.revenuePaisa), color: MIX[(i + 3) % MIX.length] }))} />
        </div>

        <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft">
          <div className="flex items-center gap-2.5 mb-3"><Chip icon="layers" c="#c07a2b" /><div><div className="font-display text-[16px] text-purple leading-tight">Automatic vs Coupon</div><div className="text-[13px] text-body-soft">revenue split</div></div></div>
          <div className="flex h-[14px] rounded-full overflow-hidden mb-4 mt-1">
            <div style={{ width: autoPct + "%", background: "linear-gradient(90deg,#470066,#8b3fb0)" }} />
            <div style={{ width: 100 - autoPct + "%", background: "linear-gradient(90deg,#cf43ea,#e75a9c)" }} />
          </div>
          <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="flex items-center gap-2 text-body"><span className="w-2.5 h-2.5 rounded-full bg-purple" />Automatic</span><span className="font-semibold text-purple">{takaShort(AUTO_VS_COUPON.automaticPaisa)} · {autoPct}%</span></div>
          <div className="flex items-center justify-between py-1.5 text-[13px]"><span className="flex items-center gap-2 text-body"><span className="w-2.5 h-2.5 rounded-full bg-orchid" />Coupon</span><span className="font-semibold text-purple">{takaShort(AUTO_VS_COUPON.couponPaisa)} · {100 - autoPct}%</span></div>
          <div className="mt-3 pt-3 border-t border-lavender-deep text-[13px] text-body-soft">Automatic offers pull most revenue — no code friction at checkout.</div>
        </div>
      </div>

      {/* margin watch */}
      <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft mb-4">
        <div className="flex items-center gap-2.5 mb-3"><Chip icon="bolt" c="#d98a0f" /><div><div className="font-display text-[16px] text-purple leading-tight">Margin watch</div><div className="text-[13px] text-body-soft">offers running thin or below cost — perishable allows it, but keep it visible</div></div></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {watch.map((r, i) => {
            const t = toneMeta(r.marginTone);
            return (
              <div key={i} className={`flex items-center gap-3 border rounded-[12px] px-3 py-2.5 ${t.cardBg} ${t.ring}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.c }} />
                <div className="flex-1 min-w-0"><div className="text-[13px] font-medium text-purple truncate">{r.name}</div><div className="text-[13px] text-body-soft">discount {taka(r.discountPaisa)} · {r.redemptions} used</div></div>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${t.bg} ${t.tx}`}>{t.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* leaderboard */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-lavender-deep">
          <div className="flex items-center gap-2.5"><Chip icon="star" c="#b76e79" /><div className="font-display text-[16px] text-purple">Offer leaderboard</div></div>
          <Link href="/marketing/offers/list" className="text-[12.5px] font-semibold text-orchid">All offers →</Link>
        </div>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-5 py-2.5">Offer</th>
              {([["redemptions", "Redeemed"], ["revenuePaisa", "Revenue"], ["discountPaisa", "Discount"], ["roi", "ROI"], ["newCustomers", "New cust."]] as const).map(([k, l]) => (
                <th key={k} onClick={() => { setSortDir(sortKey === k ? -sortDir : -1); setSortKey(k); }} className="text-left font-medium px-4 py-2.5 cursor-pointer select-none hover:text-purple">{l}{sortKey === k ? (sortDir < 0 ? " ▼" : " ▲") : ""}</th>
              ))}
              <th className="text-left font-medium px-4 py-2.5">Margin</th>
            </tr>
          </thead>
          <tbody>
            {sortedBoard.map((r, i) => {
              const t = toneMeta(r.marginTone);
              return (
                <tr key={r.id} className="border-t border-lavender-deep hover:bg-lavender/50">
                  <td className="px-5 py-3"><Link href={`/marketing/offers/perf/${r.id}`} className="font-medium text-purple hover:text-orchid flex items-center gap-2"><span className="w-1.5 h-6 rounded-full" style={{ background: MIX[i % MIX.length] }} />{r.name}</Link><div className="text-[13px] text-body-soft ml-3.5">{SHAPE_LABEL[r.shape]}</div></td>
                  <td className="px-4 py-3">{r.redemptions}</td>
                  <td className="px-4 py-3 font-mono text-purple">{taka(r.revenuePaisa)}</td>
                  <td className="px-4 py-3 font-mono text-body-soft">{taka(r.discountPaisa)}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: roi(r) >= 8 ? GREEN : roi(r) >= 3 ? INK : AMBER }}>{roi(r).toFixed(1)}×</td>
                  <td className="px-4 py-3">{r.newCustomers}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-1 rounded-full ${t.bg} ${t.tx}`}>{t.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-body-soft text-[12px] mt-3.5">Mock analytics. Real figures read from Sales Order completed events + Customer (new/repeat derived) — this module stores no order/customer facts (One Data One Owner).</p>
    </div>
  );
}

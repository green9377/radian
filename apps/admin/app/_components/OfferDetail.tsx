"use client";

import Link from "next/link";
import Icon from "./Icon";
import { LEADERBOARD, OFFERS, REDEEMERS, REDEMPTION_TREND, SHAPE_LABEL, roi, taka, takaShort } from "../_data/offers";

/* Offers & Promotions · per-offer detail / analytics (MOCK, §9). Route: /offers/perf/[id]. */

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1100px]";
const INK = "#470066", ORCHID = "#cf43ea";

function Area({ scale }: { scale: number }) {
  const d = REDEMPTION_TREND.map((p) => ({ ...p, value: Math.max(1, Math.round(p.value * scale)) }));
  const W = 640, H = 150, P = 16;
  const max = Math.max(...d.map((p) => p.value)) * 1.15;
  const x = (i: number) => P + (i * (W - 2 * P)) / (d.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = d.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(d.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="none">
      <defs><linearGradient id="odA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORCHID} stopOpacity="0.3" /><stop offset="100%" stopColor={ORCHID} stopOpacity="0.02" /></linearGradient></defs>
      {[0.33, 0.66].map((g) => (<line key={g} x1={P} x2={W - P} y1={P + g * (H - 2 * P)} y2={P + g * (H - 2 * P)} stroke="#efe4f7" strokeWidth="1" />))}
      <path d={area} fill="url(#odA)" /><path d={line} fill="none" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {d.map((p, i) => (<circle key={i} cx={x(i)} cy={y(p.value)} r={i === d.length - 1 ? 4 : 2.4} fill="#fff" stroke={INK} strokeWidth="2" />))}
    </svg>
  );
}

export default function OfferDetail({ id }: { id: string }) {
  const row = LEADERBOARD.find((r) => r.id === id);
  const offer = OFFERS.find((o) => o.id === id);
  if (!row) {
    return (
      <div className={WRAP}>
        <Link href="/marketing/offers" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-body-soft hover:text-purple mb-3"><Icon name="chevronLeft" size={16} /> Overview</Link>
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-8 text-center text-body-soft">No analytics for this offer yet.</div>
      </div>
    );
  }
  const scale = row.redemptions / 71;
  const KPIS = [
    { l: "Redemptions", v: String(row.redemptions), c: "#7a2ea8" },
    { l: "Revenue influenced", v: takaShort(row.revenuePaisa), c: "#12a172" },
    { l: "Discount cost", v: takaShort(row.discountPaisa), c: "#d98a0f" },
    { l: "ROI", v: roi(row).toFixed(1) + "×", c: "#c01fd8" },
    { l: "New customers", v: String(row.newCustomers), c: "#2f6fb0" },
    { l: "Avg order", v: takaShort(Math.round(row.revenuePaisa / row.redemptions)), c: "#b76e79" },
  ];

  return (
    <div className={WRAP}>
      <Link href="/marketing/offers" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-body-soft hover:text-purple mb-3"><Icon name="chevronLeft" size={16} /> Overview</Link>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offer performance</div>
          <h1 className="font-display text-[26px] text-purple mt-1.5 mb-1 leading-tight">{row.name}</h1>
          <div className="text-[13px] text-body-soft">{SHAPE_LABEL[row.shape]} · 30-day performance {offer ? `· ${offer.status}` : ""}</div>
        </div>
        {offer && <Link href={`/marketing/offers/${offer.id}`} className="bg-white border-[1.5px] border-lavender-deep text-purple text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2"><Icon name="edit" size={16} /> Edit offer</Link>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {KPIS.map((k, i) => (<div key={i} className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft"><div className="text-[22px] font-medium font-display leading-none" style={{ color: k.c }}>{k.v}</div><div className="text-[13px] text-body-soft mt-1.5">{k.l}</div></div>))}
      </div>

      <div className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft mb-4">
        <div className="font-display text-[16px] text-purple mb-1">Redemptions over time</div>
        <div className="text-[13px] text-body-soft mb-2">last 12 weeks · this offer</div>
        <Area scale={scale} />
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="px-5 py-3.5 border-b border-lavender-deep font-display text-[16px] text-purple">Recent redemptions</div>
        <table className="w-full border-collapse text-[13.5px]">
          <thead><tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60"><th className="text-left font-medium px-5 py-2.5">Customer</th><th className="text-left font-medium px-4 py-2.5">Phone</th><th className="text-left font-medium px-4 py-2.5">When</th><th className="text-left font-medium px-4 py-2.5">Order value</th></tr></thead>
          <tbody>
            {REDEEMERS.map((r, i) => (<tr key={i} className="border-t border-lavender-deep hover:bg-lavender/50"><td className="px-5 py-3 font-medium text-purple">{r.name}</td><td className="px-4 py-3 font-mono text-body-soft text-[12.5px]">{r.phone}</td><td className="px-4 py-3 text-body-soft">{r.when}</td><td className="px-4 py-3 font-mono text-purple">{taka(r.amountPaisa)}</td></tr>))}
          </tbody>
        </table>
      </div>
      <p className="text-body-soft text-[12px] mt-3.5">Mock analytics — real figures read from Sales Order completed events (One Data One Owner).</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Icon from "./Icon";
import { COUPON_CODES, type CouponRow } from "../_data/offers";

/* Offers & Promotions · Coupons (MOCK, §9) — interactive code-centric slice. */

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const KIND: Record<string, { label: string; cls: string }> = {
  public: { label: "Public", cls: "bg-orchid-soft text-[#a021b8]" },
  unique: { label: "Unique / single-use", cls: "bg-[#e8f0fb] text-[#1e5aa8]" },
  affiliate: { label: "Affiliate", cls: "bg-[#fff4e2] text-[#b45309]" },
  referral: { label: "Referral", cls: "bg-[#e8f6ef] text-[#0f7d55]" },
};
const OFFER_OPTS = ["Welcome — First Order", "Anniversary Roses Week", "Spend & Save", "New offer…"];

export default function OffersCoupons() {
  const [codes, setCodes] = useState<CouponRow[]>(COUPON_CODES);
  const [q, setQ] = useState("");
  const [prefix, setPrefix] = useState("VIP-");
  const [count, setCount] = useState("500");
  const [offer, setOffer] = useState(OFFER_OPTS[0]);
  const [flash, setFlash] = useState("");

  const rows = codes.filter((c) => !q || c.code.toLowerCase().includes(q.toLowerCase()) || c.offer.toLowerCase().includes(q.toLowerCase()));
  const issued = codes.reduce((s, c) => s + c.issued, 0);
  const redeemed = codes.reduce((s, c) => s + c.redeemed, 0);
  const rate = issued ? Math.round((redeemed / issued) * 100) : 0;

  const generate = () => {
    const n = Number(count) || 0;
    const code = `${prefix || "CODE-"}${String(codes.length + 1).padStart(4, "0")}`;
    setCodes([{ code, offer, kind: "unique", issued: n, redeemed: 0, status: "active" }, ...codes]);
    setFlash(`Generated ${n.toLocaleString("en-IN")} unique codes under “${code}” → ${offer}.`);
  };

  return (
    <div className={WRAP}>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offers & Promotions · coupons</div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Coupons</h1>
        <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Code-centric view of the Offer engine — public codes, bulk unique single-use, affiliate &amp; referral codes, with usage and leakage. A coupon is an Offer with mechanism = coupon.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        {[{ n: String(codes.length), l: "Code sets" }, { n: issued.toLocaleString("en-IN"), l: "Codes issued" }, { n: redeemed.toLocaleString("en-IN"), l: "Redeemed" }, { n: rate + "%", l: "Redemption rate" }].map((s, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft"><div className="text-[24px] font-medium font-display text-purple leading-none">{s.n}</div><div className="text-[13px] text-body-soft mt-1.5">{s.l}</div></div>
        ))}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[320px] w-full"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={18} /></span><input className="ipt ipt-icon h-[44px]" placeholder="Search code or offer…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q && <button onClick={() => setQ("")} className="text-[12.5px] font-medium text-orchid hover:text-purple">Clear</button>}
        <span className="text-[13px] text-body-soft ml-auto">{rows.length} set{rows.length === 1 ? "" : "s"}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <table className="w-full border-collapse text-[13.5px]">
            <thead><tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60"><th className="text-left font-medium px-4 py-3">Code</th><th className="text-left font-medium px-4 py-3">Offer</th><th className="text-left font-medium px-4 py-3">Kind</th><th className="text-left font-medium px-4 py-3">Issued</th><th className="text-left font-medium px-4 py-3">Redeemed</th><th className="text-left font-medium px-4 py-3">Status</th></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i} className="border-t border-lavender-deep hover:bg-lavender/50">
                  <td className="px-4 py-3"><span className="font-mono font-bold text-purple bg-lavender border border-dashed border-orchid-mid rounded-[7px] px-2 py-0.5 text-[12px]">{c.code}</span></td>
                  <td className="px-4 py-3 text-purple">{c.offer}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-1 rounded-full ${KIND[c.kind].cls}`}>{KIND[c.kind].label}</span></td>
                  <td className="px-4 py-3">{c.issued.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{c.redeemed.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-1 rounded-full ${c.status === "active" ? "bg-[#e8f6ef] text-[#0f7d55]" : c.status === "scheduled" ? "bg-[#fff4e2] text-[#b45309]" : "bg-[#f0edf4] text-body-soft"}`}>{c.status}</span></td>
                </tr>
              ))}
              {rows.length === 0 && (<tr><td colSpan={6} className="text-center text-body-soft py-12 border-t border-lavender-deep">No codes match “{q}”. <button onClick={() => setQ("")} className="text-orchid font-medium">Clear</button></td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5">
          <div className="font-display text-[16px] text-purple mb-1">Bulk generate</div>
          <p className="text-[13px] text-body-soft mb-4">Create a batch of unique single-use codes for a campaign, affiliate, or gift drop.</p>
          <div className="flex flex-col gap-3">
            <div><span className="block text-[11px] font-semibold uppercase text-body-soft mb-1.5">Prefix</span><input className="ipt font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></div>
            <div><span className="block text-[11px] font-semibold uppercase text-body-soft mb-1.5">How many</span><input className="ipt" value={count} onChange={(e) => setCount(e.target.value)} /></div>
            <div><span className="block text-[11px] font-semibold uppercase text-body-soft mb-1.5">Link to offer</span><select className="ipt" value={offer} onChange={(e) => setOffer(e.target.value)}>{OFFER_OPTS.map((o) => (<option key={o}>{o}</option>))}</select></div>
            <button onClick={generate} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-4 py-2.5 rounded-[12px] inline-flex items-center justify-center gap-2 mt-1 transition-colors"><Icon name="hash" size={17} /> Generate codes</button>
            {flash && <div className="text-[12px] text-[#0f7d55] font-medium flex items-center gap-1.5"><Icon name="check" size={14} /> {flash}</div>}
          </div>
          <div className="mt-4 pt-4 border-t border-lavender-deep flex gap-2.5 text-[12px] text-[#7a4b09] bg-[#fff8ec] -mx-5 -mb-5 px-5 py-3 rounded-b-[16px]"><span className="text-[#b45309] shrink-0"><Icon name="shield" size={16} /></span><div><b>Leakage guard:</b> unique codes are single-use; public codes flagged if redeemed far above expected.</div></div>
        </div>
      </div>
    </div>
  );
}

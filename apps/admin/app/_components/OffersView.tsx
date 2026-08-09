"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import CommaListInput from "./CommaListInput";
import { OFFERS, SHAPE_LABEL, FESTIVALS, TEMPLATES, MOCK_PRODUCTS, PICK_PRODUCTS, PICK_CATEGORIES, taka, type Offer, type Shape } from "../_data/offers";

/*
  Offers & Promotions — admin UI (MOCK, §9). Fully interactive client mock:
  every control acts on in-memory state (nothing persists to a backend yet).
  ⇄ SWAP HERE: wire to :4000 /offers in the unified schema pass.
*/

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1500px]"; // 6 Aug — widened, see FinanceUI.WRAP note

const BLANK: Offer = {
  id: "new", name: "", internalNote: "", mechanism: "automatic", shape: "category", status: "draft",
  benefitText: "", eligibility: [], scheduleText: "Ongoing", scheduleTone: "on", priority: 50, live: false,
  publicTitle: "New offer", benefitLine: "", description: "", discountType: "Percent %", discountValue: "",
  maxDiscountText: "", bonusLines: [], guaranteeText: "", combinable: false, scarcity: false,
};

const SHAPES: { label: string; val: Shape }[] = [
  { label: "Category", val: "category" }, { label: "Sitewide", val: "sitewide" }, { label: "Product", val: "product" },
  { label: "Bundle", val: "bundle" }, { label: "Tiered", val: "tiered" }, { label: "Free gift", val: "free_gift" },
  { label: "BOGO", val: "bogo" }, { label: "Payment method", val: "payment" }, { label: "Free delivery", val: "free_delivery" },
  { label: "First order", val: "first_order" }, { label: "Corporate", val: "corporate" },
];

function cloneOffer(o: Offer): Offer {
  return {
    ...o,
    eligibility: [...o.eligibility],
    bonusLines: [...o.bonusLines],
    bundleItems: o.bundleItems ? o.bundleItems.map((b) => ({ ...b })) : undefined,
    tiers: o.tiers ? o.tiers.map((t) => ({ ...t })) : undefined,
    giftItem: o.giftItem ? { ...o.giftItem } : undefined,
  };
}

/* ---------- atoms ---------- */
function Toggle({ on }: { on?: boolean }) {
  const [v, setV] = useState(!!on);
  return (
    <button type="button" onClick={() => setV(!v)} className={`w-[38px] h-[22px] rounded-full relative transition-colors ${v ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}>
      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${v ? "left-[18px]" : "left-[2px]"}`} />
    </button>
  );
}
function CToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`w-[38px] h-[22px] rounded-full relative transition-colors ${on ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}>
      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-[2px]"}`} />
    </button>
  );
}
function Guide({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold tracking-[0.03em] uppercase text-body-soft mb-1.5">{children}</span>;
}
function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
        <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />{eyebrow}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
      {children && <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">{children}</p>}
    </div>
  );
}

/* ================= OFFERS LIST ================= */
export function OffersList() {
  const [q, setQ] = useState("");
  const [mech, setMech] = useState("");
  const [status, setStatus] = useState("");
  const [list, setList] = useState<Offer[]>(OFFERS);

  const dup = (c: Offer) => setList((l) => [{ ...c, id: `${c.id}_copy${l.length}`, name: `${c.name} (copy)`, status: "draft", live: false, redeemed: 0 }, ...l]);
  const togglePause = (c: Offer) => setList((l) => l.map((x) => (x.id === c.id ? { ...x, status: x.status === "active" ? "paused" : "active", live: x.status !== "active" } : x)));

  const rows = list.filter((c) => {
    const okQ = !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.code ?? "").toLowerCase().includes(q.toLowerCase());
    return okQ && (!mech || c.mechanism === mech) && (!status || c.status === status);
  });
  const active = list.filter((c) => c.status === "active").length;
  const scheduled = list.filter((c) => c.status === "scheduled").length;
  const coupons = list.filter((c) => c.mechanism === "coupon" && c.live).length;
  const redeemed = list.reduce((s, c) => s + (c.redeemed ?? 0), 0);

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <PageHead eyebrow="Offers & Promotions · engine" title="All Offers">One engine for every offer shape — discounts, coupons, bundles, tiered, free-gift, cashback, free delivery, first-order, festival. Type is a config, not a separate screen.</PageHead>
        <Link href="/marketing/offers/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="plus" size={18} /> New Offer</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[{ n: String(active), l: "Active offers" }, { n: String(scheduled), l: "Scheduled" }, { n: String(coupons), l: "Coupons live" }, { n: String(redeemed), l: "Redemptions · 30d" }, { n: "৳ 1,64,200", l: "Discount given · 30d" }].map((s, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft"><div className="text-[24px] font-medium font-display text-purple leading-none">{s.n}</div><div className="text-[13px] text-body-soft mt-1.5">{s.l}</div></div>
        ))}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[320px] w-full"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={18} /></span><input className="ipt pl-10 h-[44px]" placeholder="Search offer or code…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="ipt max-w-[160px] h-[44px]" value={mech} onChange={(e) => setMech(e.target.value)}><option value="">All types</option><option value="automatic">Automatic</option><option value="coupon">Coupon</option></select>
        <select className="ipt max-w-[150px] h-[44px]" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All status</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="draft">Draft</option></select>
        {(q || mech || status) && <button onClick={() => { setQ(""); setMech(""); setStatus(""); }} className="text-[12.5px] font-medium text-orchid hover:text-purple">Clear</button>}
        <span className="text-[13px] text-body-soft ml-auto">{rows.length} offer{rows.length === 1 ? "" : "s"}</span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead><tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
            <th className="text-left font-medium px-4 py-3">Offer</th><th className="text-left font-medium px-4 py-3">Type</th><th className="text-left font-medium px-4 py-3">Benefit</th><th className="text-left font-medium px-4 py-3">Code</th><th className="text-left font-medium px-4 py-3">Eligibility</th><th className="text-left font-medium px-4 py-3">Schedule</th><th className="text-left font-medium px-4 py-3">Prio</th><th className="text-left font-medium px-4 py-3">Redeemed</th><th className="text-left font-medium px-4 py-3">Live</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={`hover:bg-lavender/70 border-t border-lavender-deep transition-colors ${c.status === "draft" ? "opacity-60" : ""}`}>
                <td className="px-4 py-3 align-top"><div className="font-medium text-purple leading-snug">{c.name}</div><div className="text-body-soft text-[11.5px]">{c.internalNote}</div></td>
                <td className="px-4 py-3 align-top"><span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.mechanism === "automatic" ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-orchid-soft text-[#a021b8]"}`}>{c.mechanism === "automatic" ? "Automatic" : "Coupon"}</span><span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-lavender text-purple ml-1.5">{SHAPE_LABEL[c.shape]}</span></td>
                <td className="px-4 py-3 align-top">{c.benefitText} {c.wasText && <span className="line-through text-body-soft text-[12px]">{c.wasText}</span>}</td>
                <td className="px-4 py-3 align-top">{c.code ? <span className="font-mono font-bold text-purple bg-lavender border border-dashed border-orchid-mid rounded-[7px] px-2 py-0.5 text-[12px]">{c.code}</span> : "—"}</td>
                <td className="px-4 py-3 align-top"><div className="flex gap-1 flex-wrap">{c.eligibility.map((e, i) => (<span key={i} className="text-[11px] bg-lavender text-body px-2 py-0.5 rounded-[6px]">{e}</span>))}</div></td>
                <td className="px-4 py-3 align-top"><span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${c.scheduleTone === "on" ? "bg-[#e8f6ef] text-[#0f7d55]" : c.scheduleTone === "sched" ? "bg-[#fff4e2] text-[#b45309]" : "bg-[#f0edf4] text-body-soft"}`}>{c.scheduleText}</span></td>
                <td className="px-4 py-3 align-top">{c.priority}</td>
                <td className="px-4 py-3 align-top">{c.redeemed ?? "—"}</td>
                <td className="px-4 py-3 align-top"><Toggle on={c.live} /></td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => togglePause(c)} title={c.status === "active" ? "Pause" : "Activate"} className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep hover:border-orchid text-body-soft hover:text-purple inline-flex items-center justify-center transition-colors">{c.status === "active" ? <Icon name="clock" size={15} /> : <Icon name="check" size={15} />}</button>
                    <button onClick={() => dup(c)} title="Duplicate" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep hover:border-orchid text-body-soft hover:text-purple inline-flex items-center justify-center transition-colors"><Icon name="copy" size={15} /></button>
                    <Link href={`/marketing/offers/${c.id}`} className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft h-[34px] px-3 rounded-[10px] inline-flex items-center gap-1.5 transition-colors text-[13px] font-medium"><Icon name="edit" size={15} /> Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td colSpan={10} className="text-center text-body-soft py-12 border-t border-lavender-deep">No offers match your filters. <button onClick={() => { setQ(""); setMech(""); setStatus(""); }} className="text-orchid font-medium">Clear filters</button></td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-body-soft text-[12px] mt-3.5">Mock data (<span className="font-mono">_data/offers.ts</span>). Coupon redemption is a referenced event on the Sales Order. All money = paisa · soft-delete + audit.</p>
    </div>
  );
}

/* ================= OFFER EDITOR (fully interactive mock) ================= */
const SECTIONS = [
  { key: "basics", label: "Basics", icon: "sparkle" }, { key: "type", label: "Mechanism & Type", icon: "layers" },
  { key: "setup", label: "Offer setup", icon: "box" }, { key: "benefit", label: "Benefit & Value", icon: "tag" },
  { key: "elig", label: "Eligibility", icon: "shield" }, { key: "code", label: "Coupon Code", icon: "hash" },
  { key: "sched", label: "Schedule", icon: "clock" }, { key: "scar", label: "Scarcity", icon: "bolt" },
  { key: "stack", label: "Stacking & Priority", icon: "grid" }, { key: "copy", label: "Storefront Copy", icon: "book" },
];

export function OfferEditor({ id }: { id: string }) {
  const isTpl = id.startsWith("tpl-");
  const isNew = id === "new" || isTpl;
  const seedBase: Offer = isTpl
    ? { ...BLANK, ...(TEMPLATES.find((t) => t.key === id.slice(4))?.seed ?? {}) }
    : cloneOffer(OFFERS.find((o) => o.id === id) ?? BLANK);

  const [form, setForm] = useState<Offer>(() => cloneOffer(seedBase));
  const [misc, setMisc] = useState({
    ownerTeam: "Marketing", totalLimit: "500", perCustomerLimit: "1", minOrder: "0",
    channel: "Website", zone: "All zones", segment: "Everyone", giftSelf: "Both",
    scarcityLabel: "Only {n} claimed today", recurring: false,
    startsAt: "12 Jul 2026, 00:00", endsAt: isNew ? "" : "18 Jul 2026, 23:59",
    targets: ["Roses category"] as string[],
    bogoBuy: "2", bogoGet: "1", payMethods: ["bKash"] as string[], cashbackPct: "5",
    fdThreshold: "2000", fdZone: "All zones", corpMinUnits: "10", corpRate: "15",
    pickerOpen: false, pickerTab: "product" as "product" | "category", pickerQ: "",
  });
  const [sec, setSec] = useState("basics");
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<Offer>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };
  const m = (patch: Partial<typeof misc>) => { setMisc((x) => ({ ...x, ...patch })); setSaved(false); };

  const Block = ({ show, children }: { show: boolean; children: React.ReactNode }) =>
    show ? <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">{children}</div> : null;

  const bundleItems = form.bundleItems ?? [];
  const bundleSum = bundleItems.reduce((s, b) => s + b.pricePaisa, 0);
  const tiers = form.tiers ?? [];

  const addProduct = () => set({ bundleItems: [...bundleItems, { ...MOCK_PRODUCTS[bundleItems.length % MOCK_PRODUCTS.length] }] });
  const rmProduct = (i: number) => set({ bundleItems: bundleItems.filter((_, j) => j !== i) });
  const addTier = () => set({ tiers: [...tiers, { minSpendPaisa: 100000, benefit: "5% off" }] });
  const setTier = (i: number, patch: Partial<{ minSpendPaisa: number; benefit: string }>) => set({ tiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const rmTier = (i: number) => set({ tiers: tiers.filter((_, j) => j !== i) });
  const addBonus = () => set({ bonusLines: [...form.bonusLines, "New bonus"] });
  const rmBonus = (i: number) => set({ bonusLines: form.bonusLines.filter((_, j) => j !== i) });

  return (
    <div className={WRAP}>
      <Link href="/marketing/offers/list" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-body-soft hover:text-purple mb-3"><Icon name="chevronLeft" size={16} /> All Offers</Link>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Unified engine · one builder, every offer shape</div>
        <h1 className="font-display text-[26px] text-purple mt-1.5 mb-1 leading-tight">{isNew ? (form.name ? `New offer — ${form.name}` : "New offer") : `Edit offer — “${form.name}”`}</h1>
        <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Pick a shape in “Mechanism &amp; Type” → its builder appears under “Offer setup”. Everything updates the live preview →</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr_340px] gap-4 items-start">
        <nav className="bg-white border border-lavender-deep rounded-[18px] shadow-soft p-2 lg:sticky lg:top-4">
          {SECTIONS.map((s) => {
            const on = sec === s.key;
            return (<button key={s.key} onClick={() => setSec(s.key)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-colors ${on ? "bg-lavender text-purple" : "text-body hover:bg-lavender/60"}`}><span className={on ? "text-orchid" : "text-body-soft"}><Icon name={s.icon} size={17} /></span>{s.label}</button>);
          })}
        </nav>

        <div className="flex flex-col gap-4 min-w-0">
          <Block show={sec === "basics"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Basics</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">Internal identity — customers never see the internal name.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Internal name</Guide><input className="ipt" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Anniversary Roses Week" /></div>
              <div><Guide>Owner team</Guide><select className="ipt" value={misc.ownerTeam} onChange={(e) => m({ ownerTeam: e.target.value })}><option>Marketing</option><option>Sales</option><option>Corporate</option></select></div>
            </div>
            <div className="mt-3.5"><Guide>Internal note</Guide><input className="ipt" value={form.internalNote} onChange={(e) => set({ internalNote: e.target.value })} /></div>
          </Block>

          <Block show={sec === "type"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Mechanism &amp; Type</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">Mechanism = how it triggers. Shape = what it does. Click to change — the builder &amp; preview follow.</p>
            <Guide>Mechanism</Guide>
            <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1 mb-4">
              {[{ l: "Automatic (auto-applies)", v: "automatic" as const }, { l: "Coupon (needs code)", v: "coupon" as const }].map((mm) => (
                <button key={mm.v} onClick={() => set({ mechanism: mm.v })} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${form.mechanism === mm.v ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{mm.l}</button>
              ))}
            </div>
            <Guide>Offer shape</Guide>
            <div className="flex flex-wrap bg-lavender rounded-[11px] p-1 gap-1">
              {SHAPES.map((sh) => (<button key={sh.val} onClick={() => set({ shape: sh.val })} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${form.shape === sh.val ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{sh.label}</button>))}
            </div>
          </Block>

          <Block show={sec === "setup"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Offer setup — {SHAPE_LABEL[form.shape]}</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">The builder for this shape. Change shape in “Mechanism &amp; Type” to switch builder.</p>

            {form.shape === "bundle" && (
              <div>
                <Guide>Bundle products</Guide>
                <div className="flex flex-col gap-2">
                  {bundleItems.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[12px] p-2">
                      <img src={b.image} alt="" className="w-[42px] h-[42px] rounded-[8px] object-cover" />
                      <div className="flex-1"><div className="font-medium text-purple text-[13.5px]">{b.name}</div><div className="text-body-soft text-[11.5px]">{taka(b.pricePaisa)}</div></div>
                      <button onClick={() => rmProduct(i)} className="text-body-soft hover:text-[#c0392b] font-bold px-2">×</button>
                    </div>
                  ))}
                  {bundleItems.length === 0 && <div className="text-[13px] text-body-soft">No products yet — add a few.</div>}
                  <button onClick={addProduct} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[12px] px-3 py-2.5 text-[13px] text-body-soft hover:text-purple w-fit"><Icon name="plus" size={15} /> <span className="ml-1">Add product</span></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 items-end">
                  <div><Guide>Items total</Guide><div className="ipt bg-lavender/40 flex items-center">{taka(bundleSum)}</div></div>
                  <div><Guide>Combo price (৳)</Guide><input className="ipt" value={form.comboPricePaisa ? String(Math.round(form.comboPricePaisa / 100)) : ""} onChange={(e) => set({ comboPricePaisa: (Number(e.target.value) || 0) * 100 })} /></div>
                  <div><Guide>Customer saves</Guide><div className="ipt bg-[#e8f6ef] text-[#0f7d55] font-semibold flex items-center">{form.comboPricePaisa ? taka(Math.max(0, bundleSum - form.comboPricePaisa)) : "—"}</div></div>
                </div>
              </div>
            )}

            {form.shape === "tiered" && (
              <div>
                <Guide>Spend-more-save-more tiers</Guide>
                <div className="grid grid-cols-[1fr_1fr_34px] gap-2 text-[11px] font-semibold uppercase text-body-soft mb-1 px-1"><span>Min spend (৳)</span><span>Benefit</span><span /></div>
                {tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_34px] gap-2 items-center mb-2">
                    <input className="ipt" value={String(Math.round(t.minSpendPaisa / 100))} onChange={(e) => setTier(i, { minSpendPaisa: (Number(e.target.value) || 0) * 100 })} />
                    <input className="ipt" value={t.benefit} onChange={(e) => setTier(i, { benefit: e.target.value })} />
                    <button onClick={() => rmTier(i)} className="text-body-soft hover:text-[#c0392b] font-bold text-center">×</button>
                  </div>
                ))}
                {tiers.length === 0 && <div className="text-[13px] text-body-soft mb-2">No tiers yet.</div>}
                <button onClick={addTier} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[12px] px-3 py-2.5 text-[13px] text-body-soft hover:text-purple w-fit"><Icon name="plus" size={15} /> <span className="ml-1">Add tier</span></button>
                <p className="text-[13px] text-body-soft mt-3">Checkout applies the highest tier the cart qualifies for — automatically.</p>
              </div>
            )}

            {form.shape === "free_gift" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Guide>Unlock threshold (cart ≥ ৳)</Guide><input className="ipt" value={form.giftThresholdPaisa ? String(Math.round(form.giftThresholdPaisa / 100)) : ""} onChange={(e) => set({ giftThresholdPaisa: (Number(e.target.value) || 0) * 100 })} /></div>
                <div>
                  <Guide>Free gift product</Guide>
                  {form.giftItem ? (
                    <div className="flex items-center gap-3 bg-white border border-lavender-deep rounded-[12px] p-2"><img src={form.giftItem.image} alt="" className="w-[42px] h-[42px] rounded-[8px] object-cover" /><div className="flex-1 font-medium text-purple text-[13.5px]">{form.giftItem.name}</div><button onClick={() => set({ giftItem: undefined })} className="text-body-soft hover:text-[#c0392b] font-bold px-2">×</button></div>
                  ) : (
                    <button onClick={() => set({ giftItem: { name: "Chocolate Box (৳450)", image: MOCK_PRODUCTS[2].image } })} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[12px] px-3 py-2.5 text-[13px] text-body-soft hover:text-purple"><Icon name="plus" size={15} /> <span className="ml-1">Pick gift</span></button>
                  )}
                </div>
                <p className="text-[13px] text-body-soft md:col-span-2">Gift auto-adds at ৳0 when the cart crosses the threshold. Stock guarded by Inventory.</p>
              </div>
            )}

            {form.shape === "bogo" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Guide>Buy quantity</Guide><input className="ipt" value={misc.bogoBuy} onChange={(e) => m({ bogoBuy: e.target.value })} /></div>
                <div><Guide>Get free quantity</Guide><input className="ipt" value={misc.bogoGet} onChange={(e) => m({ bogoGet: e.target.value })} /></div>
                <p className="text-[13px] text-body-soft md:col-span-2">Add {misc.bogoBuy}+{misc.bogoGet} to cart → cheapest {misc.bogoGet} free. Applies within the target category/product.</p>
              </div>
            )}
            {form.shape === "payment" && (
              <div>
                <Guide>Eligible payment methods</Guide>
                <div className="flex gap-2 flex-wrap mb-3">
                  {["bKash", "Nagad", "Card", "COD"].map((pm) => { const on = misc.payMethods.includes(pm); return (<button key={pm} onClick={() => m({ payMethods: on ? misc.payMethods.filter((x) => x !== pm) : [...misc.payMethods, pm] })} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] border-[1.5px] transition-colors ${on ? "bg-purple text-white border-purple" : "bg-white text-body-soft border-lavender-deep hover:border-orchid"}`}>{pm}</button>); })}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Guide>Cashback (%)</Guide><input className="ipt" value={misc.cashbackPct} onChange={(e) => m({ cashbackPct: e.target.value })} /></div></div>
              </div>
            )}
            {form.shape === "free_delivery" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Guide>Free delivery over (৳)</Guide><input className="ipt" value={misc.fdThreshold} onChange={(e) => m({ fdThreshold: e.target.value })} /></div>
                <div><Guide>Zone</Guide><select className="ipt" value={misc.fdZone} onChange={(e) => m({ fdZone: e.target.value })}><option>All zones</option><option>Inside Dhaka</option><option>Nationwide</option></select></div>
              </div>
            )}
            {form.shape === "corporate" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Guide>Minimum units</Guide><input className="ipt" value={misc.corpMinUnits} onChange={(e) => m({ corpMinUnits: e.target.value })} /></div>
                <div><Guide>Volume rate (%)</Guide><input className="ipt" value={misc.corpRate} onChange={(e) => m({ corpRate: e.target.value })} /></div>
                <p className="text-[13px] text-body-soft md:col-span-2">Quotation &amp; credit terms live in the Corporate Orders module — this sets the rate tier only.</p>
              </div>
            )}
            {!["bundle", "tiered", "free_gift", "bogo", "payment", "free_delivery", "corporate"].includes(form.shape) && (
              <div className="text-[13px] text-body-soft bg-lavender/50 border border-lavender-deep rounded-[12px] px-4 py-3">This shape (<b className="text-purple">{SHAPE_LABEL[form.shape]}</b>) uses the standard discount fields — set them in <b className="text-purple">Benefit &amp; Value</b>. No extra builder needed.</div>
            )}
          </Block>

          <Block show={sec === "benefit"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Benefit &amp; Value</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">The discount itself + optional Grand-Slam value stack (bonuses / guarantee).</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Guide>Discount type</Guide><select className="ipt" value={form.discountType} onChange={(e) => set({ discountType: e.target.value as Offer["discountType"] })}><option>Percent %</option><option>Flat ৳</option><option>Free delivery</option><option>Bundle price</option></select></div>
              <div><Guide>Value</Guide><input className="ipt" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} /></div>
              <div><Guide>Max discount (cap ৳)</Guide><input className="ipt" value={form.maxDiscountText} onChange={(e) => set({ maxDiscountText: e.target.value })} /></div>
            </div>
            {form.marginWarn && (<div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mt-4 text-[12.5px] text-[#7a4b09]"><span className="text-[#b45309] shrink-0"><Icon name="bolt" size={18} /></span><div><b>Margin check:</b> {form.marginWarn}</div></div>)}
            <div className="mt-4">
              <Guide>Bonus lines (value stack — optional)</Guide>
              <div className="flex gap-2 flex-wrap">
                {form.bonusLines.map((b, i) => (<span key={i} className="inline-flex items-center gap-2 bg-white border-[1.5px] border-lavender-deep rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium text-purple">＋ {b} <button onClick={() => rmBonus(i)} className="text-body-soft hover:text-[#c0392b] font-bold">×</button></span>))}
                <button onClick={addBonus} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[11px] px-3 py-2 text-[13px] text-body-soft hover:text-purple">＋ Add bonus</button>
              </div>
            </div>
            <div className="mt-3.5"><Guide>Guarantee line (optional)</Guide><input className="ipt" value={form.guaranteeText} onChange={(e) => set({ guaranteeText: e.target.value })} placeholder="e.g. Fresh-on-arrival or we re-deliver free" /></div>
          </Block>

          <Block show={sec === "elig"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Eligibility</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">Who / what qualifies. Targets and segments reference their owning masters.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Guide>Min order (৳)</Guide><input className="ipt" value={misc.minOrder} onChange={(e) => m({ minOrder: e.target.value })} /></div>
              <div><Guide>Channel</Guide><select className="ipt" value={misc.channel} onChange={(e) => m({ channel: e.target.value })}><option>Website</option><option>All channels</option><option>POS</option><option>WhatsApp</option></select></div>
              <div><Guide>Customer segment</Guide><select className="ipt" value={misc.segment} onChange={(e) => m({ segment: e.target.value })}><option>Everyone</option><option>VIP</option><option>Repeat</option><option>Birthday month</option><option>Corporate</option></select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div><Guide>Delivery zone</Guide><select className="ipt" value={misc.zone} onChange={(e) => m({ zone: e.target.value })}><option>All zones</option><option>Inside Dhaka</option><option>Nationwide</option></select></div>
              <div><Guide>Gift / self</Guide><select className="ipt" value={misc.giftSelf} onChange={(e) => m({ giftSelf: e.target.value })}><option>Both</option><option>Self only</option><option>Gift only</option></select></div>
            </div>
            <div className="mt-4">
              <Guide>Target categories / products</Guide>
              <div className="flex gap-2 flex-wrap">
                {misc.targets.map((t, i) => (<span key={i} className="inline-flex items-center gap-2 bg-white border-[1.5px] border-lavender-deep rounded-[11px] px-3 py-2 text-[12.5px] font-medium text-purple">{t} <button onClick={() => m({ targets: misc.targets.filter((_, j) => j !== i) })} className="text-body-soft hover:text-[#c0392b] font-bold">×</button></span>))}
                <button onClick={() => m({ pickerOpen: !misc.pickerOpen })} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[11px] px-3 py-2 text-[13px] text-body-soft hover:text-purple">＋ Pick product / category</button>
              </div>
              {misc.pickerOpen && (
                <div className="mt-3 border border-lavender-deep rounded-[14px] p-3 bg-lavender/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex bg-white rounded-[10px] p-1 gap-1 border border-lavender-deep">
                      {(["category", "product"] as const).map((tab) => (<button key={tab} onClick={() => m({ pickerTab: tab })} className={`text-[12px] font-semibold px-3 py-1.5 rounded-[8px] ${misc.pickerTab === tab ? "bg-purple text-white" : "text-body-soft"}`}>{tab === "category" ? "Categories" : "Products"}</button>))}
                    </div>
                    <button onClick={() => m({ pickerOpen: false })} className="text-[12px] font-semibold text-orchid">Done</button>
                  </div>
                  <input className="ipt mb-2" placeholder="Search…" value={misc.pickerQ} onChange={(e) => m({ pickerQ: e.target.value })} />
                  <div className="flex flex-col gap-1 max-h-[180px] overflow-auto">
                    {(misc.pickerTab === "category" ? PICK_CATEGORIES : PICK_PRODUCTS).filter((x) => x.toLowerCase().includes(misc.pickerQ.toLowerCase())).map((x) => {
                      const label = misc.pickerTab === "category" ? x + " category" : x;
                      const added = misc.targets.includes(label);
                      return (<button key={x} onClick={() => (added ? m({ targets: misc.targets.filter((t) => t !== label) }) : m({ targets: [...misc.targets, label] }))} className={`text-left text-[12.5px] px-3 py-2 rounded-[9px] flex items-center justify-between transition-colors ${added ? "bg-orchid-soft text-purple font-medium" : "hover:bg-white text-body"}`}>{label}{added && <Icon name="check" size={14} />}</button>);
                    })}
                  </div>
                </div>
              )}
            </div>
          </Block>

          <Block show={sec === "code"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Coupon Code</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">{form.mechanism === "coupon" ? "Redemption is tracked as an event on the Sales Order — never re-counted here." : "This offer is Automatic — switch mechanism to Coupon to use a code."}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Guide>Code</Guide><input className="ipt font-mono font-bold" value={form.code ?? ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="ROSES12" /></div>
              <div><Guide>Total usage limit</Guide><input className="ipt" value={misc.totalLimit} onChange={(e) => m({ totalLimit: e.target.value })} /></div>
              <div><Guide>Per-customer limit</Guide><input className="ipt" value={misc.perCustomerLimit} onChange={(e) => m({ perCustomerLimit: e.target.value })} /></div>
            </div>
          </Block>

          <Block show={sec === "sched"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Schedule</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">A live countdown renders on the card <b>only</b> when a real end date is set (no-theater rule).</p>
            <Guide>Festival preset (fills the window)</Guide>
            <div className="flex gap-2 flex-wrap mb-4">
              {FESTIVALS.map((f) => (<button key={f.key} onClick={() => { m({ startsAt: `${f.label} start`, endsAt: f.window }); set({ scheduleText: `${f.label} · ${f.window}`, scheduleTone: "sched" }); }} className="bg-white border-[1.5px] border-lavender-deep hover:border-orchid text-purple text-[12.5px] font-semibold px-3 py-2 rounded-[10px]">{f.label} <span className="text-body-soft font-normal">· {f.window}</span></button>))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Starts</Guide><input className="ipt" value={misc.startsAt} onChange={(e) => m({ startsAt: e.target.value })} /></div>
              <div><Guide>Ends (blank = ongoing)</Guide><input className="ipt" value={misc.endsAt} onChange={(e) => { m({ endsAt: e.target.value }); set({ scheduleText: e.target.value ? `Ends ${e.target.value}` : "Ongoing", scheduleTone: e.target.value ? "sched" : "on" }); }} placeholder="Ongoing" /></div>
            </div>
            <div className="mt-3.5"><Guide>Recurring</Guide><div className="flex items-center gap-2 pt-1"><CToggle on={misc.recurring} onChange={(v) => m({ recurring: v })} /> <span className="text-[13px] text-body-soft">Repeat every year (festival offers)</span></div></div>
          </Block>

          <Block show={sec === "scar"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Scarcity (cosmetic)</h3>
            <div className="flex gap-2.5 rounded-[16px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mb-4 text-[12.5px] text-[#7a4b09]"><span className="text-[#b45309] shrink-0"><Icon name="bolt" size={18} /></span><div><b>Cosmetic display only.</b> Never reads real inventory. Real stock lives in the Inventory module.</div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Show scarcity counter</Guide><div className="pt-1.5"><CToggle on={form.scarcity} onChange={(v) => set({ scarcity: v })} /></div></div>
              <div><Guide>Label template</Guide><input className="ipt" value={misc.scarcityLabel} onChange={(e) => m({ scarcityLabel: e.target.value })} /></div>
            </div>
          </Block>

          <Block show={sec === "stack"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Stacking &amp; Priority</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">Engine-level rule. Default = exclusive; checkout applies the best/priority offer.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Combinable with other offers</Guide><div className="pt-1.5"><CToggle on={form.combinable} onChange={(v) => set({ combinable: v })} /></div></div>
              <div><Guide>Priority (lower applies first)</Guide><input className="ipt" value={String(form.priority)} onChange={(e) => set({ priority: Number(e.target.value) || 0 })} /></div>
            </div>
          </Block>

          <Block show={sec === "copy"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Storefront Copy</h3>
            <p className="text-[13px] text-body-soft m-0 mb-4">Exactly what renders on the public Offers page &amp; card — updates the live preview.</p>
            <div><Guide>Public title</Guide><input className="ipt" value={form.publicTitle} onChange={(e) => set({ publicTitle: e.target.value })} /></div>
            <div className="mt-3.5"><Guide>Benefit line</Guide><input className="ipt" value={form.benefitLine} onChange={(e) => set({ benefitLine: e.target.value })} /></div>
            <div className="mt-3.5"><Guide>Description</Guide><textarea className="ipt" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
            <div className="mt-3.5"><Guide>Eligibility chips (comma-separated)</Guide><CommaListInput value={form.eligibility} onChange={(next) => set({ eligibility: next })} /></div>
          </Block>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => setSaved(true)} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-6 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="check" size={17} /> {isNew ? "Create offer" : "Save changes"}</button>
            <Link href="/marketing/offers/list" className="bg-white border-[1.5px] border-lavender-deep text-purple text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center">Cancel</Link>
            {saved && <span className="text-[13px] font-semibold text-[#0f7d55] inline-flex items-center gap-1.5"><Icon name="check" size={16} /> Saved (mock) — not yet persisted to backend</span>}
          </div>
        </div>

        {/* live preview */}
        <div className="lg:sticky lg:top-4">
          <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft mb-2.5 flex items-center gap-2"><span className="w-[7px] h-[7px] rounded-full bg-[#0f7d55] ring-4 ring-[#d6f2e5]" /> Live storefront preview</div>
          <div className="rounded-[28px] border border-lavender-deep bg-gradient-to-b from-[#fbf5ff] to-[#f4ecfa] p-4">
            <div className="relative bg-white border border-[#efe1f6] rounded-[20px] p-4 shadow-soft overflow-hidden">
              <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orchid to-rosegold" />
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.03em] text-[#a021b8] bg-orchid-soft px-2.5 py-1 rounded-full">{form.mechanism === "coupon" ? "Coupon" : "Automatic"} · {SHAPE_LABEL[form.shape]}</span>
              <span className="absolute top-3.5 right-3.5 text-rosegold"><Icon name="heart" size={20} /></span>
              <h3 className="font-display text-[18px] text-purple mt-3 mb-1.5 leading-tight">{form.publicTitle || "Offer title"}</h3>
              <div className="text-[14.5px] font-bold text-orchid mb-1.5">{form.benefitLine || "Benefit line"}</div>
              <p className="text-[13px] text-body-soft m-0 mb-3 leading-relaxed">{form.description || "Short honest description of the offer."}</p>
              {form.shape === "bundle" && !!form.comboPricePaisa && (<div className="flex items-baseline gap-2 mb-3"><span className="font-display text-[18px] text-purple">{taka(form.comboPricePaisa)}</span><span className="line-through text-body-soft text-[12px]">{taka(bundleSum)}</span><span className="text-[11px] font-semibold text-[#0f7d55]">save {taka(Math.max(0, bundleSum - form.comboPricePaisa))}</span></div>)}
              {form.bonusLines.length > 0 && (<div className="mb-3 flex flex-col gap-1">{form.bonusLines.map((b, i) => (<div key={i} className="text-[11.5px] text-[#0f7d55] flex items-center gap-1.5"><Icon name="check" size={12} /> {b}</div>))}</div>)}
              <div className="flex gap-1.5 flex-wrap mb-3">{form.eligibility.map((e, i) => (<span key={i} className="text-[11px] bg-lavender text-body px-2 py-1 rounded-[7px]">{e}</span>))}</div>
              {form.mechanism === "coupon" && form.code && (<div className="flex items-center justify-between border-[1.5px] border-dashed border-orchid-mid rounded-[11px] px-3 py-2 mb-3 bg-[#fdf6ff]"><b className="font-mono text-[15px] tracking-[0.06em] text-purple">{form.code}</b><span className="text-[11px] font-semibold text-orchid flex items-center gap-1.5"><Icon name="copy" size={13} /> Copy</span></div>)}
              {form.scarcity && <div className="text-[11px] text-[#c0392b] font-semibold mb-2">🔥 {misc.scarcityLabel.replace("{n}", "4")}</div>}
              <div className="flex items-center justify-between gap-2 border-t border-[#f2ebf8] pt-2.5"><span className="text-[11px] text-[#b45309] font-semibold flex items-center gap-1"><Icon name="clock" size={12} /> {form.scheduleText}</span><span className="text-[12px] font-bold text-purple flex items-center gap-1">Shop now →</span></div>
            </div>
          </div>
          <div className="text-[13px] text-body-soft text-center mt-3 leading-relaxed">Same engine feeds the Offers-page card <b>and</b> the checkout coupon field.</div>
        </div>
      </div>
    </div>
  );
}

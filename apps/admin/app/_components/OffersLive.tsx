"use client";

/*
  Pricing & Offers — LIVE screens (:4000 /offers), replaces the §9 mock where it
  counts. RADIAN_OFFERS_MODULE_ARCHITECTURE.md (DEC-OFR-001..009).
  Core-6 shapes are real; deferred shapes (bundle/tiered/free-gift/BOGO/corporate)
  render disabled with a "later pass" note — the enum add is non-breaking.
  Demo fallback + orange "Demo data" badge per project rule when the API is down.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  ApiOffer,
  ApiOfferAnalytics,
  ApiOfferDiscountType,
  ApiOfferMechanism,
  ApiOfferShape,
  OFFER_LIVESTATE_META,
  createOffer,
  getOffer,
  getOfferSettings,
  listCategoriesSafe,
  listOffersSafe,
  listProducts,
  offerAction,
  offersAnalytics,
  offersApprovals,
  updateOffer,
  updateOfferSettings,
  type ApiCategoryNode,
  type ApiProduct,
} from "../_data/api";

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1500px]"; // 6 Aug — widened, see FinanceUI.WRAP note
const taka = (p: number) => `৳${(p / 100).toLocaleString("en-IN")}`;

const SHAPES_LIVE: { label: string; val: ApiOfferShape; hint: string }[] = [
  { label: "Sitewide", val: "SITEWIDE", hint: "whole catalogue" },
  { label: "Category", val: "CATEGORY", hint: "one category (+children)" },
  { label: "Product", val: "PRODUCT", hint: "picked products" },
  { label: "First order", val: "FIRST_ORDER", hint: "welcome offer" },
  { label: "Payment method", val: "PAYMENT", hint: "bKash / Nagad …" },
  { label: "Free delivery", val: "FREE_DELIVERY", hint: "waives the charge" },
];
const SHAPES_LATER = ["Bundle", "Tiered", "Free gift", "BOGO", "Corporate"];

function Guide({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold tracking-[0.03em] uppercase text-body-soft mb-1.5">{children}</span>;
}
function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
        <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
      {children && <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">{children}</p>}
    </div>
  );
}
function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#fff4e2] text-[#b45309] text-[12px] font-bold px-3 py-1.5 rounded-full">
      <Icon name="bolt" size={13} /> Demo data — API offline or empty
    </span>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`w-[38px] h-[22px] rounded-full relative transition-colors ${on ? "bg-[#0f7d55]" : "bg-[#cdbfda]"}`}>
      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-[2px]"}`} />
    </button>
  );
}
function LiveChip({ s }: { s: ApiOffer["liveState"] }) {
  const m = OFFER_LIVESTATE_META[s];
  return <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: m.bg, color: m.text }}>{m.label}</span>;
}
const benefitText = (o: ApiOffer) =>
  o.discountType === "FREE_DELIVERY" || o.shape === "FREE_DELIVERY"
    ? "Free delivery"
    : o.discountType === "PERCENT"
      ? `${(o.discountValue / 100).toLocaleString()}% off${o.maxDiscountPaisa ? ` · max ${taka(o.maxDiscountPaisa)}` : ""}`
      : `${taka(o.discountValue)} off`;

/* ================= LIST ================= */
export function OffersListLive() {
  const [rows, setRows] = useState<ApiOffer[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [q, setQ] = useState("");
  const [mech, setMech] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listOffersSafe();
    if (r === null) { setDemo(true); setRows([]); } else { setDemo(false); setRows(r); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((o) => {
        const okQ = !q || o.name.toLowerCase().includes(q.toLowerCase()) || (o.code ?? "").toLowerCase().includes(q.toLowerCase()) || o.offerNo.toLowerCase().includes(q.toLowerCase());
        return okQ && (!mech || o.mechanism === mech) && (!state || o.liveState === state);
      }),
    [rows, q, mech, state],
  );
  const kpi = useMemo(() => {
    const list = rows ?? [];
    return {
      active: list.filter((o) => o.liveState === "active").length,
      scheduled: list.filter((o) => o.liveState === "scheduled").length,
      pending: list.filter((o) => o.liveState === "pending_approval").length,
      coupons: list.filter((o) => o.mechanism === "COUPON" && o.liveState === "active").length,
      redeemed: list.reduce((s, o) => s + o.redeemedCount, 0),
    };
  }, [rows]);

  const act = async (o: ApiOffer, a: "pause" | "resume") => {
    setBusy(o.id);
    try { await offerAction(o.id, a); await load(); } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
    setBusy(null);
  };
  const dup = async (o: ApiOffer) => {
    setBusy(o.id);
    try {
      await createOffer({
        name: `${o.name} (copy)`, internalNote: o.internalNote, publicTitle: o.publicTitle,
        benefitLine: o.benefitLine, description: o.description, mechanism: o.mechanism, shape: o.shape,
        code: o.mechanism === "COUPON" ? `${o.code}2` : undefined,
        discountType: o.discountType, discountValue: o.discountValue,
        maxDiscountPaisa: o.maxDiscountPaisa, minSpendPaisa: o.minSpendPaisa,
        perCustomerLimit: o.perCustomerLimit, totalLimit: o.totalLimit,
        categoryId: o.categoryId, productIds: o.products?.map((p) => p.id),
        paymentMethod: o.paymentMethod, combinable: o.combinable, priority: o.priority,
        scarcity: o.scarcity, bonusLines: o.bonusLines, guaranteeText: o.guaranteeText,
      });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
    setBusy(null);
  };

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <PageHead eyebrow="Offers & Promotions · engine" title="All Offers">
          Every discount, coupon and cashback in one place.
        </PageHead>
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <Link href="/marketing/offers/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="plus" size={18} /> New Offer</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { n: kpi.active, l: "Active now", bg: "#e8f6ef", tx: "#0f7d55" },
          { n: kpi.scheduled, l: "Scheduled", bg: "#fff4e2", tx: "#b45309" },
          { n: kpi.pending, l: "Needs approval", bg: "#fdecec", tx: "#b91c1c" },
          { n: kpi.coupons, l: "Coupons live", bg: "#f6e9fb", tx: "#a021b8" },
          { n: kpi.redeemed, l: "Redemptions (all time)", bg: "#efe9f6", tx: "#470066" },
        ].map((s, i) => (
          <div key={i} className="rounded-[14px] px-4 py-3.5 shadow-soft border border-lavender-deep" style={{ background: s.bg }}>
            <div className="text-[24px] font-medium font-display leading-none" style={{ color: s.tx }}>{s.n}</div>
            <div className="text-[13px] text-body-soft mt-1.5">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[320px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={18} /></span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search name, code or OFR-no…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[160px] h-[44px]" value={mech} onChange={(e) => setMech(e.target.value)}>
          <option value="">All mechanisms</option><option value="AUTOMATIC">Automatic</option><option value="COUPON">Coupon</option>
        </select>
        <select className="ipt max-w-[170px] h-[44px]" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All states</option>
          {Object.entries(OFFER_LIVESTATE_META).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
        </select>
        <span className="text-[13px] text-body-soft ml-auto">{filtered.length} offer{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Offer</th>
              <th className="text-left font-medium px-4 py-3">Type</th>
              <th className="text-left font-medium px-4 py-3">Benefit</th>
              <th className="text-left font-medium px-4 py-3">Code</th>
              <th className="text-left font-medium px-4 py-3">State</th>
              <th className="text-left font-medium px-4 py-3">Prio</th>
              <th className="text-left font-medium px-4 py-3">Redeemed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-lavender/70 border-t border-lavender-deep transition-colors">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-purple leading-snug">{o.name}</div>
                  <div className="text-body-soft text-[11.5px]">{o.offerNo}{o.internalNote ? ` · ${o.internalNote}` : ""}</div>
                  {o.belowCostFlag && <div className="text-[11px] text-[#b45309] font-semibold mt-0.5">⚠ below-cost somewhere in target</div>}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${o.mechanism === "AUTOMATIC" ? "bg-[#e8f6ef] text-[#0f7d55]" : "bg-orchid-soft text-[#a021b8]"}`}>{o.mechanism === "AUTOMATIC" ? "Automatic" : "Coupon"}</span>
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-lavender text-purple ml-1.5">{SHAPES_LIVE.find((s) => s.val === o.shape)?.label ?? o.shape}</span>
                </td>
                <td className="px-4 py-3 align-top">{benefitText(o)}{o.minSpendPaisa ? <div className="text-[11.5px] text-body-soft">min spend {taka(o.minSpendPaisa)}</div> : null}</td>
                <td className="px-4 py-3 align-top">{o.code ? <span className="font-mono font-bold text-purple bg-lavender border border-dashed border-orchid-mid rounded-[7px] px-2 py-0.5 text-[12px]">{o.code}</span> : "—"}</td>
                <td className="px-4 py-3 align-top"><LiveChip s={o.liveState} /></td>
                <td className="px-4 py-3 align-top">{o.priority}</td>
                <td className="px-4 py-3 align-top">{o.redeemedCount}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-1.5 justify-end">
                    {(o.liveState === "active" || o.liveState === "scheduled") && (
                      <button disabled={busy === o.id} onClick={() => act(o, "pause")} title="Pause" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep hover:border-orchid text-body-soft hover:text-purple inline-flex items-center justify-center transition-colors"><Icon name="clock" size={15} /></button>
                    )}
                    {o.liveState === "paused" && (
                      <button disabled={busy === o.id} onClick={() => act(o, "resume")} title="Resume" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep hover:border-orchid text-body-soft hover:text-purple inline-flex items-center justify-center transition-colors"><Icon name="check" size={15} /></button>
                    )}
                    <button disabled={busy === o.id} onClick={() => dup(o)} title="Duplicate" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep hover:border-orchid text-body-soft hover:text-purple inline-flex items-center justify-center transition-colors"><Icon name="copy" size={15} /></button>
                    <Link href={`/marketing/offers/${o.id}`} className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft h-[34px] px-3 rounded-[10px] inline-flex items-center gap-1.5 transition-colors text-[13px] font-medium"><Icon name="edit" size={15} /> Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-body-soft py-12 border-t border-lavender-deep">
                  {demo ? "API offline — start the backend, then reload." : "No offers yet — create the first one."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-body-soft text-[12px] mt-3.5"></p>
    </div>
  );
}

/* ================= EDITOR (Core-6, live) ================= */
type Form = {
  name: string; internalNote: string; publicTitle: string; benefitLine: string; description: string;
  mechanism: ApiOfferMechanism; shape: ApiOfferShape; code: string;
  discountType: ApiOfferDiscountType; discountPct: string; discountTk: string; maxDiscountTk: string;
  minSpendTk: string; perCustomerLimit: string; totalLimit: string;
  categoryId: string; productIds: string[]; paymentMethod: string;
  combinable: boolean; priority: string; scarcity: boolean;
  bonusLines: string[]; guaranteeText: string;
  startsAt: string; endsAt: string;
};
const BLANK_FORM: Form = {
  name: "", internalNote: "", publicTitle: "", benefitLine: "", description: "",
  mechanism: "AUTOMATIC", shape: "SITEWIDE", code: "",
  discountType: "PERCENT", discountPct: "10", discountTk: "", maxDiscountTk: "",
  minSpendTk: "", perCustomerLimit: "", totalLimit: "",
  categoryId: "", productIds: [], paymentMethod: "bkash",
  combinable: false, priority: "0", scarcity: false,
  bonusLines: [], guaranteeText: "",
  startsAt: "", endsAt: "",
};
const isoToLocal = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export function OfferEditorLive({ id }: { id: string }) {
  const isNew = id === "new";
  const [form, setForm] = useState<Form>(BLANK_FORM);
  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [cats, setCats] = useState<ApiCategoryNode[]>([]);
  const [prodQ, setProdQ] = useState("");
  const [prodOpts, setProdOpts] = useState<ApiProduct[]>([]);
  const [prodNames, setProdNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    void (async () => {
      const c = await listCategoriesSafe();
      setCats(c.items.filter((x) => !x.parentId && x.isActive));
      if (!isNew) {
        try {
          const o = await getOffer(id);
          setOffer(o);
          setForm({
            name: o.name, internalNote: o.internalNote ?? "", publicTitle: o.publicTitle ?? "",
            benefitLine: o.benefitLine ?? "", description: o.description ?? "",
            mechanism: o.mechanism, shape: o.shape, code: o.code ?? "",
            discountType: o.discountType,
            discountPct: o.discountType === "PERCENT" ? String(o.discountValue / 100) : "10",
            discountTk: o.discountType === "FLAT" ? String(Math.round(o.discountValue / 100)) : "",
            maxDiscountTk: o.maxDiscountPaisa ? String(Math.round(o.maxDiscountPaisa / 100)) : "",
            minSpendTk: o.minSpendPaisa ? String(Math.round(o.minSpendPaisa / 100)) : "",
            perCustomerLimit: o.perCustomerLimit ? String(o.perCustomerLimit) : "",
            totalLimit: o.totalLimit ? String(o.totalLimit) : "",
            categoryId: o.categoryId ?? "", productIds: (o.products ?? []).map((p) => p.id),
            paymentMethod: o.paymentMethod ?? "bkash",
            combinable: o.combinable, priority: String(o.priority), scarcity: o.scarcity,
            bonusLines: o.bonusLines, guaranteeText: o.guaranteeText ?? "",
            startsAt: isoToLocal(o.startsAt), endsAt: isoToLocal(o.endsAt),
          });
          setProdNames(Object.fromEntries((o.products ?? []).map((p) => [p.id, p.name])));
        } catch {
          setErr("Could not load this offer — API offline?");
        }
      }
    })();
  }, [id, isNew]);

  useEffect(() => {
    if (form.shape !== "PRODUCT" || prodQ.length < 2) { setProdOpts([]); return; }
    const t = setTimeout(async () => {
      try { setProdOpts((await listProducts({ search: prodQ })).items.slice(0, 8)); } catch { setProdOpts([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [prodQ, form.shape]);

  const save = async (submit: boolean) => {
    setSaving(true);
    setErr("");
    const body: Record<string, unknown> = {
      name: form.name, internalNote: form.internalNote || undefined,
      publicTitle: form.publicTitle || undefined, benefitLine: form.benefitLine || undefined,
      description: form.description || undefined,
      mechanism: form.mechanism, shape: form.shape,
      code: form.mechanism === "COUPON" ? form.code : undefined,
      discountType: form.shape === "FREE_DELIVERY" ? "FREE_DELIVERY" : form.discountType,
      discountValue:
        form.shape === "FREE_DELIVERY" ? 0
        : form.discountType === "PERCENT" ? Math.round((Number(form.discountPct) || 0) * 100)
        : Math.round((Number(form.discountTk) || 0) * 100),
      maxDiscountPaisa: form.maxDiscountTk ? Math.round(Number(form.maxDiscountTk) * 100) : null,
      minSpendPaisa: form.minSpendTk ? Math.round(Number(form.minSpendTk) * 100) : null,
      perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
      totalLimit: form.totalLimit ? Number(form.totalLimit) : null,
      categoryId: form.shape === "CATEGORY" ? form.categoryId || null : null,
      productIds: form.shape === "PRODUCT" ? form.productIds : undefined,
      paymentMethod: form.shape === "PAYMENT" ? form.paymentMethod : null,
      combinable: form.combinable, priority: Number(form.priority) || 0, scarcity: form.scarcity,
      bonusLines: form.bonusLines, guaranteeText: form.guaranteeText || null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      submit,
    };
    try {
      const saved = isNew ? await createOffer(body) : await updateOffer(id, body);
      window.location.href = saved.status === "pending_approval" ? "/marketing/offers/approvals" : "/marketing/offers/list";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  };

  return (
    <div className={WRAP}>
      <Link href="/marketing/offers/list" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-body-soft hover:text-purple mb-3"><Icon name="chevronLeft" size={16} /> All Offers</Link>
      <PageHead eyebrow="Offers & Promotions · engine" title={isNew ? "New offer" : `Edit — ${form.name || "offer"}`}>
        Save as a draft, or Submit to publish. Deep discounts need a manager’s approval first.
      </PageHead>

      {offer && offer.liveState !== "draft" && (
        <div className="mb-4"><LiveChip s={offer.liveState} />{offer.approvedBy && <span className="text-[12.5px] text-body-soft ml-2">approved by {offer.approvedBy}</span>}</div>
      )}
      {err && <div className="mb-4 text-[13px] font-semibold text-[#b91c1c] bg-[#fdecec] border border-[#f5c6c6] rounded-[12px] px-4 py-3">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {/* basics */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Basics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Internal name *</Guide><input className="ipt" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Anniversary Roses Week" /></div>
              <div><Guide>Internal note</Guide><input className="ipt" value={form.internalNote} onChange={(e) => set({ internalNote: e.target.value })} /></div>
            </div>
          </div>

          {/* mechanism + shape */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Mechanism &amp; Shape</h3>
            <Guide>Mechanism</Guide>
            <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1 mb-4">
              {([{ l: "Automatic (auto-applies)", v: "AUTOMATIC" }, { l: "Coupon (needs code)", v: "COUPON" }] as const).map((mm) => (
                <button key={mm.v} onClick={() => set({ mechanism: mm.v })} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${form.mechanism === mm.v ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{mm.l}</button>
              ))}
            </div>
            <Guide>Shape</Guide>
            <div className="flex flex-wrap bg-lavender rounded-[11px] p-1 gap-1">
              {SHAPES_LIVE.map((sh) => (
                <button key={sh.val} onClick={() => set({ shape: sh.val })} title={sh.hint} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${form.shape === sh.val ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{sh.label}</button>
              ))}
              {SHAPES_LATER.map((sh) => (
                <span key={sh} title="Later pass — deferred (architecture §8)" className="text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] text-body-soft/50 cursor-not-allowed">{sh} ·soon</span>
              ))}
            </div>

            {/* shape-specific targeting */}
            {form.shape === "CATEGORY" && (
              <div className="mt-4"><Guide>Target category (children included)</Guide>
                <select className="ipt max-w-[320px]" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">— pick a category —</option>
                  {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            )}
            {form.shape === "PRODUCT" && (
              <div className="mt-4">
                <Guide>Target products</Guide>
                <div className="flex gap-2 flex-wrap mb-2">
                  {form.productIds.map((pid) => (
                    <span key={pid} className="inline-flex items-center gap-2 bg-white border-[1.5px] border-lavender-deep rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium text-purple">
                      {prodNames[pid] ?? pid}
                      <button onClick={() => set({ productIds: form.productIds.filter((x) => x !== pid) })} className="text-body-soft hover:text-[#c0392b] font-bold">×</button>
                    </span>
                  ))}
                </div>
                <input className="ipt max-w-[320px]" placeholder="Search products" value={prodQ} onChange={(e) => setProdQ(e.target.value)} />
                {prodOpts.length > 0 && (
                  <div className="mt-1 border border-lavender-deep rounded-[12px] bg-white shadow-soft max-w-[320px] overflow-hidden">
                    {prodOpts.map((p) => (
                      <button key={p.id} onClick={() => { if (!form.productIds.includes(p.id)) { set({ productIds: [...form.productIds, p.id] }); setProdNames((n) => ({ ...n, [p.id]: p.name })); } setProdQ(""); }} className="block w-full text-left text-[13px] px-3 py-2 hover:bg-lavender/60">{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.shape === "PAYMENT" && (
              <div className="mt-4"><Guide>Payment method</Guide>
                <select className="ipt max-w-[220px]" value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
                  <option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="card">Card</option><option value="cod">COD</option><option value="online">Online</option>
                </select>
              </div>
            )}
          </div>

          {/* benefit */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Benefit &amp; Limits</h3>
            {form.shape === "FREE_DELIVERY" ? (
              <p className="text-[13px] text-body-soft m-0 mb-2">This shape waives the delivery charge — set a min-spend below if it should unlock at a threshold.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Guide>Discount type</Guide>
                  <select className="ipt" value={form.discountType} onChange={(e) => set({ discountType: e.target.value as ApiOfferDiscountType })}>
                    <option value="PERCENT">Percent %</option><option value="FLAT">Flat ৳</option>
                  </select>
                </div>
                {form.discountType === "PERCENT"
                  ? <div><Guide>Percent (%)</Guide><input className="ipt" value={form.discountPct} onChange={(e) => set({ discountPct: e.target.value })} /></div>
                  : <div><Guide>Amount (৳)</Guide><input className="ipt" value={form.discountTk} onChange={(e) => set({ discountTk: e.target.value })} /></div>}
                <div><Guide>Max discount cap (৳)</Guide><input className="ipt" value={form.maxDiscountTk} onChange={(e) => set({ maxDiscountTk: e.target.value })} placeholder="No cap" /></div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3.5">
              <div><Guide>Min spend (৳)</Guide><input className="ipt" value={form.minSpendTk} onChange={(e) => set({ minSpendTk: e.target.value })} placeholder="None" /></div>
              <div><Guide>Per-customer limit</Guide><input className="ipt" value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} placeholder="Unlimited" /></div>
              <div><Guide>Total limit</Guide><input className="ipt" value={form.totalLimit} onChange={(e) => set({ totalLimit: e.target.value })} placeholder="Unlimited" /></div>
            </div>
          </div>

          {/* coupon */}
          {form.mechanism === "COUPON" && (
            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <h3 className="font-display text-[16px] text-purple m-0 mb-3">Coupon Code</h3>
              <div><Guide>Code (3–24, A–Z 0–9 - _)</Guide><input className="ipt font-mono font-bold max-w-[240px]" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="ROSES12" /></div>
            </div>
          )}

          {/* schedule + stacking */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Schedule · Stacking · Display</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Starts (blank = now)</Guide><input type="datetime-local" className="ipt" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></div>
              <div><Guide>Ends (blank = ongoing)</Guide><input type="datetime-local" className="ipt" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
              <div><Guide>Combine with other offers</Guide><div className="pt-1.5"><Toggle on={form.combinable} onChange={(v) => set({ combinable: v })} /></div></div>
              <div><Guide>Priority (higher wins ties)</Guide><input className="ipt" value={form.priority} onChange={(e) => set({ priority: e.target.value })} /></div>
              <div><Guide>Scarcity counter (cosmetic)</Guide><div className="pt-1.5"><Toggle on={form.scarcity} onChange={(v) => set({ scarcity: v })} /></div></div>
            </div>
          </div>

          {/* storefront copy */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Storefront Copy (Hormozi stack)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide>Public title</Guide><input className="ipt" value={form.publicTitle} onChange={(e) => set({ publicTitle: e.target.value })} /></div>
              <div><Guide>Benefit line</Guide><input className="ipt" value={form.benefitLine} onChange={(e) => set({ benefitLine: e.target.value })} /></div>
            </div>
            <div className="mt-3.5"><Guide>Description</Guide><textarea className="ipt" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
            <div className="mt-3.5">
              <Guide>Bonus lines</Guide>
              <div className="flex gap-2 flex-wrap">
                {form.bonusLines.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-2 bg-white border-[1.5px] border-lavender-deep rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium text-purple">
                    ＋ <input className="bg-transparent outline-none w-[160px]" value={b} onChange={(e) => set({ bonusLines: form.bonusLines.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button onClick={() => set({ bonusLines: form.bonusLines.filter((_, j) => j !== i) })} className="text-body-soft hover:text-[#c0392b] font-bold">×</button>
                  </span>
                ))}
                <button onClick={() => set({ bonusLines: [...form.bonusLines, "Free greeting card"] })} className="inline-flex items-center bg-white border-[1.5px] border-dashed border-lavender-deep hover:border-orchid rounded-[11px] px-3 py-2 text-[13px] text-body-soft hover:text-purple">＋ Add bonus</button>
              </div>
            </div>
            <div className="mt-3.5"><Guide>Guarantee line</Guide><input className="ipt" value={form.guaranteeText} onChange={(e) => set({ guaranteeText: e.target.value })} placeholder="Fresh-on-arrival or we re-deliver free" /></div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button disabled={saving} onClick={() => save(true)} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-6 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="check" size={17} /> {saving ? "Saving…" : "Submit (go live / to approval)"}</button>
            <button disabled={saving} onClick={() => save(false)} className="bg-white border-[1.5px] border-lavender-deep text-purple text-[14px] font-medium px-5 py-3 rounded-[12px]">Save draft</button>
            {!isNew && offer && (
              <button disabled={saving} onClick={async () => { if (confirm("Archive this offer?")) { await offerAction(id, "archive"); window.location.href = "/marketing/offers/list"; } }} className="text-[13px] font-medium text-body-soft hover:text-[#b91c1c] ml-auto">Archive</button>
            )}
          </div>
        </div>

        {/* live preview */}
        <div className="lg:sticky lg:top-4">
          <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft mb-2.5 flex items-center gap-2"><span className="w-[7px] h-[7px] rounded-full bg-[#0f7d55] ring-4 ring-[#d6f2e5]" /> Live storefront preview</div>
          <div className="rounded-[28px] border border-lavender-deep bg-gradient-to-b from-[#fbf5ff] to-[#f4ecfa] p-4">
            <div className="relative bg-white border border-[#efe1f6] rounded-[20px] p-4 shadow-soft overflow-hidden">
              <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orchid to-rosegold" />
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.03em] text-[#a021b8] bg-orchid-soft px-2.5 py-1 rounded-full">{form.mechanism === "COUPON" ? "Coupon" : "Automatic"} · {SHAPES_LIVE.find((s) => s.val === form.shape)?.label}</span>
              <h3 className="font-display text-[18px] text-purple mt-3 mb-1.5 leading-tight">{form.publicTitle || form.name || "Offer title"}</h3>
              <div className="text-[14.5px] font-bold text-orchid mb-1.5">
                {form.benefitLine ||
                  (form.shape === "FREE_DELIVERY" ? "Free delivery"
                    : form.discountType === "PERCENT" ? `${form.discountPct || 0}% off`
                    : `৳${form.discountTk || 0} off`)}
              </div>
              {form.description && <p className="text-[13px] text-body-soft m-0 mb-3 leading-relaxed">{form.description}</p>}
              {form.bonusLines.length > 0 && (<div className="mb-3 flex flex-col gap-1">{form.bonusLines.map((b, i) => (<div key={i} className="text-[11.5px] text-[#0f7d55] flex items-center gap-1.5"><Icon name="check" size={12} /> {b}</div>))}</div>)}
              {form.mechanism === "COUPON" && form.code && (
                <div className="flex items-center justify-between border-[1.5px] border-dashed border-orchid-mid rounded-[11px] px-3 py-2 mb-3 bg-[#fdf6ff]"><b className="font-mono text-[15px] tracking-[0.06em] text-purple">{form.code}</b><span className="text-[11px] font-semibold text-orchid flex items-center gap-1.5"><Icon name="copy" size={13} /> Copy</span></div>
              )}
              {form.guaranteeText && <div className="text-[11.5px] text-body-soft mb-2">🛡 {form.guaranteeText}</div>}
              {form.scarcity && <div className="text-[11px] text-[#c0392b] font-semibold mb-2">🔥 Only a few claimed today</div>}
              <div className="flex items-center justify-between gap-2 border-t border-[#f2ebf8] pt-2.5">
                <span className="text-[11px] text-[#b45309] font-semibold flex items-center gap-1"><Icon name="clock" size={12} /> {form.endsAt ? `Ends ${form.endsAt.replace("T", " ")}` : "Ongoing"}</span>
                <span className="text-[12px] font-bold text-purple flex items-center gap-1">Shop now →</span>
              </div>
            </div>
          </div>
          <div className="text-[13px] text-body-soft text-center mt-3 leading-relaxed">The same offers apply on the order form.</div>
        </div>
      </div>
    </div>
  );
}

/* ================= APPROVALS (live) ================= */
export function OffersApprovalsLive() {
  const [queue, setQueue] = useState<ApiOffer[] | null>(null);
  const [demo, setDemo] = useState(false);
  const load = useCallback(async () => {
    try { setQueue(await offersApprovals()); setDemo(false); } catch { setQueue([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (o: ApiOffer, verdict: "approve" | "decline") => {
    const name = prompt(`Your name (audited) — ${verdict} "${o.name}"`, "Admin");
    if (!name) return;
    try { await offerAction(o.id, verdict, { actorName: name }); await load(); } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
  };

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1150px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Offers & Promotions · approvals" title="Approvals">
          Deep and below-cost offers wait here for a sign-off before they go live.
        </PageHead>
        {demo && <DemoBadge />}
      </div>
      <div className="flex flex-col gap-3">
        {(queue ?? []).map((o) => (
          <div key={o.id} className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="font-medium text-purple">{o.name} <span className="text-body-soft text-[12px]">· {o.offerNo}</span></div>
              <div className="text-[12.5px] text-body-soft mt-0.5">
                {benefitText(o)}{o.belowCostFlag && <span className="text-[#b91c1c] font-semibold"> · ⚠ below cost somewhere in target</span>}
              </div>
            </div>
            <Link href={`/marketing/offers/${o.id}`} className="text-[13px] font-medium text-orchid hover:text-purple">Inspect</Link>
            <button onClick={() => act(o, "decline")} className="border-[1.5px] border-lavender-deep hover:border-[#e39c9c] text-body-soft hover:text-[#b91c1c] text-[13px] font-medium px-4 py-2.5 rounded-[11px]">Decline → draft</button>
            <button onClick={() => act(o, "approve")} className="bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-5 py-2.5 rounded-[11px] inline-flex items-center gap-1.5"><Icon name="check" size={15} /> Approve</button>
          </div>
        ))}
        {queue !== null && queue.length === 0 && (
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-10 text-center text-body-soft">
            <div className="text-[28px] mb-2">🎉</div>Nothing waiting for approval.
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= SETTINGS (live) ================= */
export function OffersSettingsLive() {
  const [thresholdPct, setThresholdPct] = useState("25");
  const [defCombinable, setDefCombinable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getOfferSettings();
        setThresholdPct(String(s.approvalThresholdBp / 100));
        setDefCombinable(s.defaultCombinable);
      } catch { setDemo(true); }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    try {
      await updateOfferSettings({ approvalThresholdBp: Math.round((Number(thresholdPct) || 0) * 100), defaultCombinable: defCombinable });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e instanceof Error ? e.message : "failed"); }
  };

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[860px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Offers & Promotions · settings" title="Settings">
          Engine-level rules — admin-configurable, never hardcoded (constitution).
        </PageHead>
        {demo && <DemoBadge />}
      </div>
      {loaded && (
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Guide>Approval threshold (%)</Guide>
              <input className="ipt max-w-[160px]" value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
              <p className="text-[12.5px] text-body-soft mt-1.5 mb-0">A percent this high or above needs approval first.</p>
            </div>
            <div>
              <Guide>New offers combinable by default</Guide>
              <div className="pt-1.5"><Toggle on={defCombinable} onChange={setDefCombinable} /></div>
              <p className="text-[12.5px] text-body-soft mt-1.5 mb-0">Whether new offers can combine with others by default.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button onClick={save} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-6 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="check" size={16} /> Save settings</button>
            {saved && <span className="text-[13px] font-semibold text-[#0f7d55]">Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= OVERVIEW (live analytics — no fallback) ================= */
export function OffersOverviewLive() {
  const [data, setData] = useState<ApiOfferAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        /*  ⚠️ It used to flip to a made-up leaderboard whenever the real one
            came back empty — "no offers yet" was shown as somebody else's
            successful campaigns. That is the 19 Aug rule broken on a page the
            owner opens: no screen may present invented data as real. A shop
            with no redemptions shows zero, and says so.  */
        setData(await offersAnalytics(30));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not reach the offers engine.");
      }
    })();
  }, []);

  const rows = data?.leaderboard ?? [];
  const totals = data?.totals ?? { redemptions: 0, revenuePaisa: 0, discountPaisa: 0, newCustomers: 0 };

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Offers & Promotions" title="Overview">
          How each offer is performing over the last 30 days.
        </PageHead>
        <Link href="/marketing/offers/list" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-bold px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="plus" size={16} /> All offers</Link>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] font-semibold">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { n: String(totals.redemptions), l: "Redemptions · 30d", bg: "#efe9f6", tx: "#470066" },
          { n: taka(totals.revenuePaisa), l: "Revenue with offers · 30d", bg: "#e8f6ef", tx: "#0f7d55" },
          { n: taka(totals.discountPaisa), l: "Discount given · 30d", bg: "#fff4e2", tx: "#b45309" },
          { n: String(totals.newCustomers), l: "New customers via offers", bg: "#f6e9fb", tx: "#a021b8" },
        ].map((s, i) => (
          <div key={i} className="rounded-[14px] px-4 py-3.5 shadow-soft border border-lavender-deep" style={{ background: s.bg }}>
            <div className="text-[22px] font-medium font-display leading-none" style={{ color: s.tx }}>{s.n}</div>
            <div className="text-[13px] text-body-soft mt-1.5">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="px-4 py-3 bg-lavender/60 text-[11px] uppercase tracking-[0.05em] text-body-soft font-medium">Leaderboard — which offer earns, which one leaks</div>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em]">
              <th className="text-left font-medium px-4 py-2.5">Offer</th>
              <th className="text-right font-medium px-4 py-2.5">Redemptions</th>
              <th className="text-right font-medium px-4 py-2.5">Revenue</th>
              <th className="text-right font-medium px-4 py-2.5">Discount</th>
              <th className="text-right font-medium px-4 py-2.5">New customers</th>
              <th className="text-right font-medium px-4 py-2.5">৳ revenue / ৳1 discount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.offerId} className="border-t border-lavender-deep hover:bg-lavender/60">
                <td className="px-4 py-3 font-medium text-purple">{r.name}{r.code ? <span className="font-mono text-[11px] text-body-soft ml-1.5">({r.code})</span> : null}</td>
                <td className="px-4 py-3 text-right">{r.redemptions}</td>
                <td className="px-4 py-3 text-right">{taka(r.revenuePaisa)}</td>
                <td className="px-4 py-3 text-right text-[#b45309]">{taka(r.discountPaisa)}</td>
                <td className="px-4 py-3 text-right">{r.newCustomers}</td>
                <td className="px-4 py-3 text-right font-semibold text-purple">{r.discountPaisa > 0 ? `৳${(r.revenuePaisa / r.discountPaisa).toFixed(1)}` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-body-soft py-10 border-t border-lavender-deep">No redemptions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= COUPONS (live slice of the same engine) ================= */
export function OffersCouponsLive() {
  const [rows, setRows] = useState<ApiOffer[] | null>(null);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    void (async () => {
      /*  Same rule as Overview above: unreachable is unreachable. It used to
          fill the table with invented codes, which is worse than an empty
          screen — somebody would have read a code out to a customer.  */
      const r = await listOffersSafe();
      if (r === null) { setDemo(true); setRows([]); }
      else { setDemo(false); setRows(r.filter((o) => o.mechanism === "COUPON")); }
    })();
  }, []);

  return (
    <div className="px-6 md:px-8 pt-7 pb-16 max-w-[1150px]">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead eyebrow="Offers & Promotions · coupons" title="Coupon codes">
          All your coupon codes at a glance.
        </PageHead>
        {demo && <DemoBadge />}
      </div>
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3">Code</th>
              <th className="text-left font-medium px-4 py-3">Offer</th>
              <th className="text-left font-medium px-4 py-3">Benefit</th>
              <th className="text-left font-medium px-4 py-3">State</th>
              <th className="text-right font-medium px-4 py-3">Redeemed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((o) => (
              <tr key={o.id} className="border-t border-lavender-deep hover:bg-lavender/60">
                <td className="px-4 py-3"><span className="font-mono font-bold text-purple bg-lavender border border-dashed border-orchid-mid rounded-[7px] px-2 py-0.5 text-[12px]">{o.code}</span></td>
                <td className="px-4 py-3 font-medium text-purple">{o.name}</td>
                <td className="px-4 py-3">{benefitText(o)}</td>
                <td className="px-4 py-3"><LiveChip s={o.liveState} /></td>
                <td className="px-4 py-3 text-right">{o.redeemedCount}</td>
                <td className="px-4 py-3 text-right"><Link href={`/marketing/offers/${o.id}`} className="text-[13px] font-medium text-orchid hover:text-purple">Edit</Link></td>
              </tr>
            ))}
            {rows !== null && rows.length === 0 && <tr><td colSpan={6} className="text-center text-body-soft py-10 border-t border-lavender-deep">No coupon offers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

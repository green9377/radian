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
import { Said, useSay } from "./Said";
import { useAuth } from "./AuthGate";
import Icon from "./Icon";
import ProductThumb from "./ProductThumb";
/*  The house ⓘ — one implementation, shared with every other swept screen.  */
import { Info } from "./ItemEditor";
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

/*  ── Owner, 24 Aug 2026 · the whole width, and no loose text ──────────────
    *"offer and promotion ar sob gula page pura page a design hoy nai — pura
    page jure sundor kre design kro. ar field gula page a joto text ache
    agula remove kro ba icon ar maje dukaia daw."*

    Two faults, both real.

    WIDTH. These pages were capped at 1500 / 1150 / 860px while every screen
    swept in Phase 3 uses the house wrapper — full width with padding that
    grows on a big monitor. On his screen the Offers table stopped two-thirds
    of the way across and the rest was empty lavender.

    TEXT. Every page carried a grey sentence under its heading, and half the
    fields explained themselves in brackets — "Priority (higher wins ties)",
    "Starts (blank = now)". House rule 17: a screen says WHAT a thing is; WHY
    lives behind the small ⓘ, there for whoever wants it and silent for
    everyone else.                                                           */
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
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

/**
 * A field label. `tip` opens the ⓘ beside it.
 *
 * ⚠️ The label says WHAT the field is and nothing else. Everything that used
 * to live in brackets after the name — "(higher wins ties)", "(blank = now)",
 * "(3–24, A–Z 0–9 - _)" — is a `tip` now.
 */
function Guide({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.04em] uppercase text-body-soft mb-1.5">
      {children}
      {tip && <Info text={tip} />}
    </span>
  );
}

/**
 * The page heading. `tip` is the ⓘ where the grey sentence used to be.
 *
 * ⚠️ There is no `children` any more, deliberately: leaving the door open is
 * how six pages each grew a paragraph. If a page needs to explain itself,
 * that explanation goes in `tip`.
 */
function PageHead({ eyebrow, title, tip }: { eyebrow: string; title: string; tip?: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
        <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
        {eyebrow}
      </div>
      <h1 className="font-display text-[28px] text-purple mt-1.5 mb-0 leading-tight flex items-center gap-2.5">
        {title}
        {tip && <Info text={tip} />}
      </h1>
    </div>
  );
}

/*  The count strip, in the house shape (TagsView · Badge rules · Brands):
    brand colours only, a coloured spine down the left, the icon in a tinted
    square, the number large. Never a rainbow — the owner, 22 Aug:
    *"color jen amder brand color ar maje hoy."*  */
type Stat = { n: number | string; l: string; c: string; edge: string; bg: string; icon: string; tip?: string };

/*  ⚠️ Written out, never interpolated. Tailwind reads the source as TEXT to
    decide which classes to build, so `xl:grid-cols-${n}` produces a class name
    that exists in the HTML and in no stylesheet — the cards silently stack in
    one column and it looks like a layout mistake rather than a missing class.  */
const COLS: Record<number, string> = {
  1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3",
  4: "xl:grid-cols-4", 5: "xl:grid-cols-5",
};

function StatCards({ items }: { items: Stat[] }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 ${COLS[Math.min(items.length, 5)] ?? "xl:grid-cols-4"} gap-3.5 mb-6`}>
      {items.map((k, i) => (
        <div
          key={i}
          className="relative rounded-[16px] border border-white/70 shadow-soft overflow-hidden px-4 py-3.5"
          style={{ background: `linear-gradient(150deg,${k.bg},#ffffff 130%)` }}
        >
          <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: k.edge }} />
          <div className="flex items-center justify-between gap-2">
            <span
              className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-white shrink-0"
              style={{ background: k.edge, boxShadow: `0 3px 9px ${k.edge}45` }}
            >
              <Icon name={k.icon} size={14} />
            </span>
            {k.tip && <Info text={k.tip} />}
          </div>
          <div className="font-display text-[27px] leading-none mt-3 tabular-nums" style={{ color: k.c }}>{k.n}</div>
          <div className="text-[12px] font-semibold mt-1.5" style={{ color: k.c, opacity: 0.65 }}>{k.l}</div>
        </div>
      ))}
    </div>
  );
}

/*  The brand family — deep purple, orchid, rose gold, soft purple. Green and
    amber are kept ONLY where they carry a meaning money screens already use
    (live / waiting), never as decoration.  */
const P = { c: "#470066", edge: "#6d3a9c", bg: "#f3ebf8" };
const O = { c: "#8b3fb0", edge: "#cf43ea", bg: "#f7eafc" };
const R = { c: "#a4566a", edge: "#c9788a", bg: "#fbeef0" };
const S = { c: "#5c3b8a", edge: "#8b6fc4", bg: "#efebf9" };
const GO = { c: "#0f7d55", edge: "#1d9d77", bg: "#e8f6ef" };
const AM = { c: "#b45309", edge: "#d99026", bg: "#fff4e2" };
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
  const say = useSay();
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
    try { await offerAction(o.id, a); await load(); } catch (e) { say.fromError(e, "That did not go through."); }
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
    } catch (e) { say.fromError(e, "That did not go through."); }
    setBusy(null);
  };

  return (
    <div className={WRAP}>
      <Said say={say} />
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <PageHead
          eyebrow="Offers & Promotions · engine"
          title="All Offers"
          tip="Every discount, coupon and cashback the shop is running, in one place. An offer only reaches a customer once it is Active — and only shows on a product page if it has a Benefit line written on it."
        />
        <div className="flex items-center gap-3">
          {demo && <DemoBadge />}
          <Link href="/marketing/offers/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-bold px-5 py-3 rounded-full inline-flex items-center gap-2 shadow-soft transition-colors"><Icon name="plus" size={18} /> New Offer</Link>
        </div>
      </div>

      <StatCards
        items={[
          { n: kpi.active, l: "Active now", ...GO, icon: "bolt", tip: "Running on the shop this minute." },
          { n: kpi.scheduled, l: "Scheduled", ...AM, icon: "clock", tip: "Saved with a start date in the future. They switch themselves on." },
          { n: kpi.pending, l: "Needs approval", ...R, icon: "shield", tip: "A discount deep enough to need a manager's sign-off before it can go live. The threshold is on Settings." },
          { n: kpi.coupons, l: "Coupons live", ...O, icon: "tag", tip: "Offers that need the customer to type a code. The rest apply themselves." },
          { n: kpi.redeemed, l: "Redemptions", ...P, icon: "chart", tip: "How many times an offer has actually come off an order, all time." },
        ]}
      />

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

      {/*  ⚠️ `overflow-x-auto` on the wrapper, not the card: the table is wide
           and the PAGE must never scroll sideways. Inside its own box it can.  */}
      <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-purple text-[11px] uppercase tracking-[0.05em]" style={{ background: `linear-gradient(135deg,${P.bg},#ffffff)` }}>
              <th className="text-left font-bold px-4 py-3.5">Offer</th>
              <th className="text-left font-bold px-4 py-3.5">Type</th>
              <th className="text-left font-bold px-4 py-3.5">Benefit</th>
              <th className="text-left font-bold px-4 py-3.5">Code</th>
              <th className="text-left font-bold px-4 py-3.5">State</th>
              <th className="text-left font-bold px-4 py-3.5">
                <span className="inline-flex items-center gap-1.5">Prio <Info text="When two offers are worth the same, the higher number wins." /></span>
              </th>
              <th className="text-left font-bold px-4 py-3.5">Redeemed</th>
              <th className="px-4 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-lavender/70 border-t border-lavender-deep transition-colors">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-purple leading-snug">{o.name}</div>
                  <div className="text-body-soft text-[11.5px]">{o.offerNo}{o.internalNote ? ` · ${o.internalNote}` : ""}</div>
                  {o.belowCostFlag && <div className="text-[11px] text-[#b45309] font-semibold mt-0.5">⚠ below-cost somewhere in target</div>}
                  {/*  ⚠️ The whole reason the owner asked. An offer with no
                       wording is live and invisible, and until now the list
                       showed it exactly like one that works — same green
                       Active chip, same everything.  */}
                  {!o.publicTitle?.trim() && !o.benefitLine?.trim() && (o.liveState === "active" || o.liveState === "scheduled") && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full" style={{ background: AM.bg, color: AM.c }}>
                      <Icon name="eye" size={11} /> not shown on the shop
                    </span>
                  )}
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
      </div>
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
    /*  ⚠️ ONE CONFIRM, AND ONLY ON THE CASE THAT IS ALMOST ALWAYS A MISTAKE.
        Submitting with no wording puts a live discount on the shop that the
        shop cannot mention. The owner lost two offers to it before anybody
        noticed, so it is worth a click — but it is NOT blocked: a silent
        discount is a legitimate thing to want, and refusing to save it would
        be inventing a rule he never asked for.  */
    if (submit && !form.publicTitle.trim() && !form.benefitLine.trim()) {
      const go = confirm(
        "This offer has no Benefit line, so nothing about it will appear on the shop.\n\n" +
          "It will still take the discount off the bill — customers just will not be told it exists.\n\n" +
          "Go live anyway?",
      );
      if (!go) return;
    }
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
      <PageHead
        eyebrow="Offers & Promotions · engine"
        title={isNew ? "New offer" : `Edit — ${form.name || "offer"}`}
        tip="Save draft keeps it private. Submit puts it live — unless the discount is deep enough to need a manager's sign-off, and then it waits on Approvals. Whatever you write in Benefit line is what the shop shows; leave it blank and the discount still comes off the bill, but no customer is ever told about it."
      />

      {offer && offer.liveState !== "draft" && (
        <div className="mt-4"><LiveChip s={offer.liveState} />{offer.approvedBy && <span className="text-[12.5px] text-body-soft ml-2">approved by {offer.approvedBy}</span>}</div>
      )}
      {err && <div className="mb-4 text-[13px] font-semibold text-[#b91c1c] bg-[#fdecec] border border-[#f5c6c6] rounded-[12px] px-4 py-3">{err}</div>}

      {/*  The preview column grows with the screen now (340 → 400px) and the
           form takes the rest. On a wide monitor the two cards used to sit in
           the left two-thirds with a lake of empty page beside them.  */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_400px] gap-5 items-start mt-5">
        <div className="flex flex-col gap-5 min-w-0">
          {/* basics */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3.5">Basics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide tip="Only you and your staff see this. Name it so you can find it in six months — the customer is told by Public title and Benefit line further down.">Internal name *</Guide><input className="ipt" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Anniversary Roses Week" /></div>
              <div><Guide tip="A note to yourself — why this offer exists, who asked for it. Never shown to a customer.">Internal note</Guide><input className="ipt" value={form.internalNote} onChange={(e) => set({ internalNote: e.target.value })} /></div>
            </div>
          </div>

          {/* mechanism + shape */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Mechanism &amp; Shape</h3>
            <Guide tip="Automatic comes off the bill by itself. Coupon waits for the customer to type a code — good for a campaign you want to track, or a code you give to one group of people.">Mechanism</Guide>
            <div className="inline-flex bg-lavender rounded-[11px] p-1 gap-1 mb-4">
              {([{ l: "Automatic (auto-applies)", v: "AUTOMATIC" }, { l: "Coupon (needs code)", v: "COUPON" }] as const).map((mm) => (
                <button key={mm.v} onClick={() => set({ mechanism: mm.v })} className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-[9px] transition-colors ${form.mechanism === mm.v ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}>{mm.l}</button>
              ))}
            </div>
            <Guide tip="What the offer is allowed to touch. The greyed-out ones are shapes the engine cannot pay out yet, so they cannot be picked — an offer the checkout could never honour is worse than no offer.">Shape</Guide>
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
              <div className="mt-4"><Guide tip="Sub-categories are included. Pick Fresh flower and every rose under it is covered.">Target category</Guide>
                <select className="ipt max-w-[320px]" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">— pick a category —</option>
                  {cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            )}
            {form.shape === "PRODUCT" && (
              <div className="mt-4">
                <Guide tip="Only these products. Nothing else in the shop is touched, however similar.">Target products</Guide>
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
                      <button
                        key={p.id}
                        onClick={() => { if (!form.productIds.includes(p.id)) { set({ productIds: [...form.productIds, p.id] }); setProdNames((n) => ({ ...n, [p.id]: p.name })); } setProdQ(""); }}
                        className="flex w-full items-center gap-2.5 text-left text-[13px] px-3 py-2 hover:bg-lavender/60"
                      >
                        {/*  The photo, like every other product list (owner,
                            24 Aug 2026) — picking the right bouquet out of six
                            similar names is guesswork without it.  */}
                        <ProductThumb slug={p.slug} imageUrl={p.images?.[0]?.url} size={28} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.shape === "PAYMENT" && (
              <div className="mt-4"><Guide tip="The offer appears only when the customer chooses this way of paying — the bKash-style cashback shape.">Payment method</Guide>
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
              <div className="flex items-center gap-2.5 text-[13px] font-bold" style={{ color: GO.c }}>
                <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white" style={{ background: GO.edge }}><Icon name="truck" size={13} /></span>
                Delivery is free on this offer
                <Info text="No discount fields — this shape waives the delivery charge instead. Use Min spend below if it should only unlock above a certain order value." />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Guide tip="Percent scales with the basket. Flat takes the same taka off whatever they buy.">Discount type</Guide>
                  <select className="ipt" value={form.discountType} onChange={(e) => set({ discountType: e.target.value as ApiOfferDiscountType })}>
                    <option value="PERCENT">Percent %</option><option value="FLAT">Flat ৳</option>
                  </select>
                </div>
                {form.discountType === "PERCENT"
                  ? <div><Guide tip="20 means twenty percent off.">Percent</Guide><input className="ipt" value={form.discountPct} onChange={(e) => set({ discountPct: e.target.value })} /></div>
                  : <div><Guide tip="Taka off the order.">Amount</Guide><input className="ipt" value={form.discountTk} onChange={(e) => set({ discountTk: e.target.value })} /></div>}
                <div><Guide tip="The ceiling on a percent offer. 20% with a ৳500 cap never gives away more than ৳500, however big the basket. Blank means no ceiling.">Max discount cap</Guide><input className="ipt" value={form.maxDiscountTk} onChange={(e) => set({ maxDiscountTk: e.target.value })} placeholder="No cap" /></div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3.5">
              <div><Guide tip="The order has to reach this before the offer unlocks. On a free-delivery offer this IS the rule — free delivery over ৳3,000.">Min spend</Guide><input className="ipt" value={form.minSpendTk} onChange={(e) => set({ minSpendTk: e.target.value })} placeholder="None" /></div>
              <div><Guide tip="How many times one customer may use it. Blank is unlimited.">Per-customer limit</Guide><input className="ipt" value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} placeholder="Unlimited" /></div>
              <div><Guide tip="How many times it may be used by everybody together, then it stops itself. Blank is unlimited.">Total limit</Guide><input className="ipt" value={form.totalLimit} onChange={(e) => set({ totalLimit: e.target.value })} placeholder="Unlimited" /></div>
            </div>
          </div>

          {/* coupon */}
          {form.mechanism === "COUPON" && (
            <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
              <h3 className="font-display text-[16px] text-purple m-0 mb-3">Coupon Code</h3>
              <div><Guide tip="What the customer types at checkout. 3 to 24 characters, letters, numbers, dash or underscore. It is stored in capitals whatever you type.">Code</Guide><input className="ipt font-mono font-bold max-w-[240px]" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="ROSES12" /></div>
            </div>
          )}

          {/* schedule + stacking */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Schedule · Stacking · Display</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide tip="Leave blank to start the moment it goes live. A future date parks it as Scheduled and it switches itself on.">Starts</Guide><input type="datetime-local" className="ipt" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></div>
              <div><Guide tip="Leave blank and it runs until you pause it. A past date is how an offer quietly stops.">Ends</Guide><input type="datetime-local" className="ipt" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
              <div><Guide tip="Off means one offer at a time — the customer gets whichever is worth most, and free delivery counts at the delivery fee. On lets this one stack with a coupon.">Combine with others</Guide><div className="pt-1.5"><Toggle on={form.combinable} onChange={(v) => set({ combinable: v })} /></div></div>
              <div><Guide tip="Only used when two offers are worth exactly the same. The higher number wins.">Priority</Guide><input className="ipt" value={form.priority} onChange={(e) => set({ priority: e.target.value })} /></div>
              <div><Guide tip="Shows a running-out counter on the shop. It is decoration — it changes no price and stops nothing.">Scarcity counter</Guide><div className="pt-1.5"><Toggle on={form.scarcity} onChange={(v) => set({ scarcity: v })} /></div></div>
            </div>
          </div>

          {/* storefront copy */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft px-5 py-5">
            {/*  ⚠️ THE NAME MATTERS AND I TOOK IT OFF ONCE. This card was
                 headed "Storefront Copy (Hormozi stack)". Clearing loose text
                 off the screen, I renamed it and deleted the only label that
                 said what the four boxes below are FOR — they are not four
                 stray text fields, they are the offer stack DEC-OFR-007 put
                 on the Offer on purpose. Put back, with the plain words
                 first and the framework named after them.  */}
            <h3 className="font-display text-[16px] text-purple m-0 mb-3.5 flex items-center gap-2">
              What the customer reads
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-orchid bg-orchid-soft px-2 py-[3px] rounded-full">Hormozi stack</span>
              <Info text="Everything on this card is shown on the shop; nothing above it is. The four boxes are an offer stack, not loose text: name it, say the outcome, pile on bonuses that answer the next objection, then take the risk off them with a guarantee. Products → Offers → Templates builds all four for you." />
            </h3>
            {/*  The same truth as the preview, said where the empty box is —
                 a warning on the other side of the screen is a warning in the
                 wrong place.  */}
            {!form.publicTitle.trim() && !form.benefitLine.trim() && (
              <div className="flex items-start gap-2.5 rounded-[12px] px-3.5 py-2.5 mb-4 text-[12.5px] font-semibold" style={{ background: AM.bg, color: AM.c }}>
                <span className="shrink-0 mt-[1px]"><Icon name="alert" size={15} /></span>
                <span>Fill in <b>Benefit line</b> or this offer never appears on the shop — it will discount the bill in silence.</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div><Guide tip="The offer's headline on the shop. Used when Benefit line is empty.">Public title</Guide><input className="ipt" value={form.publicTitle} onChange={(e) => set({ publicTitle: e.target.value })} /></div>
              <div><Guide tip="⚠ THE ONE THAT MATTERS. This exact sentence is what a customer reads under Offers Available on the product page. Leave this AND Public title blank and the discount still comes off the bill — but nothing is ever shown, so nobody knows to buy.">Benefit line</Guide><input className="ipt" value={form.benefitLine} onChange={(e) => set({ benefitLine: e.target.value })} /></div>
            </div>
            <div className="mt-3.5"><Guide tip="A longer line under the offer, on the shop. Optional.">Description</Guide><textarea className="ipt" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
            <div className="mt-3.5">
              <Guide tip="Small ticked extras listed with the offer — a free card, a gift note. They are wording only; they add nothing to the order by themselves.">Bonus lines</Guide>
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
            <div className="mt-3.5"><Guide tip="The reassurance under the offer, in your own words.">Guarantee line</Guide><input className="ipt" value={form.guaranteeText} onChange={(e) => set({ guaranteeText: e.target.value })} placeholder="Fresh-on-arrival or we re-deliver free" /></div>
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
          {/*  ── THE PREVIEW USED TO LIE — 24 Aug 2026 ──────────────────────
               The owner made three offers and only one reached the shop:
               *"offer create krlm 3 ta but show kre akta frontend a."*

               Two of them had Public title and Benefit line empty, and the
               shop only ever prints those (`product-detail.ts` drops an offer
               with no wording — a nameless badge is not an offer). So they
               discounted the bill and told nobody.

               That part is by design. What was NOT is this panel: with both
               boxes blank it fell back to the INTERNAL name and made up a
               benefit line out of the percentage, drawing a complete, healthy
               card. The one screen whose whole job is "here is what the
               customer sees" was showing him something no customer would ever
               see. He did not miss a warning — he was actively reassured.

               It now shows the truth, and it is the loudest thing on the
               page.                                                          */}
          {!form.publicTitle.trim() && !form.benefitLine.trim() ? (
            <div className="rounded-[28px] border-[1.5px] border-dashed p-5 text-center" style={{ borderColor: AM.edge, background: AM.bg }}>
              <span className="w-[38px] h-[38px] rounded-[12px] grid place-items-center text-white mx-auto" style={{ background: AM.edge }}>
                <Icon name="eye" size={18} />
              </span>
              <div className="font-display text-[16px] mt-3 mb-1.5" style={{ color: AM.c }}>Nothing will be shown</div>
              <div className="text-[12.5px] leading-relaxed" style={{ color: AM.c }}>
                The discount still comes off the bill — but with no <b>Benefit line</b> the shop
                has nothing to print, so no customer is ever told this offer exists.
              </div>
            </div>
          ) : (
          <div className="rounded-[28px] border border-lavender-deep bg-gradient-to-b from-[#fbf5ff] to-[#f4ecfa] p-4">
            <div className="relative bg-white border border-[#efe1f6] rounded-[20px] p-4 shadow-soft overflow-hidden">
              <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orchid to-rosegold" />
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.03em] text-[#a021b8] bg-orchid-soft px-2.5 py-1 rounded-full">{form.mechanism === "COUPON" ? "Coupon" : "Automatic"} · {SHAPES_LIVE.find((s) => s.val === form.shape)?.label}</span>
              {/*  ⚠️ `form.name` is NOT a fallback here any more. The internal
                   name never reaches a customer, and printing it in a preview
                   is how two live offers looked fine and showed nothing.  */}
              <h3 className="font-display text-[18px] text-purple mt-3 mb-1.5 leading-tight">{form.publicTitle || form.benefitLine}</h3>
              <div className="text-[14.5px] font-bold text-orchid mb-1.5">
                {form.benefitLine || form.publicTitle}
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
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= APPROVALS (live) ================= */
export function OffersApprovalsLive() {
  const say = useSay();
  const { me } = useAuth();
  const [queue, setQueue] = useState<ApiOffer[] | null>(null);
  const [demo, setDemo] = useState(false);
  const load = useCallback(async () => {
    try { setQueue(await offersApprovals()); setDemo(false); } catch { setQueue([]); setDemo(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /*  ⚠️ WHO APPROVED IT IS NOT SOMETHING TO TYPE — 31 Aug 2026.

      This asked `prompt("Your name (audited)", "Admin")`. An AUDITED approval
      whose signature is free text with "Admin" already filled in is not an
      audit trail: pressing Enter signs somebody else's name, and nobody can
      ever say who let that discount through. The session knows who is signed
      in; that is the only honest answer, and it is the same name every other
      audited action in the admin already records.  */
  const act = async (o: ApiOffer, verdict: "approve" | "decline") => {
    try {
      await offerAction(o.id, verdict, { actorName: me?.name ?? "Admin" });
      await load();
      say.good(`"${o.name}" ${verdict === "approve" ? "approved" : "declined"}.`);
    } catch (e) { say.fromError(e, `Could not ${verdict} that offer.`); }
  };

  return (
    <div className={WRAP}>
      <Said say={say} />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead
          eyebrow="Offers & Promotions · approvals"
          title="Approvals"
          tip="An offer deep enough to sell below cost stops here instead of going live. Approve it and it starts; decline and it goes back to the person who wrote it as a draft. The depth that triggers this is set on Settings."
        />
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
  const say = useSay();
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
    } catch (e) { say.fromError(e, "That did not go through."); }
  };

  return (
    <div className={WRAP}>
      <Said say={say} />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead
          eyebrow="Offers & Promotions · settings"
          title="Settings"
          tip="The two rules every new offer starts from. They are yours to change — nothing here is fixed in the code."
        />
        {demo && <DemoBadge />}
      </div>
      {/*  ⚠️ Two settings on a page this wide need a SHAPE, not just room.
           Stretched across one card they were two controls marooned in white
           — full width and still nothing to look at, which is the fault one
           step on rather than fixed. They are cards now, sized to what they
           hold, exactly like Products → Badge rules.  */}
      {loaded && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 mt-5">
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
              <Guide tip="A percent this high or above cannot go live on its own — it waits on Approvals for a manager. Set it to the deepest discount you are happy for staff to publish without being asked.">Approval threshold</Guide>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="ipt tabular-nums font-semibold text-[17px]"
                  style={{ minHeight: 42, maxWidth: 110 }}
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(e.target.value)}
                />
                <span className="text-[13px] font-semibold text-body-soft">% or deeper needs a sign-off</span>
              </div>
            </div>

            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
              <Guide tip="Whether a brand-new offer starts life able to stack with others. Off is the safe answer: one offer at a time, and the customer gets whichever is worth most — free delivery counted at the delivery fee.">New offers combine by default</Guide>
              <div className="flex items-center gap-3" style={{ minHeight: 42 }}>
                <Toggle on={defCombinable} onChange={setDefCombinable} />
                <span className="text-[13px] font-semibold" style={{ color: defCombinable ? GO.c : "#8b7a99" }}>
                  {defCombinable ? "They can stack" : "One offer at a time"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button onClick={save} className="bg-purple hover:bg-purple-deep text-white text-[14px] font-bold px-6 py-3 rounded-full inline-flex items-center gap-2 shadow-soft"><Icon name="check" size={16} /> Save settings</button>
            {saved && <span className="text-[13px] font-semibold text-[#0f7d55]">Saved ✓</span>}
          </div>
        </>
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
        <PageHead
          eyebrow="Offers & Promotions"
          title="Overview"
          tip="The last 30 days: which offers earned and which gave money away. Zero is shown as zero — this page never fills itself with examples."
        />
        <Link href="/marketing/offers/list" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-bold px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft"><Icon name="plus" size={16} /> All offers</Link>
      </div>

      {err && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] font-semibold">
          {err}
        </div>
      )}

      <StatCards
        items={[
          { n: String(totals.redemptions), l: "Redemptions · 30d", ...P, icon: "chart", tip: "How many orders in the last 30 days had an offer come off them." },
          { n: taka(totals.revenuePaisa), l: "Revenue with offers · 30d", ...GO, icon: "cash", tip: "What those orders were worth after the discount — money that came in." },
          { n: taka(totals.discountPaisa), l: "Discount given · 30d", ...AM, icon: "tag", tip: "What the offers cost you. Read it against the revenue beside it, never on its own." },
          { n: String(totals.newCustomers), l: "New customers via offers", ...O, icon: "users", tip: "People whose FIRST order carried an offer. This is what a discount is really for." },
        ]}
      />

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="px-4 py-3.5 text-[11px] uppercase tracking-[0.05em] text-purple font-bold flex items-center gap-2" style={{ background: `linear-gradient(135deg,${P.bg},#ffffff)` }}>
          Leaderboard <Info text="Ordered by what each offer gave away against what it brought in. An offer near the bottom is costing more than it earns." />
        </div>
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
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <PageHead
          eyebrow="Offers & Promotions · coupons"
          title="Coupon codes"
          tip="Every offer that needs a code typed at checkout. Automatic offers are not here — they are on All Offers."
        />
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

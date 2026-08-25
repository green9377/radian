"use client";

/*
  Returns & Refunds — admin views.
  Architecture: RADIAN_RETURNS_MODULE_ARCHITECTURE.md (locked 23 Jul 2026, DEC-RTN-005..015).

  Post-delivery grievance → resolution. Staff-initiated only (never customer-direct).
  Refund payout NEVER exceeds what was collected. Restock flows through Inventory
  (SALE_RETURN). Order.salesStatus is never mutated — a return is its own document.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ErrBar, OkBar, msg } from "./ItemUI";
import {
  listReturns, returnAnalytics, getReturn, getReturnTimeline,
  eligibleOrderForReturn, createReturn, approveReturn, rejectReturn, cancelReturn,
  completeReturn,
  repostReturnRestock, deleteReturn, getReturnReasons, createReturnReason, updateReturnReason,
  deleteReturnReason, getReturnSettings, updateReturnSettings, getCustomerCredit, listOrders, formatTaka,
  getCancelRules, saveCancelRules,
  posCatalogue, type ApiPosCatalogueRow,
  RETURN_STATUS_META, RESOLUTION_LABEL,
  type ApiReturn, type ReturnAnalytics, type EligibleOrder, type ApiReturnReason,
  type ReturnSettings, type ReturnResolution, type ReturnRefundMethod, type ReturnRestockAction,
  type ReturnStatus, type ApiOrder,
} from "../_data/api";
import { RefundDialog, usePaymentMethods, type PayOption } from "./MoneyBlock";
/*  DEC-SAL-013 — the cancellation refund ladder, and the house info dot.  */
import { Info } from "./ItemEditor";

/*  DEC-GBL-001 — ORIGINAL and STORE_CREDIT are rules, not tills, so they are
    always offered; the real doors come from the shop's own list.  */
const REFUND_TENDERS = ["CASH", "BKASH", "NAGAD", "CARD", "BANK"];
function useRefundMethods(): ReturnRefundMethod[] {
  const live = usePaymentMethods(REFUND_TENDERS);
  return ["ORIGINAL", ...live.map((m) => m.id as ReturnRefundMethod), "STORE_CREDIT"];
}
/*  the payout dialog needs the accounts too (DEC-GBL-006): "which bKash number
    did the money go back out of" is the same question as taking it in.  */
function usePayoutOptions(): PayOption[] {
  const live = usePaymentMethods(REFUND_TENDERS);
  return [
    { id: "ORIGINAL", label: "Original method" },
    ...live,
    { id: "STORE_CREDIT", label: "Store credit" },
  ];
}
const RESOLUTIONS: ReturnResolution[] = ["REFUND", "REPLACEMENT", "PARTIAL_COMPENSATION", "STORE_CREDIT"];

function StatusPill({ status }: { status: ReturnStatus }) {
  const m = RETURN_STATUS_META[status];
  return (
    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full justify-self-start"
      style={{ background: m.tone + "22", color: m.tone }}>{m.label}</span>
  );
}

const NewBtn = () => (
  <Link href="/returns/new"
    className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
    style={{ background: ACCENT }}>
    <Icon name="plus" size={13} /> New return
  </Link>
);

/* ================================================================== OVERVIEW / LIST */

/*  DEC-RTN-016 — ONE BOOK, THREE DOORS (owner, 17 Aug 2026).

    The panel is arranged by what a thing belongs to, so Returns appears under
    the website (online orders) AND under the counter (POS sales). What it does
    NOT do is split the data: there is still one SalesReturn table, one set of
    numbers, one place a refund is recorded. `?channel=` only narrows the list
    the way a search box does.

    The KPI strip therefore always shows the WHOLE 30 days, on every door. That
    is deliberate and is the whole reason the owner asked for this shape: "amder
    total calculation jen sob ak jaygay hoy". A door that quietly changed the
    totals would be two books wearing one name.  */
const DOORS = {
  online: {
    eyebrow: "Website · Returns",
    title: "Returns from online orders",
    blurb: "Returns raised against website and courier orders. Same book as the counter's returns — this door only hides the rest (DEC-RTN-016).",
  },
  counter: {
    eyebrow: "Shop · Returns",
    title: "Returns from counter sales",
    blurb: "Returns raised against POS walk-in sales. Same book as the website's returns — this door only hides the rest (DEC-RTN-016).",
  },
} as const;

export function ReturnsOverview() {
  const params = useSearchParams();
  const raw = params.get("channel");
  const channel = raw === "online" || raw === "counter" ? raw : undefined;
  const door = channel ? DOORS[channel] : null;

  const [rows, setRows] = useState<ApiReturn[]>([]);
  const [stats, setStats] = useState<ReturnAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const [list, an] = await Promise.all([
        listReturns({ search: search || undefined, status: status || undefined, channel }),
        returnAnalytics(30),
      ]);
      setRows(list.items);
      setStats(an);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, channel]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow={door?.eyebrow ?? "Commerce · Returns & Refunds"}
        title={door?.title ?? "Returns & Refunds"}
        blurb={door?.blurb ?? "Post-delivery returns — staff-initiated only. Refunds never exceed what was collected; returned goods restock through Inventory. Order status stays untouched (DEC-RTN)."}
        right={<NewBtn />}
      />
      {failed && <DemoBar what="returns (API offline?)" onRetry={load} />}

      {/*  The way OUT of a filtered door, always visible. Without it the only
          escape from a narrowed list is the sidebar, and a person who arrived
          by link would never learn the rest of the book exists.  */}
      {door && (
        <Link href="/returns"
          className="inline-flex items-center gap-1.5 mb-4 text-[13px] font-semibold" style={{ color: ACCENT }}>
          ← See every return, both doors together
        </Link>
      )}

      {stats && (
        <Kpi items={[
          /*  Named "All returns" behind a door so nobody reads the strip as the
              door's own count. The figure is the same on every door on purpose. */
          { l: door ? "All returns (30d)" : "Returns (30d)", v: stats.count, c: "#470066", bg: "#f5eafb", icon: "box" },
          { l: "Needs approval", v: stats.pending, c: "#c77700", bg: "#fff4e6", icon: "bolt" },
          { l: "Refunded", v: formatTaka(stats.refundPaisa), c: "#c0392b", bg: "#fdecea", icon: "cash" },
          { l: "Store credit", v: formatTaka(stats.storeCreditPaisa), c: "#2563eb", bg: "#eaf1fd", icon: "star" },
          { l: "Return value", v: formatTaka(stats.returnValuePaisa), c: "#0e7a3d", bg: "#e8f7ef", icon: "tag" },
        ]} />
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input className="ipt max-w-[280px]" placeholder="Search RTN / order / customer…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()} />
        <select className="ipt max-w-[190px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(Object.keys(RETURN_STATUS_META) as ReturnStatus[]).map((s) =>
            <option key={s} value={s}>{RETURN_STATUS_META[s].label}</option>)}
        </select>
        <button className="text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep" onClick={load}>Search</button>
      </div>

      <DataTable head={
        <div className="grid grid-cols-[130px_1fr_140px_120px_130px_110px] gap-3 px-4 py-2.5 text-[12px] font-semibold">
          <span>Return</span><span>Customer / Order</span><span>Resolution</span>
          <span className="text-right">Value</span><span className="text-right">Refunded</span><span>Status</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && rows.length === 0 &&
          <div className="px-4 py-6 text-[13px] text-body-soft">No returns yet. Start one from a delivered order.</div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/returns/${r.id}`}
            className="grid grid-cols-[130px_1fr_140px_120px_130px_110px] gap-3 px-4 py-3 items-center hover:bg-[#faf6fd]">
            <span className="font-semibold text-[13px]" style={{ color: ACCENT }}>{r.returnNo}</span>
            <span className="text-[13px]">
              <b>{r.customer?.name ?? "—"}</b>
              <span className="text-body-soft"> · {r.order?.orderNo ?? ""}</span>
            </span>
            <span className="text-[12.5px]">{RESOLUTION_LABEL[r.resolution]}</span>
            <span className="text-right text-[13px]">{formatTaka(r.returnValuePaisa)}</span>
            <span className="text-right text-[13px]">
              {r.refundPaisa > 0 ? formatTaka(r.refundPaisa) : "—"}
              {r.storeCreditPaisa > 0 && <span className="text-[11px] text-[#2563eb]"> +{formatTaka(r.storeCreditPaisa)} credit</span>}
            </span>
            <StatusPill status={r.status} />
          </Link>
        ))}
      </DataTable>
    </div>
  );
}

/*  Every word on this page hangs off the thing it explains (owner, 21 Aug:
    "jar je bekkha setar upore click krle show krbe" — not one icon at the top).
    The chip picks; the little circle on it opens that one line, nothing else.  */
const GOODS_LABEL: Record<ReturnRestockAction, string> = {
  RESTOCK: "Back on the shelf",
  WRITE_OFF: "Thrown away",
};
const GOODS_WHY: Record<ReturnRestockAction, string> = {
  RESTOCK: "Still sellable — stock goes up by what comes back.",
  WRITE_OFF: "Damaged or wilted — stock stays as it is and the shop takes the loss.",
};
const SETTLE_LABEL: Record<ReturnResolution, string> = {
  REFUND: "Money back",
  STORE_CREDIT: "Store credit",
  REPLACEMENT: "Replacement",
  PARTIAL_COMPENSATION: "Keeps it, part back",
};
const SETTLE_WHY: Record<ReturnResolution, string> = {
  REFUND: "The money goes back to the customer, never more than what was collected.",
  STORE_CREDIT: "No money leaves — the value waits in the customer's account for next time.",
  REPLACEMENT: "The same goods are sent again. No money moves at all.",
  PARTIAL_COMPENSATION: "The customer keeps the goods and you give back part of the price.",
};

function Choice({ on, title, onPick, open, onInfo }: {
  on: boolean; title: string; onPick: () => void; open: boolean; onInfo: () => void;
}) {
  return (
      <div onClick={onPick} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick()}
        className={"cursor-pointer select-none flex items-center gap-2 rounded-[10px] border pl-3 pr-2 h-[38px] " + (on
          ? "border-orchid-mid bg-lavender text-purple"
          : "border-lavender-deep bg-white text-body-soft hover:border-orchid-mid")}>
        <span className="text-[12.5px] font-medium flex-1 whitespace-nowrap">{title}</span>
        <span role="button" tabIndex={0} aria-label={"What " + title + " means"}
          onClick={(e) => { e.stopPropagation(); onInfo(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onInfo(); } }}
          className={"w-[19px] h-[19px] rounded-full text-[11px] font-bold leading-[17px] text-center border " + (open
            ? "bg-purple text-white border-purple"
            : "border-lavender-deep text-body-soft hover:border-orchid-mid")}>i</span>
      </div>
  );
}

/** the one line the little "i" opens, in its own slot under the group */
const Why = ({ text }: { text: string }) =>
  text ? <div className="text-[11.5px] text-body-soft leading-[1.45] mt-1.5">{text}</div> : null;

/* ================================================================== NEW RETURN */

type LineDraft = { checked: boolean; qty: number; restockAction: ReturnRestockAction };
/** DEC-RTN-017 — one line of goods handed over in place of what came back */
type ReplRow = {
  key: string;
  itemId: string | null;
  productId: string | null;
  name: string;
  qty: number;
  unitPaisa: number;
};

export function NewReturn() {
  const router = useRouter();
  const [orderSearch, setOrderSearch] = useState("");
  const [orderHits, setOrderHits] = useState<ApiOrder[]>([]);
  const [el, setEl] = useState<EligibleOrder | null>(null);
  const [reasons, setReasons] = useState<ApiReturnReason[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [reasonId, setReasonId] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [tip, setTip] = useState("");
  const refundMethods = useRefundMethods(); // DEC-GBL-001
  const [newReason, setNewReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");

  /*  a reason list nobody can add to is a list that goes stale (owner, 21 Aug) */
  async function addReason() {
    const label = reasonDraft.trim();
    if (!label) return;
    try {
      const created = await createReturnReason({
        code: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 24),
        label,
      });
      const list = await getReturnReasons();
      setReasons(list);
      setReasonId(created.id);
      setNewReason(false);
      setReasonDraft("");
    } catch (e) { setErr(msg(e, "Could not add that reason")); }
  }
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>("ORIGINAL");
  const [compensationTk, setCompensationTk] = useState("");
  /*  DEC-RTN-017 — what goes back OUT. Starts as the same goods; the staff can
      swap or add. DEC-RTN-018 — and the credit is a decision, not a formula.  */
  const [repl, setRepl] = useState<ReplRow[]>([]);
  const [replTouched, setReplTouched] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [pickHits, setPickHits] = useState<ApiPosCatalogueRow[]>([]);
  const [creditTk, setCreditTk] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { getReturnReasons().then(setReasons).catch(() => {}); }, []);

  /*  Counter bills are orders too (DEC-POS-001) but the online list hides them,
      so searching a POS number found nothing at all (owner, 21 Aug). Returns
      asks for both, and the screen offers the recent ones without a search.  */
  const [returnedIds, setReturnedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    /*  an order that has already been returned still belongs in the list — a
        second line can come back later — but it must SAY so (owner, 21 Aug)  */
    listReturns()
      .then((r) => setReturnedIds(new Set(r.items.map((x) => x.orderId))))
      .catch(() => {});
  }, []);

  const loadOrders = useCallback(async (search?: string) => {
    setErr("");
    try {
      const res = await listOrders({ search, includeCounter: true });
      const done = res.items.filter((o) => o.deliveryStatus === "delivered");
      setOrderHits(done);
      if (search && res.items.length && !done.length)
        setErr("Matching orders found, but none are delivered yet — only delivered orders can be returned.");
      if (search && !res.items.length) setErr("Nothing matches that number, name or phone.");
    } catch (e) { setErr(msg(e, "Could not search orders")); }
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function findOrders() { await loadOrders(orderSearch.trim() || undefined); }

  async function pickOrder(id: string) {
    setErr("");
    try {
      const e = await eligibleOrderForReturn(id);
      setEl(e);
      const d: Record<string, LineDraft> = {};
      for (const l of e.lines)
        d[l.orderLineId] = {
          checked: false,
          qty: l.returnableQty,
          restockAction: l.productType === "CRAFTED" ? "WRITE_OFF" : "RESTOCK",
        };
      setDrafts(d);
    } catch (e) { setErr(msg(e, "Could not load order")); }
  }

  const selectedValue = useMemo(() => {
    if (!el) return 0;
    return el.lines.reduce((s, l) => {
      const d = drafts[l.orderLineId];
      return d?.checked ? s + l.unitPaisa * d.qty : s;
    }, 0);
  }, [el, drafts]);

  /*  the default replacement is the same goods, same count — until someone
      changes it, after which the screen stops second-guessing them  */
  useEffect(() => {
    if (resolution !== "REPLACEMENT" || replTouched || !el) return;
    setRepl(
      el.lines
        .filter((l) => drafts[l.orderLineId]?.checked && drafts[l.orderLineId].qty > 0)
        .map((l) => ({
          key: l.orderLineId,
          itemId: l.itemId ?? null,
          productId: l.itemId ? null : l.productId,
          name: l.name,
          qty: drafts[l.orderLineId].qty,
          unitPaisa: l.unitPaisa,
        })),
    );
  }, [resolution, replTouched, el, drafts]);

  /*  and the credit starts at what the goods are worth  */
  useEffect(() => {
    if (resolution === "STORE_CREDIT") setCreditTk((selectedValue / 100).toString());
  }, [resolution, selectedValue]);

  useEffect(() => {
    if (!pickOpen) return;
    let dead = false;
    posCatalogue(pickSearch.trim() || undefined)
      .then((r) => !dead && setPickHits(r.slice(0, 40)))
      .catch(() => {});
    return () => { dead = true; };
  }, [pickOpen, pickSearch]);

  async function submit() {
    if (!el) return;
    const lines = el.lines
      .filter((l) => drafts[l.orderLineId]?.checked && drafts[l.orderLineId].qty > 0)
      .map((l) => ({
        orderLineId: l.orderLineId,
        qty: drafts[l.orderLineId].qty,
        restockAction: drafts[l.orderLineId].restockAction,
      }));
    if (!lines.length) { setErr("Tick at least one line to return."); return; }
    setBusy(true); setErr("");
    try {
      const created = await createReturn({
        orderId: el.order.id,
        reasonId: reasonId || undefined,
        reasonNote: reasonNote || undefined,
        resolution,
        refundMethod,
        compensationPaisa:
          resolution === "PARTIAL_COMPENSATION" ? Math.round(parseFloat(compensationTk || "0") * 100) : undefined,
        note: note || undefined,
        lines,
        replacements: resolution === "REPLACEMENT"
          ? repl.filter((r) => r.qty > 0).map((r) => ({
              itemId: r.itemId, productId: r.productId, name: r.name, qty: r.qty, unitPaisa: r.unitPaisa,
            }))
          : undefined,
        creditAskPaisa: resolution === "STORE_CREDIT"
          ? Math.round(parseFloat(creditTk || "0") * 100)
          : undefined,
      });
      router.push(`/returns/${created.id}`);
    } catch (e) {
      setErr(msg(e, "Could not create return"));
      /*  the screen was drawn before someone else touched the order — redraw it
          from the server instead of leaving a lie on the page  */
      try { setEl(await eligibleOrderForReturn(el.order.id)); } catch { /* keep the error */ }
      setBusy(false);
    }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Returns & Refunds"
        title="New return"
        right={<Link href="/returns" className="text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep">← Back</Link>}
      />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}

      {!el && (
        <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-5">
          <label className="lbl">Pick the delivered order</label>
          {/*  two ways in, because a counter bill is remembered by its number and a
               website order by the customer's name (owner, 21 Aug)  */}
          <select className="ipt mt-1" value={el ? (el as EligibleOrder).order.id : ""}
            onChange={(e) => e.target.value && pickOrder(e.target.value)}>
            <option value="">Choose from the recent delivered orders…</option>
            {orderHits.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} · {o.customer?.name ?? o.senderName} · {formatTaka(o.totalPaisa)} · {new Date(o.placedAt).toLocaleDateString()}
                {returnedIds.has(o.id) ? " · already returned once" : ""}
              </option>
            ))}
          </select>

          <label className="lbl mt-3">…or search for it</label>
          <div className="flex items-center gap-2 mt-1">
            <input className="ipt" placeholder="Order no (RAD-… or POS-…), customer name or phone"
              value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findOrders()} />
            <button className="text-white text-[13px] px-4 py-2.5 rounded-[10px] shrink-0" style={{ background: ACCENT }} onClick={findOrders}>Search</button>
            {orderSearch && (
              <button className="text-[12.5px] underline shrink-0" onClick={() => { setOrderSearch(""); loadOrders(); }}>Clear</button>
            )}
          </div>

          <div className="mt-3 divide-y divide-lavender-deep">
            {orderHits.map((o) => (
              <button key={o.id} onClick={() => pickOrder(o.id)}
                className="w-full text-left py-2.5 px-1 hover:bg-[#faf6fd] flex items-center justify-between gap-3">
                <span className="text-[13px]">
                  <b style={{ color: ACCENT }}>{o.orderNo}</b> · {o.customer?.name ?? o.senderName}
                  <span className="text-body-soft"> · {o.senderPhone || "—"}</span>
                  {returnedIds.has(o.id) && (
                    <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "#fff4e6", color: "#b45309" }}>already returned once</span>
                  )}
                </span>
                <span className="text-[12px] text-body-soft">{formatTaka(o.totalPaisa)} · paid {formatTaka(o.paidPaisa)}</span>
              </button>
            ))}
            {orderHits.length === 0 && <div className="text-[12.5px] text-body-soft py-3">No delivered order to return yet.</div>}
          </div>
        </div>
      )}

      {el && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* lines */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-lavender-deep flex items-center justify-between">
              <div className="text-[13px]"><b style={{ color: ACCENT }}>{el.order.orderNo}</b> · {el.customer?.name}
                <span className="text-body-soft"> · paid {formatTaka(el.order.paidPaisa)}, refundable up to {formatTaka(el.refundableCap)}</span>
              </div>
              <button className="text-[12px] underline" onClick={() => { setEl(null); setOrderHits([]); }}>Change order</button>
            </div>
            {el.lines.map((l) => {
              const d = drafts[l.orderLineId];
              const disabled = l.returnableQty <= 0;
              const on = !!d?.checked && !disabled;
              return (
                <div key={l.orderLineId} className={`px-4 py-3 border-b border-lavender-deep last:border-0 ${disabled ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1" disabled={disabled} checked={d?.checked ?? false}
                      onChange={(e) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, checked: e.target.checked } }))} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium">{l.name}
                        <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: l.productType === "CRAFTED" ? "#fff4e6" : "#eef", color: l.productType === "CRAFTED" ? "#b45309" : "#3730a3" }}>{l.productType}</span>
                      </div>
                      <div className="text-[12px] text-body-soft">
                        {formatTaka(l.unitPaisa)} each · ordered {l.qty}
                        {l.returnedQty > 0 ? ` · already returned ${l.returnedQty}` : ""}
                        {disabled ? " · nothing left to return" : ""}
                      </div>

                      {on && (
                        <div className="mt-2.5 flex items-end gap-4 flex-wrap">
                          <div>
                            <label className="lbl">How many</label>
                            <div className="flex items-center border border-lavender-deep rounded-[9px] overflow-hidden bg-white" style={{ width: 118 }}>
                              <button type="button" className="w-[32px] h-[36px] text-purple hover:bg-lavender/60"
                                onClick={() => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, qty: Math.max(1, d.qty - 1) } }))}>–</button>
                              <input className="flex-1 min-w-0 h-[36px] text-center text-[13px] font-medium text-purple outline-none border-0"
                                value={d.qty}
                                onChange={(e) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, qty: Math.max(1, Math.min(l.returnableQty, parseInt(e.target.value, 10) || 1)) } }))} />
                              <button type="button" className="w-[32px] h-[36px] text-purple hover:bg-lavender/60"
                                onClick={() => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, qty: Math.min(l.returnableQty, d.qty + 1) } }))}>+</button>
                            </div>
                            <div className="text-[11px] text-body-soft mt-1">of {l.returnableQty}</div>
                          </div>

                          {/*  RESTOCK / WRITE_OFF in words (owner, 21 Aug: "write off
                               mani ki") — and no cut-off dropdown  */}
                          <div>
                            <label className="lbl">The goods</label>
                            <div className="flex items-start gap-1.5">
                              {(["RESTOCK", "WRITE_OFF"] as ReturnRestockAction[]).map((id) => (
                                <Choice key={id} title={GOODS_LABEL[id]}
                                  on={d.restockAction === id}
                                  onPick={() => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, restockAction: id } }))}
                                  open={tip === `${l.orderLineId}:${id}`}
                                  onInfo={() => setTip((t) => (t === `${l.orderLineId}:${id}` ? "" : `${l.orderLineId}:${id}`))} />
                              ))}
                            </div>
                            <Why text={tip.startsWith(`${l.orderLineId}:`)
                              ? GOODS_WHY[tip.slice(l.orderLineId.length + 1) as ReturnRestockAction] : ""} />
                          </div>

                          <div className="ml-auto text-right">
                            <div className="text-[11px] text-body-soft">This line</div>
                            <div className="text-[15px] font-semibold text-purple" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {formatTaka(l.unitPaisa * d.qty)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/*  the resolution rail — plain words instead of PARTIAL_COMPENSATION;
               what each one does to the money lives behind the "?" above  */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-3">
            <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>What happens now</div>

            <div>
              <div className="flex items-center justify-between">
                <label className="lbl">Why is it coming back</label>
                <button type="button" className="text-[11.5px] text-purple underline" onClick={() => setNewReason((v) => !v)}>
                  {newReason ? "Pick from the list" : "+ New reason"}
                </button>
              </div>
              {newReason ? (
                <div className="flex items-center gap-2">
                  <input className="ipt" autoFocus placeholder="Name it — e.g. Wilted on arrival"
                    value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addReason()} />
                  <button type="button" onClick={addReason} disabled={!reasonDraft.trim()}
                    className="text-white text-[12.5px] px-3 py-2.5 rounded-[9px] shrink-0 disabled:opacity-40" style={{ background: ACCENT }}>Add</button>
                </div>
              ) : (
                <select className="ipt" value={reasonId} onChange={(e) => {
                  setReasonId(e.target.value);
                  const r = reasons.find((x) => x.id === e.target.value);
                  if (r) setRefundMethod(r.defaultRefundMethod);
                }}>
                  <option value="">— pick a reason —</option>
                  {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}{r.requiresApproval ? " (needs approval)" : ""}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="lbl">Note</label>
              <input className="ipt" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder="What happened…" />
            </div>

            <div>
              <label className="lbl">How it is settled</label>
              <div className="grid grid-cols-2 gap-1.5 items-start">
                {(["REFUND", "STORE_CREDIT", "REPLACEMENT", "PARTIAL_COMPENSATION"] as ReturnResolution[]).map((id) => (
                  <Choice key={id} title={SETTLE_LABEL[id]}
                    on={resolution === id} onPick={() => setResolution(id)}
                    open={tip === `res:${id}`}
                    onInfo={() => setTip((t) => (t === `res:${id}` ? "" : `res:${id}`))} />
                ))}
              </div>
              <Why text={tip.startsWith("res:") ? SETTLE_WHY[tip.slice(4) as ReturnResolution] : ""} />
            </div>

            {/*  DEC-RTN-017 — a replacement is goods leaving the shop, so the
                 shop has to say which goods  */}
            {resolution === "REPLACEMENT" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="lbl">What goes out instead</label>
                  <button type="button" className="text-[11.5px] text-purple underline"
                    onClick={() => { setPickOpen((v) => !v); setPickSearch(""); }}>
                    {pickOpen ? "Close" : "+ Another item"}
                  </button>
                </div>

                {pickOpen && (
                  <div className="border border-lavender-deep rounded-[10px] p-2 mb-2 bg-[#faf6fd]">
                    <input className="ipt" autoFocus placeholder="Search the counter list…"
                      value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
                    <div className="mt-1.5 max-h-[190px] overflow-y-auto">
                      {pickHits.map((h) => (
                        <button key={h.id} type="button"
                          onClick={() => {
                            setReplTouched(true);
                            setPickOpen(false);
                            setRepl((rows) => {
                              const at = rows.findIndex((r) => r.itemId === h.id);
                              if (at >= 0) {
                                const next = rows.slice();
                                next[at] = { ...next[at], qty: next[at].qty + 1 };
                                return next;
                              }
                              return [...rows, {
                                key: `pick:${h.id}:${rows.length}`,
                                itemId: h.id, productId: null, name: h.name,
                                qty: 1, unitPaisa: h.pricePaisa ?? 0,
                              }];
                            });
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-[8px] hover:bg-white flex items-center justify-between gap-2">
                          <span className="text-[12.5px] truncate">{h.name}</span>
                          <span className="text-[11.5px] text-body-soft shrink-0">
                            {h.pricePaisa === null ? "—" : formatTaka(h.pricePaisa)}
                            {h.stockQty !== null && h.stockQty !== undefined ? ` · ${h.stockQty} left` : ""}
                          </span>
                        </button>
                      ))}
                      {pickHits.length === 0 && <div className="text-[12px] text-body-soft px-2 py-2">Nothing matches.</div>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {repl.map((r, i) => (
                    <div key={r.key} className="flex items-center gap-2 border border-lavender-deep rounded-[10px] px-2.5 py-1.5 bg-white">
                      <span className="text-[12.5px] flex-1 truncate">{r.name}</span>
                      <div className="flex items-center border border-lavender-deep rounded-[8px] overflow-hidden shrink-0">
                        <button type="button" className="w-[26px] h-[28px] text-purple hover:bg-lavender/60"
                          onClick={() => { setReplTouched(true); setRepl((rows) => rows.map((x, j) => j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)); }}>–</button>
                        <span className="w-[26px] text-center text-[12.5px] font-medium text-purple">{r.qty}</span>
                        <button type="button" className="w-[26px] h-[28px] text-purple hover:bg-lavender/60"
                          onClick={() => { setReplTouched(true); setRepl((rows) => rows.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x)); }}>+</button>
                      </div>
                      <button type="button" aria-label="Remove" className="text-[13px] text-body-soft hover:text-[#c0392b] shrink-0"
                        onClick={() => { setReplTouched(true); setRepl((rows) => rows.filter((_, j) => j !== i)); }}>✕</button>
                    </div>
                  ))}
                  {repl.length === 0 && (
                    <div className="text-[12px] text-body-soft">Tick the goods coming back, or add an item.</div>
                  )}
                </div>
              </div>
            )}

            {/*  DEC-RTN-018 — how much credit is the shop's call, not a formula  */}
            {resolution === "STORE_CREDIT" && (
              <div>
                <label className="lbl">How much credit (৳)</label>
                <input className="ipt" type="number" value={creditTk}
                  onChange={(e) => setCreditTk(e.target.value)} placeholder="e.g. 300" />
              </div>
            )}

            {resolution === "PARTIAL_COMPENSATION" && (
              <div>
                <label className="lbl">How much goes back (৳)</label>
                <input className="ipt" type="number" value={compensationTk} onChange={(e) => setCompensationTk(e.target.value)} placeholder="e.g. 200" />
              </div>
            )}

            {/*  a replacement moves no money and store credit has only one way
                 out, so this choice is only real for a refund  */}
            {(resolution === "REFUND" || resolution === "PARTIAL_COMPENSATION") && (
              <div>
                <label className="lbl">Which way the money goes back</label>
                <select className="ipt" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as ReturnRefundMethod)}>
                  {refundMethods.map((m) => <option key={m} value={m}>{m === "ORIGINAL" ? "Original method" : m === "STORE_CREDIT" ? "Store credit" : m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
            )}

            <div className="pt-2 border-t border-lavender-deep flex items-center justify-between text-[13px]">
              <span className="text-body-soft">Goods coming back</span>
              <b className="text-purple" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(selectedValue)}</b>
            </div>
            <button disabled={busy} onClick={submit}
              className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px]" style={{ background: ACCENT }}>
              {busy ? "Creating…" : "Create return"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== DETAIL */

export function ReturnDetail({ id }: { id: string }) {
  const router = useRouter();
  const [r, setR] = useState<ApiReturn | null>(null);
  const [timeline, setTimeline] = useState<{ id: string; kind: string; label: string; actorName: string; createdAt: string }[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>("ORIGINAL");
  const [refundRef, setRefundRef] = useState("");
  const [refundAccountId, setRefundAccountId] = useState(""); // DEC-GBL-006
  const [payoutOpen, setPayoutOpen] = useState(false);
  const refundMethods = useRefundMethods(); // DEC-GBL-001
  const payoutOptions = usePayoutOptions(); // DEC-GBL-006
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  async function load() {
    try {
      const data = await getReturn(id);
      setR(data);
      setRefundMethod(data.refundMethod);
      setTimeline(await getReturnTimeline(id));
      if (data.customerId)
        getCustomerCredit(data.customerId).then((c) => setCreditBalance(c.balancePaisa)).catch(() => {});
    } catch (e) { setErr(msg(e, "Could not load return")); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setErr(""); setOk("");
    try { await fn(); setOk(okMsg); await load(); }
    catch (e) { setErr(msg(e, "Action failed")); }
    finally { setBusy(false); }
  }

  if (!r) return <div className={WRAP}>{err ? <ErrBar text={err} onClose={() => setErr("")} /> : "Loading…"}</div>;

  const canApprove = r.status === "pending_approval";
  const canComplete = r.status === "approved";
  const canCancel = r.status !== "completed" && r.status !== "cancelled" && r.status !== "rejected";
  const needsPayout = r.resolution === "REFUND" || r.resolution === "PARTIAL_COMPENSATION";
  /*  a partial compensation pays the agreed amount, not the value of the goods,
      and nothing ever passes what was collected (DEC-RTN-008)  */
  const payoutCap = Math.max(0, (r.order?.paidPaisa ?? 0) - (r.order?.refundPaisa ?? 0));
  const payoutPaisa = Math.min(
    r.resolution === "PARTIAL_COMPENSATION" ? r.compensationPaisa : r.returnValuePaisa,
    payoutCap || r.returnValuePaisa,
  );

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Returns & Refunds"
        title={r.returnNo}
        blurb={`${RESOLUTION_LABEL[r.resolution]} · order ${r.order?.orderNo ?? ""} · ${r.customer?.name ?? ""}`}
        right={<Link href="/returns" className="text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep">← All returns</Link>}
      />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="mb-4"><StatusPill status={r.status} /></div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-4">
          {/* lines */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 text-[12px] font-semibold text-white" style={{ background: ACCENT }}>Returned goods</div>
            {r.lines?.map((l) => (
              <div key={l.id} className="px-4 py-3 border-b border-lavender-deep flex items-center justify-between gap-3">
                <div className="text-[13.5px]">{l.name} <span className="text-body-soft">× {l.qty}</span></div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: l.restockAction === "RESTOCK" ? "#e8f7ef" : "#f1eef4", color: l.restockAction === "RESTOCK" ? "#0e7a3d" : "#8a7b96" }}>
                    {l.restockAction === "RESTOCK" ? "Restocked" : "Write-off"}
                  </span>
                  <span className="text-[13px] w-[90px] text-right">{formatTaka(l.valuePaisa)}</span>
                </div>
              </div>
            ))}
          </div>

          {/*  DEC-RTN-017 — a replacement is two movements, so the bill shows
               both: what came back, and what went out in its place  */}
          {(r.replacements?.length ?? 0) > 0 && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 text-[12px] font-semibold text-white" style={{ background: "#0e7a3d" }}>Given instead</div>
              {r.replacements!.map((x) => (
                <div key={x.id} className="px-4 py-3 border-b border-lavender-deep last:border-0 flex items-center justify-between gap-3">
                  <div className="text-[13.5px]">{x.name} <span className="text-body-soft">× {x.qty}</span></div>
                  <span className="text-[13px] text-body-soft">{formatTaka(x.unitPaisa * x.qty)}</span>
                </div>
              ))}
            </div>
          )}

          {/* timeline */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4">
            <div className="text-[13px] font-semibold mb-2" style={{ color: ACCENT }}>Timeline</div>
            <div className="space-y-2">
              {timeline.map((t) => (
                <div key={t.id} className="text-[12.5px] flex gap-2">
                  <span className="text-body-soft w-[135px] shrink-0 whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span>{t.label} <span className="text-body-soft">· {t.actorName}</span></span>
                </div>
              ))}
              {timeline.length === 0 && <div className="text-[12.5px] text-body-soft">No events yet.</div>}
            </div>
          </div>
        </div>

        {/* side: money + actions */}
        <div className="space-y-4">
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 text-[13px] space-y-1.5">
            <div className="flex justify-between"><span className="text-body-soft">Return value</span><b>{formatTaka(r.returnValuePaisa)}</b></div>
            <div className="flex justify-between"><span className="text-body-soft">Refunded (cash)</span><span>{formatTaka(r.refundPaisa)}</span></div>
            <div className="flex justify-between"><span className="text-body-soft">Store credit</span><span>{formatTaka(r.storeCreditPaisa)}</span></div>
            {r.compensationPaisa > 0 && <div className="flex justify-between"><span className="text-body-soft">Compensation</span><span>{formatTaka(r.compensationPaisa)}</span></div>}
            <div className="flex justify-between pt-1.5 border-t border-lavender-deep"><span className="text-body-soft">Order paid / refunded</span><span>{formatTaka(r.order?.paidPaisa ?? 0)} / {formatTaka(r.order?.refundPaisa ?? 0)}</span></div>
            {creditBalance !== null && (
              <div className="flex justify-between"><span className="text-body-soft">Customer store credit</span><b style={{ color: "#2563eb" }}>{formatTaka(creditBalance)}</b></div>
            )}
          </div>

          {canComplete && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4">
              {/*  Only a refund is money leaving, and that goes through the house
                   dialog (CLAUDE.md §14). Store credit and a replacement move no
                   cash, so asking "which way does the money go back" there was a
                   dead end the owner walked into (21 Aug).  */}
              {needsPayout ? (
                <button disabled={busy} onClick={() => setPayoutOpen(true)}
                  className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                  {busy ? "Working…" : "Complete & pay out"}
                </button>
              ) : (
                <button disabled={busy}
                  onClick={() => act(
                    () => completeReturn(id, { refundMethod: r.resolution === "STORE_CREDIT" ? "STORE_CREDIT" : refundMethod }),
                    r.resolution === "STORE_CREDIT" ? "Store credit given" : "Return completed",
                  )}
                  className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                  {busy ? "Working…" : r.resolution === "STORE_CREDIT"
                    ? `Complete — give ${formatTaka(r.creditAskPaisa ?? r.returnValuePaisa)} store credit`
                    : "Complete — the replacement goes out"}
                </button>
              )}
            </div>
          )}

          {canApprove && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-2">
              <div className="text-[13px] font-semibold" style={{ color: "#c77700" }}>Needs approval</div>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => act(() => approveReturn(id), "Approved")}
                  className="flex-1 text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px]" style={{ background: ACCENT }}>Approve</button>
                <button disabled={busy} onClick={() => act(() => rejectReturn(id), "Rejected")}
                  className="flex-1 text-[13px] font-medium px-4 py-2.5 rounded-[10px] border border-[#e0a1a1] text-[#c0392b]">Reject</button>
              </div>
            </div>
          )}

          {canCancel && (
            <button disabled={busy} onClick={() => act(() => cancelReturn(id), "Cancelled")}
              className="w-full text-[12.5px] px-4 py-2.5 rounded-[10px] border border-lavender-deep text-body-soft">Cancel return</button>
          )}
          {r.status === "completed" && (
            <button disabled={busy}
              onClick={async () => {
                setBusy(true); setErr("");
                try {
                  const res = await repostReturnRestock(id);
                  setOk(res.already > 0 ? "The goods are already back on the shelf." : `Put back on the shelf — ${res.posted} movement(s).`);
                } catch (e) { setErr(msg(e, "Could not repost the restock")); }
                finally { setBusy(false); }
              }}
              className="w-full text-[12.5px] px-4 py-2.5 rounded-[10px] border border-lavender-deep text-purple hover:bg-lavender/40">
              Put the goods back on the shelf
            </button>
          )}
          {r.status !== "completed" && (
            <button disabled={busy} onClick={() => act(async () => { await deleteReturn(id); router.push("/returns"); }, "Deleted")}
              className="w-full text-[12px] px-4 py-2 rounded-[10px] text-[#c0392b]">Delete</button>
          )}
        </div>
      </div>

      {payoutOpen && (
        <RefundDialog
          title="Refund the customer"
          who={r.order?.orderNo}
          amountPaisa={payoutPaisa}
          amountLabel="Paying back"
          note={r.resolution === "PARTIAL_COMPENSATION"
            ? `The customer keeps the goods · agreed ${formatTaka(r.compensationPaisa)}`
            : `Return value ${formatTaka(r.returnValuePaisa)} · collected on the order ${formatTaka(r.order?.paidPaisa ?? 0)}`}
          methods={payoutOptions}
          method={refundMethod} onMethod={(v) => setRefundMethod(v as ReturnRefundMethod)}
          accountId={refundAccountId} onAccount={setRefundAccountId}
          reference={refundRef} onReference={setRefundRef}
          busy={busy} error={err || null} confirmLabel="Pay out"
          onConfirm={async () => {
            await act(
              () => completeReturn(id, {
                refundMethod,
                refundAccountId: refundAccountId || undefined,
                refundReference: refundRef || undefined,
              }),
              "Return completed",
            );
            setPayoutOpen(false);
          }}
          onClose={() => setPayoutOpen(false)} />
      )}
    </div>
  );
}

/* ================================================================== SETTINGS */

export function ReturnSettingsView() {
  const [reasons, setReasons] = useState<ApiReturnReason[]>([]);
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newApproval, setNewApproval] = useState(false);
  const [newMethod, setNewMethod] = useState<ReturnRefundMethod>("ORIGINAL");
  const refundMethods = useRefundMethods(); // DEC-GBL-001

  async function load() {
    try { setReasons(await getReturnReasons()); setSettings(await getReturnSettings()); }
    catch (e) { setErr(msg(e, "Could not load settings")); }
  }
  useEffect(() => { load(); }, []);

  async function addReason() {
    if (!newLabel.trim()) return;
    try {
      await createReturnReason({ label: newLabel.trim(), requiresApproval: newApproval, defaultRefundMethod: newMethod });
      setNewLabel(""); setNewApproval(false); setNewMethod("ORIGINAL"); setOk("Reason added"); await load();
    } catch (e) { setErr(msg(e, "Could not add reason")); }
  }

  async function saveSettings(patch: Partial<ReturnSettings>) {
    try {
      const s = await updateReturnSettings({
        returnWindowDays: patch.returnWindowDays ?? settings?.returnWindowDays,
        approvalThresholdPaisa: patch.approvalThresholdPaisa ?? settings?.approvalThresholdPaisa,
        restockDefaultPerishable: patch.restockDefaultPerishable ?? settings?.restockDefaultPerishable,
      });
      setSettings(s); setOk("Settings saved");
    } catch (e) { setErr(msg(e, "Could not save")); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Returns & Refunds"
        title="Reasons & settings"
        blurb="Return reasons drive the default refund method and whether approval is needed. The window and threshold are admin-configurable (DEC-RTN-009/014)."
        right={<Link href="/returns" className="text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep">← Back</Link>}
      />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* reasons */}
        <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 text-[12px] font-semibold text-white" style={{ background: ACCENT }}>Return reasons</div>
          {reasons.map((r) => (
            <div key={r.id} className="px-4 py-3 border-b border-lavender-deep flex items-center justify-between gap-3">
              <div className="text-[13px]">{r.label}
                <span className="text-[11px] text-body-soft ml-2">{r.defaultRefundMethod}{r.requiresApproval ? " · approval" : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-[11.5px] underline" onClick={() => updateReturnReason(r.id, { label: r.label, requiresApproval: !r.requiresApproval, defaultRefundMethod: r.defaultRefundMethod }).then(load)}>
                  {r.requiresApproval ? "approval off" : "approval on"}
                </button>
                <button className="text-[11.5px] text-[#c0392b] underline" onClick={() => deleteReturnReason(r.id).then(load)}>remove</button>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 space-y-2">
            <input className="ipt" placeholder="New reason (e.g. Damaged on arrival)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <div className="flex items-center gap-2">
              <select className="ipt flex-1" value={newMethod} onChange={(e) => setNewMethod(e.target.value as ReturnRefundMethod)}>
                {refundMethods.map((m) => <option key={m} value={m}>{m === "ORIGINAL" ? "Original method" : m === "STORE_CREDIT" ? "Store credit" : m}</option>)}
              </select>
              <label className="text-[12px] flex items-center gap-1.5 shrink-0">
                <input type="checkbox" checked={newApproval} onChange={(e) => setNewApproval(e.target.checked)} /> needs approval
              </label>
            </div>
            <button className="text-white text-[13px] px-4 py-2.5 rounded-[10px]" style={{ background: ACCENT }} onClick={addReason}>Add reason</button>
          </div>
        </div>

        {/* settings */}
        {settings && (
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-4">
            <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>Policy settings</div>
            <div>
              <label className="lbl">Return window (days) <span className="text-body-soft">— 0 = off, warn only</span></label>
              <input className="ipt" type="number" defaultValue={settings.returnWindowDays}
                onBlur={(e) => saveSettings({ returnWindowDays: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div>
              <label className="lbl">Approval threshold (৳) <span className="text-body-soft">— 0 = off</span></label>
              <input className="ipt" type="number" defaultValue={settings.approvalThresholdPaisa / 100}
                onBlur={(e) => saveSettings({ approvalThresholdPaisa: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
            </div>
            <label className="text-[13px] flex items-center gap-2">
              <input type="checkbox" checked={settings.restockDefaultPerishable}
                onChange={(e) => saveSettings({ restockDefaultPerishable: e.target.checked })} />
              Perishable/crafted default to write-off (not restock)
            </label>
          </div>
        )}
      </div>

      {/*  ── DEC-SAL-013 · what a CANCELLED order gives back ─────────────────
           A cancellation is not a return — the customer never received
           anything — but both are "how much money goes back", and the owner
           will look for them in the same place. So it sits under the return
           policy rather than in a screen of its own.

           The refund is a share of what was PAID, never of the order total.
           His words: *the customer gets 50% of the amount they paid, not 50%
           of the product price.*  */}
      <CancelRules />
    </div>
  );
}

function CancelRules() {
  const [rates, setRates] = useState<{ beforeStartPct: number; afterStartPct: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getCancelRules().then(setRates).catch((e) => setErr(msg(e, "Could not read the cancellation rules")));
  }, []);

  async function save(patch: { beforeStartPct?: number; afterStartPct?: number }) {
    try {
      setRates(await saveCancelRules(patch));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(msg(e, "Could not save")); }
  }

  if (err) return <ErrBar text={err} onClose={() => setErr("")} />;
  if (!rates) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="font-display text-[17px] text-purple m-0">If an order is cancelled</h2>
        <Info text="A cancellation is not a return — nothing was ever received. What comes back is a share of the money the customer actually PAID, never a share of the order total. So a Cash-on-Delivery order cancelled before anyone paid returns nothing, and leaves nobody owing anything." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-body-soft mb-2.5">
            Not made yet
            <Info text="Cancelled while the order is still waiting — nobody has touched the flowers. Nothing has come off the shelf either, so there is nothing to lose." />
          </div>
          <div className="flex items-center gap-2">
            <input type="number" className="ipt tabular-nums font-semibold text-[17px]" style={{ minHeight: 42, maxWidth: 100 }}
              defaultValue={rates.beforeStartPct}
              onBlur={(e) => save({ beforeStartPct: parseInt(e.target.value, 10) })} />
            <span className="text-[13px] font-semibold text-body-soft">% of what they paid</span>
          </div>
        </div>

        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-body-soft mb-2.5">
            Made, rider not out
            <Info text="The workshop has started, so the stems are cut and the stock does not come back. This is the owner's 50% — move it if a season or a customer deserves different." />
          </div>
          <div className="flex items-center gap-2">
            <input type="number" className="ipt tabular-nums font-semibold text-[17px]" style={{ minHeight: 42, maxWidth: 100 }}
              defaultValue={rates.afterStartPct}
              onBlur={(e) => save({ afterStartPct: parseInt(e.target.value, 10) })} />
            <span className="text-[13px] font-semibold text-body-soft">% of what they paid</span>
          </div>
        </div>

        {/*  Not a field, deliberately. "Once it is on the road it is gone" is
             the ruling, not a number to tune — showing it as an editable box
             would invite somebody to soften a rule the owner set hard.  */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-body-soft mb-2.5">
            Rider has left
            <Info text="Fixed at nothing, and not a setting. Once it is on the road the flowers, the trip and the rider's time are all spent. A problem found after it arrives is a Return, not a cancellation." />
          </div>
          <div className="flex items-center gap-2" style={{ minHeight: 42 }}>
            <span className="font-display text-[22px] text-purple tabular-nums">0</span>
            <span className="text-[13px] font-semibold text-body-soft">% — nothing comes back</span>
          </div>
        </div>
      </div>

      {saved && <div className="text-[13px] font-semibold text-[#0f7d55] mt-3">Saved ✓</div>}
    </div>
  );
}

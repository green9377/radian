"use client";

/*
  Returns & Refunds — admin views.
  Architecture: RADIAN_RETURNS_MODULE_ARCHITECTURE.md (locked 23 Jul 2026, DEC-RTN-005..015).

  Post-delivery grievance → resolution. Staff-initiated only (never customer-direct).
  Refund payout NEVER exceeds what was collected. Restock flows through Inventory
  (SALE_RETURN). Order.salesStatus is never mutated — a return is its own document.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ErrBar, OkBar, msg } from "./ItemUI";
import {
  listReturns, returnStats, getReturn, getReturnTimeline,
  eligibleOrderForReturn, createReturn, approveReturn, rejectReturn, cancelReturn,
  submitReturn, returnedOrderCounts, completeReturn, apiGet, meCached,
  repostReturnRestock, deleteReturn, getReturnReasons, createReturnReason, updateReturnReason,
  deleteReturnReason, getReturnSettings, updateReturnSettings, getCustomerCredit,
  listOrdersPage, formatTaka, takaToPaisa,
  getCancelRules, saveCancelRules,
  posCatalogue, type ApiPosCatalogueRow,
  RETURN_STATUS_META, RESOLUTION_LABEL,
  type ApiReturn, type ReturnStats, type ReturnCounts, type EligibleOrder, type ApiReturnReason,
  type ReturnSettings, type ReturnResolution, type ReturnRefundMethod, type ReturnRestockAction,
  type ReturnStatus, type ApiOrder, type ApiMe,
} from "../_data/api";
import { RefundDialog, usePaymentMethods, type PayOption } from "./MoneyBlock";
/*  DEC-SAL-013 — the cancellation refund ladder, and the house info dot.  */
import { Info } from "./ItemEditor";
import QtyStepper from "./QtyStepper";

/*  DEC-GBL-001 — ORIGINAL is a rule, not a till, so it is always offered; the
    real doors come from the shop's own list.

    ═══ audit 11 Sep 2026 (P2) — STORE CREDIT IS NOT A REFUND METHOD ═══

    It used to sit in this list beside Cash and bKash, so "refund by store
    credit" was a thing a cashier could pick — and the money numbers then lied
    in both directions: the Refunded column counted a payout that never left
    the shop, and the shop's liability was recorded as if a bill had been
    settled. A credit is a PROMISE OF GOODS; cash is money going out. They are
    two different answers to "what does the customer get", which is the
    RESOLUTION, and that is where store credit now lives — the only place it
    ever meant anything.

    Nothing about the existing business rule changes: a return whose
    resolution is STORE_CREDIT still issues credit, capped and gated by
    DEC-RTN-018 exactly as before. Only the door into it moved. Rows already
    carrying refundMethod = STORE_CREDIT still work server-side and still
    display; they simply cannot be created any more.  */
const REFUND_TENDERS = ["CASH", "BKASH", "NAGAD", "CARD", "BANK"];
function useRefundMethods(): ReturnRefundMethod[] {
  const live = usePaymentMethods(REFUND_TENDERS);
  return ["ORIGINAL", ...live.map((m) => m.id as ReturnRefundMethod)];
}
/*  the payout dialog needs the accounts too (DEC-GBL-006): "which bKash number
    did the money go back out of" is the same question as taking it in.  */
function usePayoutOptions(gatewayOk?: boolean): PayOption[] {
  const live = usePaymentMethods(REFUND_TENDERS);
  return [
    { id: "ORIGINAL", label: "Original method" },
    /*  DEC-FIN-031 — the gateway option appears ONLY when the money can really
        go back that way: paid online, and we still hold the gateway's own
        reference. Offering it otherwise means a button that fails after it is
        pressed, on the screen where somebody is giving money back.  */
    ...(gatewayOk ? [{ id: "GATEWAY", label: "Back to the card (gateway)" } as PayOption] : []),
    ...live,
    /*  no "Store credit" here — this dialog is money leaving the shop. Credit
        is a resolution, not a till (see useRefundMethods above).  */
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
  },
  counter: {
    eyebrow: "Shop · Returns",
    title: "Returns from counter sales",
  },
} as const;

const PAGE_SIZE = 50;

export function ReturnsOverview() {
  const params = useSearchParams();
  const raw = params.get("channel");
  const channel = raw === "online" || raw === "counter" ? raw : undefined;
  const door = channel ? DOORS[channel] : null;

  const [rows, setRows] = useState<ApiReturn[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<ReturnCounts | null>(null);
  const [stats, setStats] = useState<ReturnStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  /*  ═══ audit 11 Sep 2026 (P2) — THE HUNDRED-ROW CAP IS GONE ═══
      The list asked for one page of a hundred and then searched, filtered and
      totalled it in the browser, so a return from four months ago could not
      be found by its own number and the strip above described that page
      rather than the shop. Everything below is now a `where` on the server;
      the counts and the money come from `GET /returns/stats`, over the whole
      filtered book.  */
  const load = useCallback(async (opts?: { page?: number; search?: string }) => {
    const p = opts?.page ?? 1;
    const s = opts?.search ?? search;
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        listReturns({ search: s || undefined, status: status || undefined, channel, page: p, pageSize: PAGE_SIZE }),
        returnStats({ search: s || undefined, channel }),
      ]);
      setRows(list.rows ?? list.items ?? []);
      setTotal(list.total);
      setCounts(list.counts);
      setPage(list.page);
      setStats(st);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, [search, status, channel]);

  /*  the status filter and the door reset to page 1; the search box is
      debounced so every keystroke is not a round trip  */
  useEffect(() => { load({ page: 1 }); /* eslint-disable-next-line */ }, [status, channel]);
  const typed = useRef(false);
  useEffect(() => {
    /*  the effect above already loads on mount; this one is only for typing,
        so the first render does not fire a second identical request  */
    if (!typed.current) { typed.current = true; return; }
    const t = setTimeout(() => load({ page: 1, search }), 300);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [search]);

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow={door?.eyebrow ?? "Commerce · Returns & Refunds"}
        title={door?.title ?? "Returns & Refunds"}
        right={<NewBtn />}
      />
      {failed && <DemoBar what="returns (API offline?)" onRetry={() => load({ page })} />}

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
              door's own count. The figure is the same on every door on purpose.
              Every number here is counted over the whole book, not a page.  */
          { l: door ? "All returns" : "Returns", v: stats.counts.all ?? 0, c: "#ce6ef7", bg: "#2e1a38", icon: "box" },
          /*  a queue, not a report — a return raised in June that nobody has
              decided is still waiting today (audit 11 Sep 2026)  */
          { l: "Needs approval", v: stats.needsApproval, c: "#f7c06e", bg: "#3b2b17", icon: "bolt" },
          { l: "Refunded", v: formatTaka(stats.refundPaisa), c: "#e1837a", bg: "#3b1a16", icon: "cash" },
          { l: "Store credit", v: formatTaka(stats.storeCreditPaisa), c: "#6a94f1", bg: "#16243b", icon: "star" },
          { l: "Return value", v: formatTaka(stats.returnValuePaisa), c: "#76efab", bg: "#1f3529", icon: "tag" },
        ]} />
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input className="ipt max-w-[280px]" placeholder="Search RTN / order / customer / phone…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="ipt max-w-[190px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses{counts ? ` (${counts.all ?? 0})` : ""}</option>
          {(Object.keys(RETURN_STATUS_META) as ReturnStatus[]).map((s) =>
            <option key={s} value={s}>
              {RETURN_STATUS_META[s].label}{counts ? ` (${counts[s] ?? 0})` : ""}
            </option>)}
        </select>
        <span className="text-[12.5px] text-body-soft ml-auto">
          {loading ? "Searching…" : total === 0 ? "No returns" : `${from}–${to} of ${total}`}
        </span>
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
            className="grid grid-cols-[130px_1fr_140px_120px_130px_110px] gap-3 px-4 py-3 items-center hover:bg-[#291a35]">
            <span className="font-semibold text-[13px]" style={{ color: ACCENT }}>{r.returnNo}</span>
            <span className="text-[13px]">
              <b>{r.customer?.name ?? "—"}</b>
              <span className="text-body-soft"> · {r.order?.orderNo ?? ""}</span>
            </span>
            <span className="text-[12.5px]">{RESOLUTION_LABEL[r.resolution]}</span>
            <span className="text-right text-[13px]">{formatTaka(r.returnValuePaisa)}</span>
            <span className="text-right text-[13px]">
              {r.refundPaisa > 0 ? formatTaka(r.refundPaisa) : "—"}
              {r.storeCreditPaisa > 0 && <span className="text-[11px] text-[#6a94f1]"> +{formatTaka(r.storeCreditPaisa)} credit</span>}
            </span>
            <StatusPill status={r.status} />
          </Link>
        ))}
      </DataTable>

      {total > PAGE_SIZE && (
        <div className="flex items-center gap-2 mt-3">
          <button className="text-[12.5px] px-3 py-2 rounded-[9px] border border-lavender-deep disabled:opacity-40"
            disabled={loading || page <= 1} onClick={() => load({ page: page - 1 })}>← Prev</button>
          <span className="text-[12.5px] text-body-soft">{from}–{to} of {total}</span>
          <button className="text-[12.5px] px-3 py-2 rounded-[9px] border border-lavender-deep disabled:opacity-40"
            disabled={loading || to >= total} onClick={() => load({ page: page + 1 })}>Next →</button>
        </div>
      )}
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
  REPLACEMENT: "Same goods sent again — no money moves.",
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

const ORDER_PAGE = 25;

export function NewReturn() {
  const router = useRouter();
  const params = useSearchParams();
  /*  audit 11 Sep 2026 (P2/P3) — "Start return" on an order page used to land
      here empty, so whoever pressed it had to find the order they were already
      looking at. `/returns/new?orderId=…` loads it straight away.  */
  const fromOrderId = params.get("orderId");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderHits, setOrderHits] = useState<ApiOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
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
      asks for both, and the screen offers the recent ones without a search.

      ═══ audit 11 Sep 2026 (P2) — THE PICKER SEARCHES THE SERVER ═══
      It used to pull one page of a hundred orders and filter them here, so an
      order older than the last hundred simply did not exist as far as this
      screen was concerned. It now asks the server, page by page, with the
      delivered filter applied THERE (agent B's `GET /orders`), and the
      "already returned once" flag is answered for exactly the rows on screen
      by `GET /returns/for-orders` — over every return, and with rejected and
      cancelled ones left out, which the old hundred-row count did not do.  */
  const [returnedIds, setReturnedIds] = useState<Record<string, number>>({});

  const loadOrders = useCallback(async (search?: string, page = 1) => {
    setErr("");
    try {
      const res = await listOrdersPage({
        search,
        includeCounter: true,
        deliveryStatus: "delivered",
        page,
        pageSize: ORDER_PAGE,
      });
      setOrderHits(res.rows);
      setOrderTotal(res.total);
      setOrderPage(res.page);
      if (search && !res.rows.length)
        setErr("No delivered order matches that number, name or phone. Only a delivered order can be returned.");
      returnedOrderCounts(res.rows.map((o) => o.id)).then(setReturnedIds).catch(() => {});
    } catch (e) { setErr(msg(e, "Could not search orders")); }
  }, []);
  useEffect(() => { if (!fromOrderId) loadOrders(); }, [loadOrders, fromOrderId]);

  async function findOrders() { await loadOrders(orderSearch.trim() || undefined, 1); }

  const pickOrder = useCallback(async (id: string) => {
    setErr("");
    try {
      const e = await eligibleOrderForReturn(id);
      setEl(e);
      /*  audit 11 Sep 2026 (P2) — the restock default followed the product
          type alone and ignored the shop's own perishable setting, so a shop
          that had said "perishables are written off" still had every readymade
          line pre-ticked back onto the shelf. Both now decide it.  */
      const d: Record<string, LineDraft> = {};
      for (const l of e.lines)
        d[l.orderLineId] = {
          checked: false,
          qty: l.returnableQty,
          restockAction:
            l.productType === "CRAFTED" || e.restockDefaultPerishable ? "WRITE_OFF" : "RESTOCK",
        };
      setDrafts(d);
    } catch (e) { setErr(msg(e, "Could not load order")); }
  }, []);

  /*  arrived from an order page with the order already named  */
  useEffect(() => { if (fromOrderId) pickOrder(fromOrderId); }, [fromOrderId, pickOrder]);

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
    if (resolution === "STORE_CREDIT") setCreditTk((selectedValue / 100).toFixed(2));
  }, [resolution, selectedValue]);

  /*  audit 11 Sep 2026 (P2) — the three money figures this form can produce,
      with their ceilings, in one place. Every one of them used to be typed
      free and clamped (or not) somewhere far away.  */
  const replValue = useMemo(() => repl.reduce((s, r) => s + r.unitPaisa * r.qty, 0), [repl]);
  const compPaisa = takaToPaisa(compensationTk || "0");
  const creditPaisa = takaToPaisa(creditTk || "0");
  /** a compensation is money leaving: never more than the goods, never more than is in hand */
  const compMax = Math.min(selectedValue, el?.refundableCap ?? 0);
  const blocked =
    (resolution === "REPLACEMENT" && replValue > selectedValue) ||
    (resolution === "PARTIAL_COMPENSATION" && (compPaisa <= 0 || compPaisa > compMax));

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
        compensationPaisa: resolution === "PARTIAL_COMPENSATION" ? compPaisa : undefined,
        note: note || undefined,
        lines,
        replacements: resolution === "REPLACEMENT"
          ? repl.filter((r) => r.qty > 0).map((r) => ({
              itemId: r.itemId, productId: r.productId, name: r.name, qty: r.qty, unitPaisa: r.unitPaisa,
            }))
          : undefined,
        creditAskPaisa: resolution === "STORE_CREDIT" ? creditPaisa : undefined,
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
          <select className="ipt mt-1" value=""
            onChange={(e) => e.target.value && pickOrder(e.target.value)}>
            <option value="">Choose from the recent delivered orders…</option>
            {orderHits.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} · {o.customer?.name ?? o.senderName} · {formatTaka(o.totalPaisa)} · {new Date(o.placedAt).toLocaleDateString()}
                {returnedIds[o.id] ? ` · returned ${returnedIds[o.id]}x already` : ""}
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
                className="w-full text-left py-2.5 px-1 hover:bg-[#291a35] flex items-center justify-between gap-3">
                <span className="text-[13px]">
                  <b style={{ color: ACCENT }}>{o.orderNo}</b> · {o.customer?.name ?? o.senderName}
                  <span className="text-body-soft"> · {o.senderPhone || "—"}</span>
                  {returnedIds[o.id] > 0 && (
                    <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "#3b2b17", color: "#f7a96e" }}>
                      {returnedIds[o.id] === 1 ? "already returned once" : `already returned ${returnedIds[o.id]} times`}
                    </span>
                  )}
                </span>
                <span className="text-[12px] text-body-soft">{formatTaka(o.totalPaisa)} · paid {formatTaka(o.paidPaisa)}</span>
              </button>
            ))}
            {orderHits.length === 0 && <div className="text-[12.5px] text-body-soft py-3">No delivered order to return yet.</div>}
          </div>

          {orderTotal > ORDER_PAGE && (
            <div className="flex items-center gap-2 mt-3">
              <button type="button" className="text-[12.5px] px-3 py-1.5 rounded-[9px] border border-lavender-deep disabled:opacity-40"
                disabled={orderPage <= 1}
                onClick={() => loadOrders(orderSearch.trim() || undefined, orderPage - 1)}>← Prev</button>
              <span className="text-[12px] text-body-soft">
                {(orderPage - 1) * ORDER_PAGE + 1}–{Math.min(orderTotal, orderPage * ORDER_PAGE)} of {orderTotal} delivered orders
              </span>
              <button type="button" className="text-[12.5px] px-3 py-1.5 rounded-[9px] border border-lavender-deep disabled:opacity-40"
                disabled={orderPage * ORDER_PAGE >= orderTotal}
                onClick={() => loadOrders(orderSearch.trim() || undefined, orderPage + 1)}>Next →</button>
            </div>
          )}
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
              {/*  audit 11 Sep 2026 (P2) — this used to empty `orderHits` as
                   well, so "Change order" dropped you back on a picker with
                   nothing in it and no way to refill it but a search. It now
                   puts the recent list back.  */}
              <button className="text-[12px] underline" onClick={() => {
                setEl(null);
                setDrafts({});
                setRepl([]);
                setReplTouched(false);
                loadOrders(orderSearch.trim() || undefined, 1);
              }}>Change order</button>
            </div>

            {/*  audit 11 Sep 2026 (P2) — the return-window warning existed in
                 the policy and was never once drawn, because nothing on the
                 payload said when the parcel arrived. It WARNS and never
                 blocks: DEC-RTN-014 leaves the call to the shop.  */}
            {el.outsideWindow && (
              <div className="px-4 py-2.5 text-[12.5px] border-b border-lavender-deep" style={{ background: "#3b2b17", color: "#f7c06e" }}>
                Delivered {el.daysSinceDelivery} days ago — past the shop&apos;s {el.returnWindowDays}-day return window.
              </div>
            )}
            {(el.priorReturns ?? 0) > 0 && (
              <div className="px-4 py-2.5 text-[12.5px] border-b border-lavender-deep text-body-soft">
                This order has {el.priorReturns === 1 ? "one return" : `${el.priorReturns} returns`} already.
              </div>
            )}
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
                        <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: l.productType === "CRAFTED" ? "#3b2b17" : "#eef", color: l.productType === "CRAFTED" ? "#f7a96e" : "#8681da" }}>{l.productType}</span>
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
                            <QtyStepper value={d.qty} min={1} max={l.returnableQty} label="How many"
                              onChange={(n) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, qty: n } }))} />
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
                  <div className="border border-lavender-deep rounded-[10px] p-2 mb-2 bg-[#291a35]">
                    <input className="ipt" autoFocus placeholder="Search the counter list…"
                      value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
                    <div className="mt-1.5 max-h-[190px] overflow-y-auto">
                      {/*  audit 11 Sep 2026 (P2) — an item the shop does not
                           hold could be picked as a replacement, promising the
                           customer something nobody could hand over and taking
                           the stock negative at completion. A counted item with
                           nothing on the shelf is shown, greyed, with the
                           reason: hiding it would look like a search fault.
                           `stockQty === null` means "not counted" (a service),
                           which is not the same as "none left".  */}
                      {pickHits.map((h) => {
                        const out = h.stockQty !== null && h.stockQty !== undefined && h.stockQty <= 0;
                        return out ? (
                          <div key={h.id}
                            className="w-full text-left px-2 py-1.5 rounded-[8px] opacity-45 flex items-center justify-between gap-2">
                            <span className="text-[12.5px] truncate">{h.name}</span>
                            <span className="text-[11.5px] shrink-0" style={{ color: "#e1837a" }}>none in stock</span>
                          </div>
                        ) : (
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
                        );
                      })}
                      {pickHits.length === 0 && <div className="text-[12px] text-body-soft px-2 py-2">Nothing matches.</div>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {repl.map((r, i) => (
                    <div key={r.key} className="flex items-center gap-2 border border-lavender-deep rounded-[10px] px-2.5 py-1.5 bg-white">
                      <span className="text-[12.5px] flex-1 truncate">{r.name}</span>
                      <span className="shrink-0">
                        <QtyStepper size="sm" value={r.qty} min={1}
                          onChange={(n) => { setReplTouched(true); setRepl((rows) => rows.map((x, j) => j === i ? { ...x, qty: n } : x)); }} />
                      </span>
                      <button type="button" aria-label="Remove" className="text-[13px] text-body-soft hover:text-[#e1837a] shrink-0"
                        onClick={() => { setReplTouched(true); setRepl((rows) => rows.filter((_, j) => j !== i)); }}>✕</button>
                    </div>
                  ))}
                  {repl.length === 0 && (
                    <div className="text-[12px] text-body-soft">Tick the goods coming back, or add an item.</div>
                  )}
                </div>

                {/*  audit 11 Sep 2026 (P2) — a replacement is goods leaving for
                     nothing, and it was uncapped: any item in the shop could be
                     given away against a small return. The API refuses it too;
                     this is so nobody meets that refusal by surprise.  */}
                <div className="flex items-center justify-between text-[12px] mt-2 pt-2 border-t border-lavender-deep">
                  <span className="text-body-soft">Going out</span>
                  <b style={{ color: replValue > selectedValue ? "#e1837a" : undefined }}>
                    {formatTaka(replValue)} of {formatTaka(selectedValue)}
                  </b>
                </div>
                {replValue > selectedValue && (
                  <div className="text-[11.5px] mt-1" style={{ color: "#e1837a" }}>
                    More is going out than came back.
                  </div>
                )}
              </div>
            )}

            {/*  DEC-RTN-018 — how much credit is the shop's call, not a formula.
                 Above what was collected the API asks for an owner or a manager,
                 so the line under the box says so rather than letting a cashier
                 meet a 403 after typing.  */}
            {resolution === "STORE_CREDIT" && (
              <div>
                <label className="lbl">How much credit (৳)</label>
                <input className="ipt" type="number" min={0} step="0.01" value={creditTk}
                  onChange={(e) => setCreditTk(e.target.value)} placeholder="e.g. 300" />
                <div className="text-[11.5px] text-body-soft mt-1">
                  Goods coming back are worth {formatTaka(selectedValue)}; {formatTaka(el.refundableCap)} was collected and is still in hand.
                  {creditPaisa > el.refundableCap && " Above that needs the owner or a manager."}
                </div>
              </div>
            )}

            {resolution === "PARTIAL_COMPENSATION" && (
              <div>
                <label className="lbl">How much goes back (৳)</label>
                <input className="ipt" type="number" min={0} step="0.01" max={compMax / 100}
                  value={compensationTk} onChange={(e) => setCompensationTk(e.target.value)} placeholder="e.g. 200" />
                {/*  audit 11 Sep 2026 (P2) — this was unvalidated on both
                     sides: any figure could be typed and it was only clamped,
                     silently, at payout. The ceiling is the smaller of what
                     the goods are worth and what is still in hand.  */}
                <div className="text-[11.5px] mt-1" style={{ color: compPaisa > compMax ? "#e1837a" : undefined }}>
                  {compPaisa > compMax
                    ? `At most ${formatTaka(compMax)} — that is what is still in hand on this bill.`
                    : `At most ${formatTaka(compMax)} (goods ${formatTaka(selectedValue)}, still in hand ${formatTaka(el.refundableCap)}).`}
                </div>
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
            <button disabled={busy || blocked} onClick={submit}
              className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px] disabled:opacity-45" style={{ background: ACCENT }}>
              {busy ? "Creating…" : "Create return"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== DETAIL */

/*  audit 11 Sep 2026 #32 — the three ways a return can be ended from this
    screen, each with its own words. Reject and Cancel need a reason; Delete
    needs nothing but a moment's pause, because it removes the document rather
    than deciding it.  */
type AskKind = "reject" | "cancel" | "delete";
const ASK_META: Record<AskKind, {
  title: string; verb: string; confirm: string; tone: string;
  placeholder: string; blurb: (no: string) => string;
}> = {
  reject: {
    title: "Reject this return",
    verb: "it is being rejected",
    confirm: "Reject it",
    tone: "#e1837a",
    placeholder: "e.g. Goods were used, not faulty",
    blurb: (no) => `${no} will be refused — the customer gets nothing back.`,
  },
  cancel: {
    title: "Cancel this return",
    verb: "it is being cancelled",
    confirm: "Cancel it",
    tone: "#f7c06e",
    placeholder: "e.g. Customer changed their mind",
    blurb: (no) => `${no} stops here. Nothing is refunded, credited or restocked.`,
  },
  delete: {
    title: "Delete this return",
    verb: "",
    confirm: "Delete it",
    tone: "#e1837a",
    placeholder: "",
    blurb: (no) =>
      `${no} disappears from the book entirely — no claim, no reason, nothing on the order's timeline.`,
  },
};

export function ReturnDetail({ id }: { id: string }) {
  const router = useRouter();
  const [r, setR] = useState<ApiReturn | null>(null);
  const [timeline, setTimeline] = useState<{ id: string; kind: string; label: string; actorName: string; createdAt: string }[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  /*  ═══ THE METHOD IS PICKED, NEVER ASSUMED — owner, 11 Sep 2026 ═══════════

      > *"A refund can come from cash, bKash, the bank — anywhere. The person
      >  refunding picks the method."*

      It used to default to "Original method", which on a cash-on-delivery bill
      silently means the counter cash box. That is how a ৳10,200 refund walked
      out of a till that had taken ৳8,000 all week, and day-close then showed
      a box holding minus seven thousand taka. Empty until a person chooses.  */
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod | "">("");
  const [refundRef, setRefundRef] = useState("");
  const [refundAccountId, setRefundAccountId] = useState(""); // DEC-GBL-006
  const [payoutOpen, setPayoutOpen] = useState(false);
  const refundMethods = useRefundMethods(); // DEC-GBL-001
  /*  DEC-FIN-031 — asked of the server before the choice is drawn, because
      only the server knows whether a gateway reference was ever recorded.  */
  const [gatewayOk, setGatewayOk] = useState<{ ok: boolean; why?: string } | null>(null);
  const payoutOptions = usePayoutOptions(gatewayOk?.ok); // DEC-GBL-006
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  /*  audit 11 Sep 2026 #31 — who is looking. Approval is an OWNER/MANAGER act
      and never the requester's own, and the button has to say so BEFORE it is
      pressed; the server refuses either way.  */
  const [me, setMe] = useState<ApiMe | null>(null);
  useEffect(() => { meCached().then(setMe).catch(() => {}); }, []);

  async function load() {
    try {
      const data = await getReturn(id);
      setR(data);
      /*  what the return was WRITTEN with is a plan, not a decision: the payout
          dialog asks again when the money actually moves (owner, 11 Sep 2026).
          Only a method that names a real till is carried over.  */
      if (data.refundMethod && data.refundMethod !== "ORIGINAL" && data.refundMethod !== "STORE_CREDIT")
        setRefundMethod(data.refundMethod);
      setTimeline(await getReturnTimeline(id));
      if (data.customerId)
        getCustomerCredit(data.customerId).then((c) => setCreditBalance(c.balancePaisa)).catch(() => {});
      /*  DEC-FIN-031 — fail-soft: if this cannot be asked, the gateway option
          simply is not offered, and the hand-sent refund still works. A
          refund screen must never be blocked by a question about a nicety.  */
      if (data.orderId)
        apiGet<{ ok: boolean; why?: string }>(`/returns/gateway-refundable/${data.orderId}`)
          .then(setGatewayOk)
          .catch(() => setGatewayOk({ ok: false }));
    } catch (e) { setErr(msg(e, "Could not load return")); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true); setErr(""); setOk("");
    try { await fn(); setOk(okMsg); await load(); }
    catch (e) { setErr(msg(e, "Action failed")); }
    finally { setBusy(false); }
  }

  /*  audit #32 — reject / cancel / delete all pass through one dialog  */
  const [ask, setAsk] = useState<{ kind: AskKind } | null>(null);
  const [askWhy, setAskWhy] = useState("");
  async function runAsk() {
    if (!ask) return;
    const why = askWhy.trim();
    if (ask.kind === "delete") {
      await act(async () => { await deleteReturn(id); router.push("/returns"); }, "Deleted");
    } else if (ask.kind === "reject") {
      await act(() => rejectReturn(id, why), "Rejected");
    } else {
      await act(() => cancelReturn(id, why), "Cancelled");
    }
    setAsk(null); setAskWhy("");
  }

  if (!r) return <div className={WRAP}>{err ? <ErrBar text={err} onClose={() => setErr("")} /> : "Loading…"}</div>;

  const isDraft = r.status === "draft";
  const pending = r.status === "pending_approval";
  const canComplete = r.status === "approved";
  const canCancel = r.status !== "completed" && r.status !== "cancelled" && r.status !== "rejected";
  const needsPayout = r.resolution === "REFUND" || r.resolution === "PARTIAL_COMPENSATION";

  /*  audit 11 Sep 2026 #31 — the two walls, drawn. `mayApprove` is the role;
      `isRequester` is the person. Neither is trusted: the API refuses both
      cases on its own. Drawing them here only saves somebody the 403.  */
  const mayApprove = !me || me.role === "OWNER" || me.role === "MANAGER";
  const isRequester =
    !!me && !!r.actorName && me.name.trim().toLowerCase() === r.actorName.trim().toLowerCase();
  const canApprove = pending && mayApprove && !isRequester;

  /*  ═══ audit 11 Sep 2026 #12 — WHAT MAY ACTUALLY BE PAID OUT ═══

      This line used to read `payoutCap || r.returnValuePaisa`: on a bill with
      NOTHING left in hand the cap is 0, `0 || x` is x, and the dialog cheerfully
      proposed the whole value of the goods. A COD order never paid for, or an
      order already refunded in full, offered a second payout of money the
      customer was never owed — and the person paying it had no way to see that
      from the screen.

      The cap is the floor as well as the ceiling now, the API enforces the same
      number from its own reading of the order, and at zero the button is not
      drawn at all: there is nothing to press, and a sentence saying why beats a
      button that fails.  */
  /*  (review the same day) the API sends its OWN cap — which also subtracts
      store credit already issued on this order (DEC-RTN-011). Working it out
      again here got a bigger number on any bill that had had credit, so the
      dialog offered what the API then refused. Its number wins; the local sum
      is only a fallback for an older payload.  */
  const payoutCap = Math.max(
    0,
    r.payoutCapPaisa ?? (r.order?.paidPaisa ?? 0) - (r.order?.refundPaisa ?? 0),
  );
  const payoutBase = r.resolution === "PARTIAL_COMPENSATION" ? r.compensationPaisa : r.returnValuePaisa;
  const payoutPaisa = Math.min(payoutBase, payoutCap);
  const nothingPayable = needsPayout && payoutPaisa <= 0;

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
                  {/*  audit 11 Sep 2026 (P2) — "Restocked" was printed the
                       moment the return was written, before anything had gone
                       anywhere near a shelf. Until the return completes this
                       is a DECISION, not a fact, and it now reads as one.  */}
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: l.restockAction === "RESTOCK" ? "#1f3529" : "#29242e", color: l.restockAction === "RESTOCK" ? "#76efab" : "#aea4b7" }}>
                    {l.restockAction === "RESTOCK"
                      ? (r.status === "completed" ? "Restocked" : "To be restocked")
                      : (r.status === "completed" ? "Written off" : "To be written off")}
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
              <div className="flex justify-between"><span className="text-body-soft">Customer store credit</span><b style={{ color: "#6a94f1" }}>{formatTaka(creditBalance)}</b></div>
            )}
          </div>

          {canComplete && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4">
              {/*  Only a refund is money leaving, and that goes through the house
                   dialog (CLAUDE.md §14). Store credit and a replacement move no
                   cash, so asking "which way does the money go back" there was a
                   dead end the owner walked into (21 Aug).  */}
              {needsPayout && nothingPayable ? (
                /*  audit #12 — no button at all, and the reason in one line.  */
                <div className="text-[12.5px] leading-[1.5]" style={{ color: "#f7c06e" }}>
                  Nothing is payable: {formatTaka(r.order?.paidPaisa ?? 0)} collected, {formatTaka(r.order?.refundPaisa ?? 0)} already
                  returned. Cancel it, or settle as store credit or a replacement.
                </div>
              ) : needsPayout ? (
                <button disabled={busy} onClick={() => setPayoutOpen(true)}
                  className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                  {busy ? "Working…" : `Complete & pay out ${formatTaka(payoutPaisa)}`}
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

          {/*  audit 11 Sep 2026 #30 — a draft had no way forward at all: the
               status was in every filter and reachable by nothing. Submitting
               re-runs the same checks the create ran.  */}
          {isDraft && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-2">
              <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>Draft</div>
              <button disabled={busy} onClick={() => act(() => submitReturn(id), "Submitted")}
                className="w-full text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px]" style={{ background: ACCENT }}>
                {busy ? "Working…" : "Submit this return"}
              </button>
            </div>
          )}

          {pending && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-2">
              <div className="text-[13px] font-semibold" style={{ color: "#f7c06e" }}>Needs approval</div>
              {/*  audit #31 — the two reasons somebody cannot decide this, each
                   said plainly instead of a button that returns 403.  */}
              {isRequester && (
                <div className="text-[12px] text-body-soft">
                  You raised this return — somebody else has to approve it.
                </div>
              )}
              {!isRequester && !mayApprove && (
                <div className="text-[12px] text-body-soft">
                  Only the owner or a manager can approve this.
                </div>
              )}
              <div className="flex gap-2">
                <button disabled={busy || !canApprove} onClick={() => act(() => approveReturn(id), "Approved")}
                  className="flex-1 text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] disabled:opacity-40" style={{ background: ACCENT }}>Approve</button>
                <button disabled={busy || !mayApprove} onClick={() => setAsk({ kind: "reject" })}
                  className="flex-1 text-[13px] font-medium px-4 py-2.5 rounded-[10px] border border-[#4d2e2e] text-[#e1837a] disabled:opacity-40">Reject</button>
              </div>
            </div>
          )}

          {canCancel && (
            <button disabled={busy} onClick={() => setAsk({ kind: "cancel" })}
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
          {/*  audit #32 — a one-click Delete on a document with a customer
               behind it. It asks now, and says what it removes.  */}
          {r.status !== "completed" && (
            <button disabled={busy} onClick={() => setAsk({ kind: "delete" })}
              className="w-full text-[12px] px-4 py-2 rounded-[10px] text-[#e1837a]">Delete</button>
          )}
        </div>
      </div>

      {/*  ═══ audit 11 Sep 2026 #32 — SAY WHY ═══
           Reject and Cancel both end a claim a customer made, and both used to
           happen on one click with nothing written down. The reason is required
           (the API refuses an empty one), it is stored on the return and it
           shows on the timeline, so the next person to answer that customer's
           phone call can see who decided what, and why.  */}
      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(10,6,16,0.62)" }}
          role="dialog" aria-modal="true">
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-5 w-full max-w-[420px]">
            <div className="text-[15px] font-semibold mb-1" style={{ color: ASK_META[ask.kind].tone }}>
              {ASK_META[ask.kind].title}
            </div>
            <div className="text-[12.5px] text-body-soft mb-3">{ASK_META[ask.kind].blurb(r.returnNo)}</div>

            {ask.kind !== "delete" && (
              <>
                <label className="lbl">Why {ASK_META[ask.kind].verb}</label>
                <input className="ipt" autoFocus value={askWhy} onChange={(e) => setAskWhy(e.target.value)}
                  placeholder={ASK_META[ask.kind].placeholder}
                  onKeyDown={(e) => { if (e.key === "Enter" && askWhy.trim()) runAsk(); }} />
              </>
            )}

            <div className="flex gap-2 mt-4">
              <button className="flex-1 text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep"
                onClick={() => { setAsk(null); setAskWhy(""); }}>Keep it</button>
              <button disabled={busy || (ask.kind !== "delete" && !askWhy.trim())}
                onClick={runAsk}
                className="flex-1 text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] disabled:opacity-40"
                style={{ background: ASK_META[ask.kind].tone }}>
                {busy ? "Working…" : ASK_META[ask.kind].confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {payoutOpen && (
        <RefundDialog
          title="Refund the customer"
          who={r.order?.orderNo}
          amountPaisa={payoutPaisa}
          amountLabel="Paying back"
          /*  DEC-FIN-031 — when the money is going back down the gateway, say
              so here, because it behaves differently from every other option
              on this list: it is SENT now and ARRIVES in a few days. A
              customer told "done" who then waits three days phones the shop.  */
          note={
            refundMethod === "GATEWAY"
              ? "Goes back to the card it came from — the customer sees it in a few days."
              : r.resolution === "PARTIAL_COMPENSATION"
                ? `The customer keeps the goods · agreed ${formatTaka(r.compensationPaisa)}`
                : `Return value ${formatTaka(r.returnValuePaisa)} · collected on the order ${formatTaka(r.order?.paidPaisa ?? 0)}`
          }
          methods={payoutOptions}
          method={refundMethod} onMethod={(v) => setRefundMethod(v as ReturnRefundMethod)}
          methodPlaceholder="Where does the money go back from…"
          /*  (owner, 11 Sep 2026) say what the picked till actually does. Cash
              is the one that surprises people: the notes physically leave the
              counter box, and day-close counts them missing unless the person
              paying knows that is what they chose.  */
          methodNote={
            refundMethod === "CASH"
              ? "Cash out of the counter cash box — day close will count these notes gone."
              : refundMethod === "ORIGINAL"
                ? "Back the way it was paid — on a cash-on-delivery bill, the counter cash box."
                : refundMethod
                  ? "Sent by hand from that account — write the reference below so it can be matched later."
                  : undefined
          }
          accountId={refundAccountId} onAccount={setRefundAccountId}
          reference={refundRef} onReference={setRefundRef}
          busy={busy} error={err || null} confirmLabel="Pay out"
          onConfirm={async () => {
            await act(
              () => completeReturn(id, {
                refundMethod,
                refundAccountId: refundAccountId || undefined,
                refundReference: refundRef || undefined,
                /*  audit #12 — the screen tells the API what it believes it is
                    paying. The API checks it against its own cap and REFUSES
                    anything above it rather than quietly paying a different
                    number than the one on this dialog.  */
                payoutPaisa,
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
                <button className="text-[11.5px] text-[#e1837a] underline" onClick={() => deleteReturnReason(r.id).then(load)}>remove</button>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 space-y-2">
            <input className="ipt" placeholder="New reason (e.g. Damaged on arrival)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <div className="flex items-center gap-2">
              {/*  no Store credit here either — it is a resolution, not a till
                   (audit 11 Sep 2026). A reason saved with it before today
                   still displays; it just cannot be chosen again.  */}
              <select className="ipt flex-1" value={newMethod} onChange={(e) => setNewMethod(e.target.value as ReturnRefundMethod)}>
                {refundMethods.map((m) => <option key={m} value={m}>{m === "ORIGINAL" ? "Original method" : m}</option>)}
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
        <Info text="A share of what the customer actually paid, never of the order total." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-body-soft mb-2.5">
            Not made yet
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
            <Info text="The stems are cut — the stock does not come back." />
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
            <Info text="Fixed at nothing — not a setting." />
          </div>
          <div className="flex items-center gap-2" style={{ minHeight: 42 }}>
            <span className="font-display text-[22px] text-purple tabular-nums">0</span>
            <span className="text-[13px] font-semibold text-body-soft">% — nothing comes back</span>
          </div>
        </div>
      </div>

      {saved && <div className="text-[13px] font-semibold text-[#76efc3] mt-3">Saved ✓</div>}
    </div>
  );
}

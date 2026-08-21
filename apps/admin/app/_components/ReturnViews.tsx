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
  RETURN_STATUS_META, RESOLUTION_LABEL,
  type ApiReturn, type ReturnAnalytics, type EligibleOrder, type ApiReturnReason,
  type ReturnSettings, type ReturnResolution, type ReturnRefundMethod, type ReturnRestockAction,
  type ReturnStatus, type ApiOrder,
} from "../_data/api";
import { RefundDialog } from "./MoneyBlock";

const REFUND_METHODS: ReturnRefundMethod[] = ["ORIGINAL", "CASH", "BKASH", "NAGAD", "CARD", "BANK", "STORE_CREDIT"];
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

/* ================================================================== NEW RETURN */

type LineDraft = { checked: boolean; qty: number; restockAction: ReturnRestockAction };

export function NewReturn() {
  const router = useRouter();
  const [orderSearch, setOrderSearch] = useState("");
  const [orderHits, setOrderHits] = useState<ApiOrder[]>([]);
  const [el, setEl] = useState<EligibleOrder | null>(null);
  const [reasons, setReasons] = useState<ApiReturnReason[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [reasonId, setReasonId] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>("ORIGINAL");
  const [compensationTk, setCompensationTk] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { getReturnReasons().then(setReasons).catch(() => {}); }, []);

  /*  Counter bills are orders too (DEC-POS-001) but the online list hides them,
      so searching a POS number found nothing at all (owner, 21 Aug). Returns
      asks for both, and the screen offers the recent ones without a search.  */
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
      });
      router.push(`/returns/${created.id}`);
    } catch (e) { setErr(msg(e, "Could not create return")); setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Returns & Refunds"
        title="New return"
        blurb="Only a delivered order can be returned. Pick the order, choose the lines coming back and how each is handled, then set the resolution."
        right={<Link href="/returns" className="text-[13px] px-4 py-2.5 rounded-[10px] border border-lavender-deep">← Back</Link>}
      />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}

      {!el && (
        <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-5 max-w-[720px]">
          <label className="lbl">Pick the delivered order</label>
          {/*  two ways in, because a counter bill is remembered by its number and a
               website order by the customer's name (owner, 21 Aug)  */}
          <select className="ipt mt-1" value={el ? (el as EligibleOrder).order.id : ""}
            onChange={(e) => e.target.value && pickOrder(e.target.value)}>
            <option value="">Choose from the recent delivered orders…</option>
            {orderHits.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} · {o.customer?.name ?? o.senderName} · {formatTaka(o.totalPaisa)} · {new Date(o.placedAt).toLocaleDateString()}
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
              return (
                <div key={l.orderLineId} className={`px-4 py-3 border-b border-lavender-deep ${disabled ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" disabled={disabled} checked={d?.checked ?? false}
                      onChange={(e) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, checked: e.target.checked } }))} />
                    <div className="flex-1">
                      <div className="text-[13.5px] font-medium">{l.name}
                        <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: l.productType === "CRAFTED" ? "#fff4e6" : "#eef", color: l.productType === "CRAFTED" ? "#b45309" : "#3730a3" }}>{l.productType}</span>
                      </div>
                      <div className="text-[12px] text-body-soft">{formatTaka(l.unitPaisa)} each · ordered {l.qty}{l.returnedQty > 0 ? ` · already returned ${l.returnedQty}` : ""}</div>
                    </div>
                    {d?.checked && !disabled && (
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={l.returnableQty} className="ipt w-[70px]" value={d.qty}
                          onChange={(e) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, qty: Math.max(1, Math.min(l.returnableQty, parseInt(e.target.value, 10) || 1)) } }))} />
                        <select className="ipt w-[130px]" value={d.restockAction}
                          onChange={(e) => setDrafts((s) => ({ ...s, [l.orderLineId]: { ...d, restockAction: e.target.value as ReturnRestockAction } }))}>
                          <option value="RESTOCK">Restock</option>
                          <option value="WRITE_OFF">Write-off</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* resolution panel */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-3">
            <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>Resolution</div>
            <div>
              <label className="lbl">Reason</label>
              <select className="ipt" value={reasonId} onChange={(e) => {
                setReasonId(e.target.value);
                const r = reasons.find((x) => x.id === e.target.value);
                if (r) setRefundMethod(r.defaultRefundMethod);
              }}>
                <option value="">— pick a reason —</option>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}{r.requiresApproval ? " (needs approval)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Note</label>
              <input className="ipt" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder="What happened…" />
            </div>
            <div>
              <label className="lbl">Resolution type</label>
              <select className="ipt" value={resolution} onChange={(e) => setResolution(e.target.value as ReturnResolution)}>
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{RESOLUTION_LABEL[r]}</option>)}
              </select>
            </div>
            {resolution === "PARTIAL_COMPENSATION" && (
              <div>
                <label className="lbl">Compensation (৳)</label>
                <input className="ipt" type="number" value={compensationTk} onChange={(e) => setCompensationTk(e.target.value)} placeholder="e.g. 200" />
              </div>
            )}
            {resolution !== "REPLACEMENT" && (
              <div>
                <label className="lbl">Refund method</label>
                <select className="ipt" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as ReturnRefundMethod)}>
                  {REFUND_METHODS.map((m) => <option key={m} value={m}>{m === "ORIGINAL" ? "Original method" : m === "STORE_CREDIT" ? "Store credit" : m}</option>)}
                </select>
              </div>
            )}
            <div className="pt-2 border-t border-lavender-deep text-[13px]">
              Selected goods value: <b>{formatTaka(selectedValue)}</b>
              <div className="text-[11.5px] text-body-soft mt-0.5">Actual payout is capped at collected ({formatTaka(el.refundableCap)}) when you complete.</div>
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
  const [payoutOpen, setPayoutOpen] = useState(false);
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

          {/* timeline */}
          <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4">
            <div className="text-[13px] font-semibold mb-2" style={{ color: ACCENT }}>Timeline</div>
            <div className="space-y-2">
              {timeline.map((t) => (
                <div key={t.id} className="text-[12.5px] flex gap-2">
                  <span className="text-body-soft w-[120px] shrink-0">{new Date(t.createdAt).toLocaleString()}</span>
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
              {/*  paying a refund is money leaving, so it goes through the house
                   dialog like every other movement (CLAUDE.md §14)  */}
              <button disabled={busy} onClick={() => setPayoutOpen(true)}
                className="w-full text-white text-[13.5px] font-medium px-4 py-3 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                {busy ? "Working…" : r.resolution === "REPLACEMENT" ? "Complete return" : "Complete & pay out"}
              </button>
              <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                The payout is capped at what was actually collected (DEC-RTN-008).
              </p>
            </div>
          )}

          {canApprove && (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft p-4 space-y-2">
              <div className="text-[13px] font-semibold" style={{ color: "#c77700" }}>Needs approval</div>
              <p className="text-[12.5px] text-body-soft m-0">Perishable/crafted goods or a large amount need a sign-off before payout.</p>
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
          amountPaisa={Math.min(r.returnValuePaisa, r.order?.paidPaisa ?? r.returnValuePaisa)}
          amountLabel="Paying back"
          note={`Return value ${formatTaka(r.returnValuePaisa)} · collected on the order ${formatTaka(r.order?.paidPaisa ?? 0)}`}
          methods={REFUND_METHODS.map((m) => ({
            id: m,
            label: m === "ORIGINAL" ? "Original method" : m === "STORE_CREDIT" ? "Store credit" : m.charAt(0) + m.slice(1).toLowerCase(),
          }))}
          method={refundMethod} onMethod={(v) => setRefundMethod(v as ReturnRefundMethod)}
          reference={refundRef} onReference={setRefundRef}
          busy={busy} error={err || null} confirmLabel="Pay out"
          onConfirm={async () => {
            await act(() => completeReturn(id, { refundMethod, refundReference: refundRef || undefined }), "Return completed");
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
                {REFUND_METHODS.map((m) => <option key={m} value={m}>{m === "ORIGINAL" ? "Original method" : m === "STORE_CREDIT" ? "Store credit" : m}</option>)}
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
    </div>
  );
}

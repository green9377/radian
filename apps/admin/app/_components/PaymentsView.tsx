"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listOrders,
  listOnlinePayments,
  listReturns,
  approveReturn,
  rejectReturn,
  addOrderPayment,
  paymentLabel,
  formatTaka,
  WEB_BASE,
  type ApiOrder,
  type ApiOnlinePayment,
  type ApiReturn,
  type ReturnStatus,
} from "../_data/api";
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE,
  Pill, ActButton, Band, BandButton, Segs, Search, Count, Head, Empty,
  fmtStamp, fmtDay, type Tile,
} from "./OrdersUi";

/*
  Orders -> Payments (owner, 9 Sep 2026; design/orders-module-v5.html).

  One page instead of Payments + Online payments. Three tabs on one band:
    Orders            every website order from the money side — Total / Paid /
                      Due, record cash or an advance, send the pay link, refund
    Gateway attempts  every trip to SSLCommerz (bKash, Nagad, card) — success,
                      failed, cancelled — with the gateway's own reason and
                      references. READ ONLY: a payment is written by the
                      gateway callback and nowhere else.
    Returns & refunds the Returns book, website door only. Same record as the
                      Returns module (One Data One Owner) — approve or reject
                      here, pay out on the return itself.
*/

type Tab = "orders" | "gateway" | "returns";
const TABS: [Tab, string][] = [
  ["orders", "Orders"],
  ["gateway", "Gateway attempts"],
  ["returns", "Returns & refunds"],
];

/* ---------- orders tab ---------- */
type OSeg = "" | "paid" | "due" | "unpaid_online" | "refunded";
const OSEGS: [OSeg, string][] = [
  ["", "All"],
  ["paid", "Paid"],
  ["due", "Due"],
  ["unpaid_online", "Unpaid online"],
  ["refunded", "Refunded"],
];
function inOSeg(o: ApiOrder, s: OSeg): boolean {
  const open = o.salesStatus !== "cancelled";
  switch (s) {
    case "":
      return true;
    case "paid":
      return o.paymentStatus === "paid" || o.paymentStatus === "cod_collected";
    case "due":
      return open && o.duePaisa > 0 && (o.paymentMethod === "cod" || o.paymentStatus === "advance_paid");
    case "unpaid_online":
      return open && o.paymentMethod === "online" && o.paymentStatus === "unpaid";
    case "refunded":
      return o.paymentStatus === "refunded" || o.paymentStatus === "partially_refunded";
  }
}
function payColour(o: ApiOrder): string {
  switch (o.paymentStatus) {
    case "paid":
    case "cod_collected":
      return SOLID.green;
    case "advance_paid":
      return SOLID.amber;
    case "refunded":
    case "partially_refunded":
      return SOLID.grey;
    default:
      return o.paymentMethod === "cod" ? SOLID.purple : SOLID.red;
  }
}
type Kind = "COD_COLLECTED" | "ADVANCE" | "PAYMENT" | "REFUND";
const KINDS: [Kind, string][] = [
  ["COD_COLLECTED", "Cash collected"],
  ["ADVANCE", "Advance received"],
  ["PAYMENT", "Payment received"],
  ["REFUND", "Refund given"],
];

function OrderRow({ o, onChanged }: { o: ApiOrder; onChanged: () => void }) {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(o.paymentMethod === "cod" ? "COD_COLLECTED" : "PAYMENT");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelled = o.salesStatus === "cancelled";
  const refunded = o.paymentStatus === "refunded" || o.paymentStatus === "partially_refunded";
  const name = o.customer?.name ?? o.senderName;
  const day = fmtDay(o.date);
  const when = cancelled ? "Cancelled" : [day?.label, o.slotLabel || o.methodLabel].filter(Boolean).join(" · ");
  const last = o.transactions && o.transactions.length ? o.transactions[0] : null;
  const unpaidOnline = !cancelled && o.paymentMethod === "online" && o.paymentStatus === "unpaid";
  const payLink = `${WEB_BASE}/pay/${encodeURIComponent(o.orderNo)}`;
  const wa = `https://wa.me/${o.senderPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${name}, this is Radian. Your order ${o.orderNo} is waiting for payment — pay here: ${payLink}`)}`;
  const due = cancelled ? 0 : o.duePaisa;

  async function save() {
    const paisa = amt ? Math.round(Number(amt) * 100) : kind === "REFUND" ? o.paidPaisa - o.refundPaisa : due;
    if (!paisa || paisa <= 0) {
      say.bad("Type how much first.");
      return;
    }
    setBusy(true);
    try {
      await addOrderPayment(o.id, { kind, amountPaisa: paisa });
      setOpen(false);
      setAmt("");
      onChanged();
    } catch (e) {
      say.fromError(e, "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[#231538]">
      <td className={`${CELL} w-[34px]`}>
        <Said say={say} />
        <input type="checkbox" className="w-[15px] h-[15px] accent-purple mt-0.5" aria-label={`Select ${o.orderNo}`} />
      </td>
      <td className={`${CELL} w-[130px]`}>
        <Link href={`/orders/${o.id}`} className={NO}>{o.orderNo}</Link>
        <span className={LABEL}>{when || fmtStamp(o.placedAt)}</span>
      </td>
      <td className={CELL}>
        <Link href={`/orders/${o.id}`} className={NAME}>{name}</Link>
        <span className={`block ${SOFT}`}>{o.senderPhone}</span>
      </td>
      <td className={`${CELL} w-[150px]`}>
        <Pill colour={o.paymentMethod === "cod" ? SOLID.purple : refunded ? SOLID.grey : SOLID.indigo}>
          {o.paymentMethod === "cod" ? "Cash on delivery" : o.paymentStatus === "advance_paid" ? "Online + COD" : "Online"}
        </Pill>
      </td>
      <td className={`${CELL} w-[150px]`}>
        <Pill colour={payColour(o)}>{cancelled && !refunded ? "—" : paymentLabel(o.paymentStatus, o.paymentMethod)}</Pill>
      </td>
      <td className={`${CELL} w-[100px] text-right whitespace-nowrap font-medium`}>{formatTaka(o.totalPaisa)}</td>
      <td className={`${CELL} w-[100px] text-right whitespace-nowrap font-medium`} style={{ color: o.paidPaisa > 0 ? SOLID.green : SOLID.grey }}>
        {formatTaka(o.paidPaisa)}
      </td>
      <td className={`${CELL} w-[100px] text-right whitespace-nowrap font-medium`} style={{ color: due > 0 ? SOLID.red : SOLID.grey }}>
        {refunded ? <span style={{ color: SOLID.grey }}>−{formatTaka(o.refundPaisa)}</span> : formatTaka(due)}
      </td>
      <td className={`${CELL} w-[190px]`}>
        {last ? (
          <>
            <span className={VALUE}>
              {last.kind === "REFUND" ? "− " : "+ "}{formatTaka(last.amountPaisa)} · {last.method === "cod" ? "cash" : "online"}
            </span>
            <span className={`block ${SOFT}`}>{fmtStamp(last.createdAt)} · {last.actorName}</span>
          </>
        ) : (
          <span className={SOFT}>—</span>
        )}
      </td>
      <td className={`${CELL} w-[170px]`}>
        <div className="flex flex-col gap-1.5">
          {unpaidOnline && <ActButton kind="primary" href={wa} external>Send pay link</ActButton>}
          {!cancelled && due > 0 && !unpaidOnline && (
            <ActButton kind="primary" onClick={() => setOpen((v) => !v)}>Record cash</ActButton>
          )}
          {!cancelled && (due <= 0 || unpaidOnline) && (
            <ActButton onClick={() => setOpen((v) => !v)}>{o.paidPaisa - o.refundPaisa > 0 && due <= 0 ? "Refund" : "Record payment"}</ActButton>
          )}
          <ActButton href={`/orders/${o.id}`}>Open</ActButton>
          {open && (
            <div className="mt-1 rounded-[12px] border border-[#3e3447] bg-white p-2.5 w-[220px] flex flex-col gap-2">
              <select className="ipt h-[34px] text-[12.5px]" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                className="ipt h-[34px] text-[12.5px]"
                placeholder={`৳ ${Math.round((kind === "REFUND" ? o.paidPaisa - o.refundPaisa : due) / 100)}`}
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
              />
              <ActButton kind="solid" colour={kind === "REFUND" ? SOLID.red : SOLID.green} onClick={save} disabled={busy}>
                {busy ? "…" : "Save"}
              </ActButton>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ---------- gateway tab ---------- */
const GW: Record<string, { label: string; colour: string }> = {
  SUCCESS: { label: "Success", colour: SOLID.green },
  FAILED: { label: "Failed", colour: SOLID.red },
  CANCELLED: { label: "Cancelled", colour: SOLID.grey },
  INITIATED: { label: "Went to pay", colour: SOLID.amber },
};
type GSeg = "ALL" | "SUCCESS" | "FAILED" | "CANCELLED" | "INITIATED";
const GSEGS: [GSeg, string][] = [
  ["ALL", "All"],
  ["SUCCESS", "Success"],
  ["FAILED", "Failed"],
  ["CANCELLED", "Cancelled"],
  ["INITIATED", "Went to pay"],
];
function paidWith(p: ApiOnlinePayment): string {
  const c = (p.cardType ?? "").toUpperCase();
  if (c.includes("BKASH")) return "bKash";
  if (c.includes("NAGAD")) return "Nagad";
  if (c.includes("ROCKET")) return "Rocket";
  if (c.includes("VISA")) return "Visa";
  if (c.includes("MASTER")) return "Mastercard";
  if (c.includes("AMEX")) return "Amex";
  return p.cardType || "—";
}

function GatewayRow({ p, order }: { p: ApiOnlinePayment; order: ApiOrder | undefined }) {
  const s = GW[p.status] ?? { label: p.status, colour: SOLID.grey };
  const stillUnpaid = order && order.salesStatus !== "cancelled" && order.paymentMethod === "online" && order.paymentStatus === "unpaid";
  const name = order?.customer?.name ?? order?.senderName;
  const payLink = p.order ? `${WEB_BASE}/pay/${encodeURIComponent(p.order.orderNo)}` : null;
  const wa =
    order && payLink
      ? `https://wa.me/${order.senderPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${name}, this is Radian. Your order ${order.orderNo} is waiting for payment — pay here: ${payLink}`)}`
      : null;
  return (
    <tr className="hover:bg-[#231538]">
      <td className={`${CELL} w-[140px]`}>
        <span className={VALUE}>{fmtStamp(p.createdAt)}</span>
        {p.settledAt && <span className={LABEL}>settled {fmtStamp(p.settledAt)}</span>}
      </td>
      <td className={`${CELL} w-[120px]`}>
        {p.order ? <Link href={`/orders/${p.order.id}`} className={NO}>{p.order.orderNo}</Link> : <span className={SOFT}>—</span>}
      </td>
      <td className={CELL}>
        {order ? (
          <>
            <Link href={`/orders/${order.id}`} className={NAME}>{name}</Link>
            <span className={`block ${SOFT}`}>{order.senderPhone}</span>
          </>
        ) : (
          <span className={SOFT}>—</span>
        )}
      </td>
      <td className={`${CELL} w-[120px]`}>
        <span className={VALUE}>{paidWith(p)}</span>
        <span className={`block ${SOFT}`}>{p.provider === "SSLCOMMERZ" ? "SSLCommerz" : p.provider}</span>
      </td>
      <td className={`${CELL} w-[190px]`}>
        <Pill colour={s.colour}>{s.label}</Pill>
        {p.gatewayReason && <span className="block mt-1 font-medium leading-snug" style={{ color: p.status === "FAILED" ? SOLID.red : "#afa4b7" }}>{p.gatewayReason}</span>}
      </td>
      <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
        <span className="font-medium">{formatTaka(p.amountPaisa)}</span>
        {p.storeAmountPaisa !== null && <span className={LABEL}>kept {formatTaka(p.storeAmountPaisa)}</span>}
      </td>
      <td className={`${CELL} w-[210px]`}>
        <span className={`${VALUE} break-all`}>{p.tranId}</span>
        <span className={`block ${SOFT} break-all`}>
          {p.bankTranId ? `bank ${p.bankTranId}` : "no bank reference"}
          {p.valId ? ` · val ${p.valId.slice(0, 10)}…` : ""}
        </span>
      </td>
      <td className={`${CELL} w-[160px]`}>
        <div className="flex flex-col gap-1.5">
          {stillUnpaid && wa && <ActButton kind="primary" href={wa} external>Send pay link</ActButton>}
          {p.order && <ActButton href={`/orders/${p.order.id}`}>Open order</ActButton>}
        </div>
      </td>
    </tr>
  );
}

/* ---------- returns tab ---------- */
type RSeg = "open" | "approved" | "completed" | "rejected";
const RSEGS: [RSeg, string][] = [
  ["open", "Open"],
  ["approved", "Approved"],
  ["completed", "Completed"],
  ["rejected", "Rejected"],
];
function inRSeg(r: ApiReturn, s: RSeg): boolean {
  switch (s) {
    case "open":
      return r.status === "draft" || r.status === "pending_approval";
    case "approved":
      return r.status === "approved";
    case "completed":
      return r.status === "completed";
    case "rejected":
      return r.status === "rejected" || r.status === "cancelled";
  }
}
const RSTATUS: Record<ReturnStatus, { label: string; colour: string }> = {
  draft: { label: "Draft", colour: SOLID.grey },
  pending_approval: { label: "Pending approval", colour: SOLID.amber },
  approved: { label: "Approved", colour: SOLID.indigo },
  completed: { label: "Completed", colour: SOLID.green },
  rejected: { label: "Rejected", colour: SOLID.red },
  cancelled: { label: "Cancelled", colour: SOLID.grey },
};
const RESOLUTION: Record<ApiReturn["resolution"], string> = {
  REFUND: "Refund",
  REPLACEMENT: "Replacement",
  PARTIAL_COMPENSATION: "Partial compensation",
  STORE_CREDIT: "Store credit",
};
const METHOD: Record<string, string> = {
  CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", CARD: "Card", BANK: "Bank", ORIGINAL: "Original method", GATEWAY: "Gateway", STORE_CREDIT: "Store credit",
};

function ReturnRow({ r, onChanged }: { r: ApiReturn; onChanged: () => void }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const st = RSTATUS[r.status] ?? { label: r.status, colour: SOLID.grey };
  const money = r.refundPaisa || r.compensationPaisa || r.storeCreditPaisa || r.returnValuePaisa;
  const lines = (r.lines ?? []).map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ");

  async function run(f: () => Promise<unknown>, fail: string) {
    setBusy(true);
    try {
      await f();
      onChanged();
    } catch (e) {
      say.fromError(e, fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[#231538]">
      <td className={`${CELL} w-[34px]`}>
        <Said say={say} />
        <input type="checkbox" className="w-[15px] h-[15px] accent-purple mt-0.5" aria-label={`Select ${r.returnNo}`} />
      </td>
      <td className={`${CELL} w-[130px]`}>
        <Link href={`/returns/${r.id}`} className={NO}>{r.returnNo}</Link>
        <span className={LABEL}>{fmtStamp(r.createdAt)}</span>
      </td>
      <td className={`${CELL} w-[120px]`}>
        {r.order ? <Link href={`/orders/${r.order.id}`} className={NO}>{r.order.orderNo}</Link> : <span className={SOFT}>—</span>}
        {r.order && <span className={LABEL}>paid {formatTaka(r.order.paidPaisa)}</span>}
      </td>
      <td className={CELL}>
        {r.customer ? (
          <>
            <Link href={`/customers/${r.customer.id}`} className={NAME}>{r.customer.name}</Link>
            {r.customer.phone && <span className={`block ${SOFT}`}>{r.customer.phone}</span>}
          </>
        ) : (
          <span className={SOFT}>—</span>
        )}
      </td>
      <td className={CELL}>
        <span className={VALUE}>{r.reason?.label ?? r.reasonNote ?? "—"}</span>
        {r.reason && r.reasonNote && <span className={`block ${SOFT}`}>{r.reasonNote}</span>}
        <span className={`block ${SOFT}`}>by {r.actorName}</span>
      </td>
      <td className={`${CELL} w-[190px]`}>
        <span className={VALUE}>{RESOLUTION[r.resolution] ?? r.resolution}</span>
        {lines && <span className={`block ${SOFT}`}>{lines}</span>}
      </td>
      <td className={`${CELL} w-[110px] text-right whitespace-nowrap`}>
        <span className="font-medium">{formatTaka(money)}</span>
        <span className={LABEL}>{METHOD[r.refundMethod] ?? r.refundMethod}{r.refundReference ? ` · ${r.refundReference}` : ""}</span>
      </td>
      <td className={`${CELL} w-[150px]`}>
        <Pill colour={st.colour}>{st.label}</Pill>
        {r.approvedAt && <span className={LABEL}>{r.approvedBy ?? ""} · {fmtStamp(r.approvedAt)}</span>}
      </td>
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {r.status === "pending_approval" && (
            <>
              <ActButton kind="solid" colour={SOLID.green} disabled={busy} onClick={() => run(() => approveReturn(r.id), "Could not approve.")}>Approve</ActButton>
              <ActButton disabled={busy} onClick={() => run(() => rejectReturn(r.id), "Could not reject.")}>Reject</ActButton>
            </>
          )}
          {r.status === "approved" && <ActButton kind="primary" href={`/returns/${r.id}`}>Pay out</ActButton>}
          {r.status === "draft" && <ActButton kind="primary" href={`/returns/${r.id}`}>Finish</ActButton>}
          <ActButton href={`/returns/${r.id}`}>Open</ActButton>
        </div>
      </td>
    </tr>
  );
}

/* ---------- the page ---------- */
const HELP =
  "Money on website orders, in one place. Orders: what each order owes or paid; record cash and advances here, send the pay link to an unpaid online order. " +
  "Gateway attempts: every trip to SSLCommerz, read only — a payment is written when the gateway confirms it to us, never by hand. " +
  "Returns & refunds: the Returns book for website orders; approve or reject here, pay out on the return. Collected counts every payment recorded; To collect is every unpaid balance on an open order.";

export default function PaymentsView() {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [gw, setGw] = useState<{ rows: ApiOnlinePayment[]; counts: Record<string, number> } | null>(null);
  const [rets, setRets] = useState<ApiReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [oseg, setOseg] = useState<OSeg>("");
  const [gseg, setGseg] = useState<GSeg>("ALL");
  const [rseg, setRseg] = useState<RSeg>("open");
  const [method, setMethod] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [o, g, r] = await Promise.all([listOrders(), listOnlinePayments({ take: 200 }), listReturns({ channel: "online" })]);
      setOrders(o.items);
      setGw(g);
      setRets(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const needle = q.trim().toLowerCase();

  const ocounts = useMemo(() => {
    const c: Record<OSeg, number> = { "": orders.length, paid: 0, due: 0, unpaid_online: 0, refunded: 0 };
    for (const o of orders) for (const [k] of OSEGS) if (k && inOSeg(o, k)) c[k]++;
    return c;
  }, [orders]);
  const orows = useMemo(
    () =>
      orders.filter((o) => {
        const name = (o.customer?.name ?? o.senderName).toLowerCase();
        const okQ = !needle || o.orderNo.toLowerCase().includes(needle) || name.includes(needle) || o.senderPhone.includes(needle);
        const okM = !method || o.paymentMethod === method;
        return okQ && okM && inOSeg(o, oseg);
      }),
    [orders, needle, method, oseg],
  );
  const grows = useMemo(
    () =>
      (gw?.rows ?? []).filter((p) => {
        const okS = gseg === "ALL" || p.status === gseg;
        const o = p.order ? byId.get(p.order.id) : undefined;
        const okQ =
          !needle ||
          p.tranId.toLowerCase().includes(needle) ||
          (p.bankTranId ?? "").toLowerCase().includes(needle) ||
          (p.order?.orderNo ?? "").toLowerCase().includes(needle) ||
          (o?.senderPhone ?? "").includes(needle) ||
          (o?.customer?.name ?? o?.senderName ?? "").toLowerCase().includes(needle);
        return okS && okQ;
      }),
    [gw, gseg, needle, byId],
  );
  const rcounts = useMemo(() => {
    const c: Record<RSeg, number> = { open: 0, approved: 0, completed: 0, rejected: 0 };
    for (const r of rets) for (const [k] of RSEGS) if (inRSeg(r, k)) c[k]++;
    return c;
  }, [rets]);
  const rrows = useMemo(
    () =>
      rets.filter((r) => {
        const okQ =
          !needle ||
          r.returnNo.toLowerCase().includes(needle) ||
          (r.order?.orderNo ?? "").toLowerCase().includes(needle) ||
          (r.customer?.name ?? "").toLowerCase().includes(needle) ||
          (r.customer?.phone ?? "").includes(needle);
        return okQ && inRSeg(r, rseg);
      }),
    [rets, needle, rseg],
  );

  const stats = useMemo(() => {
    let collected = 0, cash = 0, toCollect = 0, dueOrders = 0, unpaidOnline = 0, unpaidPaisa = 0;
    for (const o of orders) {
      collected += o.paidPaisa;
      if (o.paymentMethod === "cod") cash += o.paidPaisa;
      if (o.salesStatus !== "cancelled" && o.duePaisa > 0) {
        if (o.paymentMethod === "online" && o.paymentStatus === "unpaid") {
          unpaidOnline++;
          unpaidPaisa += o.totalPaisa;
        } else {
          toCollect += o.duePaisa;
          dueOrders++;
        }
      }
    }
    const failed = (gw?.counts.FAILED ?? 0) + (gw?.counts.CANCELLED ?? 0);
    const pending = rets.filter((r) => r.status === "pending_approval" || r.status === "approved");
    const pendingPaisa = pending.reduce((n, r) => n + (r.refundPaisa || r.compensationPaisa || r.storeCreditPaisa), 0);
    return { collected, cash, toCollect, dueOrders, unpaidOnline, unpaidPaisa, failed, all: gw?.counts.ALL ?? 0, pending: pending.length, pendingPaisa };
  }, [orders, gw, rets]);

  const v = (s: string) => (loading ? "…" : s);
  const tiles: Tile[] = [
    { key: "collected", label: "Collected", value: v(formatTaka(stats.collected)), sub: loading ? undefined : `online ${formatTaka(stats.collected - stats.cash)} · cash ${formatTaka(stats.cash)}` },
    { key: "due", label: "To collect", value: v(formatTaka(stats.toCollect)), hot: stats.toCollect > 0, sub: loading ? undefined : `${stats.dueOrders} order${stats.dueOrders === 1 ? "" : "s"} · COD & advance` },
    { key: "unpaid_online", label: "Unpaid online", value: v(String(stats.unpaidOnline)), sub: loading ? undefined : `${formatTaka(stats.unpaidPaisa)} waiting` },
    { key: "failed", label: "Gateway failed", value: v(String(stats.failed)), sub: loading ? undefined : `of ${stats.all} attempts` },
    { key: "refunds", label: "Refunds pending", value: v(String(stats.pending)), sub: loading ? undefined : `${formatTaka(stats.pendingPaisa)} to pay out` },
  ];
  const active = tab === "orders" ? (oseg === "due" ? "due" : oseg === "unpaid_online" ? "unpaid_online" : oseg === "" ? "collected" : undefined) : tab === "gateway" ? "failed" : "refunds";
  function onTile(k: string) {
    if (k === "collected") { setTab("orders"); setOseg(""); }
    if (k === "due") { setTab("orders"); setOseg("due"); }
    if (k === "unpaid_online") { setTab("orders"); setOseg("unpaid_online"); }
    if (k === "failed") { setTab("gateway"); setGseg("FAILED"); }
    if (k === "refunds") { setTab("returns"); setRseg("open"); }
  }

  const shown = tab === "orders" ? orows.length : tab === "gateway" ? grows.length : rrows.length;

  return (
    <div className={WRAP}>
      <Band title="Payments" help={HELP} tiles={tiles} active={active} onTile={onTile} right={<BandButton href="/returns/new" icon="plus">New return</BandButton>} />

      <div className="flex gap-0.5 border-b-[1.5px] border-[#3e3447] mb-3">
        {TABS.map(([k, label]) => {
          const on = tab === k;
          const n = k === "orders" ? orders.length : k === "gateway" ? (gw?.counts.ALL ?? 0) : rets.length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3.5 py-2.5 text-[13px] font-medium -mb-[1.5px] border-b-2 inline-flex items-center gap-1.5 ${on ? "text-purple border-purple" : "text-body-soft border-transparent hover:text-purple"}`}
            >
              {label}
              {!loading && <span className="text-[11px] px-1.5 rounded-full bg-lavender-deep text-purple">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        {tab === "orders" && <Segs items={OSEGS} value={oseg} counts={loading ? undefined : ocounts} onChange={setOseg} />}
        {tab === "gateway" && <Segs items={GSEGS} value={gseg} counts={loading ? undefined : (gw?.counts as Partial<Record<GSeg, number>> | undefined)} onChange={setGseg} />}
        {tab === "returns" && <Segs items={RSEGS} value={rseg} counts={loading ? undefined : rcounts} onChange={setRseg} />}
        <Search
          value={q}
          onChange={setQ}
          placeholder={tab === "orders" ? "Order no, name, phone" : tab === "gateway" ? "Order no, transaction id, bank reference, phone" : "Return no, order no, name, phone"}
        />
        {tab === "orders" && (
          <select className="ipt max-w-[170px] h-[40px] font-medium" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            <option value="online">Online</option>
            <option value="cod">Cash on delivery</option>
          </select>
        )}
        <Count n={shown} noun={tab === "orders" ? "order" : tab === "gateway" ? "attempt" : "return"} loading={loading} />
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className={TABLE_WRAP}>
        {tab === "orders" && (
          <table className={TABLE}>
            <Head heads={["", "Order No", "Customer", "Method", "Payment", "Total", "Paid", "Due", "Last movement", "Action"]} />
            <tbody>
              {orows.map((o) => (
                <OrderRow key={o.id} o={o} onChanged={load} />
              ))}
            </tbody>
          </table>
        )}
        {tab === "gateway" && (
          <table className={TABLE}>
            <Head heads={["When", "Order No", "Customer", "Paid with", "Result", "Amount", "Gateway reference", "Action"]} />
            <tbody>
              {grows.map((p) => (
                <GatewayRow key={p.id} p={p} order={p.order ? byId.get(p.order.id) : undefined} />
              ))}
            </tbody>
          </table>
        )}
        {tab === "returns" && (
          <table className={TABLE}>
            <Head heads={["", "Return No", "Order No", "Customer", "Reason", "Resolution", "Refund", "Status", "Action"]} />
            <tbody>
              {rrows.map((r) => (
                <ReturnRow key={r.id} r={r} onChanged={load} />
              ))}
            </tbody>
          </table>
        )}
        {!loading && shown === 0 && <Empty text="Nothing here." />}
      </div>
    </div>
  );
}

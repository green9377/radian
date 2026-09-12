"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listOrdersPage,
  orderStats,
  listOnlinePayments,
  listReturns,
  returnStats,
  approveReturn,
  rejectReturn,
  addOrderPayment,
  meCached,
  paymentLabel,
  formatTaka,
  takaToPaisa,
  WEB_BASE,
  type ApiOrder,
  type ApiOrderStats,
  type ApiOnlinePayment,
  type ApiReturn,
  type ReturnCounts,
  type ReturnStats,
  type ReturnStatus,
  type ApiMe,
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

  ═══ audit 11 Sep 2026 — NOTHING ON THIS PAGE IS COUNTED IN THE BROWSER ═══

  Every one of the three tabs used to pull one page (a hundred orders, two
  hundred gateway attempts, a hundred returns), then search, segment and total
  it here. So the band said "Collected ৳4.2 lakh" about the last hundred
  orders, the search box could not find an order from March, and the Gateway
  tab could only name a customer whose order happened to be inside that same
  hundred. All three now ask the server for a page and take their tiles from
  `GET /orders/stats` and `GET /returns/stats`, which count the whole shop.
*/

type Tab = "orders" | "gateway" | "returns";
const TABS: [Tab, string][] = [
  ["orders", "Orders"],
  ["gateway", "Gateway attempts"],
  ["returns", "Returns & refunds"],
];
const PAGE = 50;

/* ---------- orders tab ---------- */
/*  The segments the SERVER can answer, and only those. "Paid" and "Refunded"
    used to sit here too, filtered out of one page by `paymentStatus`, which
    `GET /orders` does not take — so they described a page and not the book.
    They are gone rather than wrong; see C.md ("Handover"), which asks for a
    `paymentStatus` filter so they can come back honestly.  */
type OSeg = "" | "due" | "online_due";
const OSEGS: [OSeg, string][] = [
  ["", "All"],
  ["due", "Still owing"],
  ["online_due", "Online, still owing"],
];
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

/*  audit 11 Sep 2026 — THE METHOD PILL SAID THE WRONG THING.
    It read `paymentStatus === "advance_paid" ? "Online + COD" : "Online"`, so
    an ONLINE order part-paid online was labelled "Online + COD" — a cash
    collection at the door that nobody is going to make, on an order the
    customer is meant to finish paying on the web. The method is the method;
    whether part of it is still owed is a separate sentence.  */
function methodPill(o: ApiOrder): { label: string; sub?: string; colour: string } {
  const cod = o.paymentMethod === "cod";
  const part = o.paidPaisa > 0 && o.duePaisa > 0 && o.salesStatus !== "cancelled";
  return {
    label: cod ? "Cash on delivery" : "Online",
    sub: part ? (cod ? "advance paid, rest at the door" : "part paid, rest online") : undefined,
    colour: cod ? SOLID.purple : SOLID.indigo,
  };
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
  const [open, setOpen] = useState<null | Kind>(null);
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
  const refundable = Math.max(0, o.paidPaisa - o.refundPaisa);
  const pill = methodPill(o);

  /*  audit 11 Sep 2026 — THE REFUND BUTTON OPENED THE WRONG BOX.
      The box's `kind` was set once, from the order's payment method, and the
      "Refund" button only toggled the box open — so pressing Refund on a paid
      online order showed a box already set to "Payment received", and a tired
      hand recorded a second PAYMENT where a REFUND was meant. The button now
      says which kind it is opening, and opens it on that.  */
  const openBox = (k: Kind) => {
    setOpen((cur) => (cur === k ? null : k));
    setAmt("");
  };

  async function save() {
    if (!open) return;
    const paisa = amt ? takaToPaisa(amt) : open === "REFUND" ? refundable : due;
    if (!paisa || paisa <= 0) {
      say.bad("Type how much first.");
      return;
    }
    if (open === "REFUND" && paisa > refundable) {
      say.bad(`Only ${formatTaka(refundable)} was collected and not yet given back.`);
      return;
    }
    setBusy(true);
    try {
      await addOrderPayment(o.id, { kind: open, amountPaisa: paisa });
      setOpen(null);
      setAmt("");
      onChanged();
    } catch (e) {
      say.fromError(e, "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[var(--s-accent)]">
      <td className={`${CELL} w-[130px]`}>
        <Said say={say} />
        <Link href={`/orders/${o.id}`} className={NO}>{o.orderNo}</Link>
        <span className={LABEL}>{when || fmtStamp(o.placedAt)}</span>
      </td>
      <td className={CELL}>
        <Link href={`/orders/${o.id}`} className={NAME}>{name}</Link>
        <span className={`block ${SOFT}`}>{o.senderPhone}</span>
      </td>
      <td className={`${CELL} w-[160px]`}>
        <Pill colour={refunded ? SOLID.grey : pill.colour}>{pill.label}</Pill>
        {pill.sub && <span className={LABEL}>{pill.sub}</span>}
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
          {!cancelled && due > 0 && (
            <ActButton kind="primary" onClick={() => openBox(o.paymentMethod === "cod" ? "COD_COLLECTED" : "PAYMENT")}>
              Record payment
            </ActButton>
          )}
          {!cancelled && refundable > 0 && (
            <ActButton onClick={() => openBox("REFUND")}>Refund</ActButton>
          )}
          <ActButton href={`/orders/${o.id}`}>Open</ActButton>
          {open && (
            <div className="mt-1 rounded-[12px] border border-[var(--l-accent)] bg-white p-2.5 w-[220px] flex flex-col gap-2">
              <select className="ipt h-[34px] text-[12.5px]" value={open} onChange={(e) => setOpen(e.target.value as Kind)}>
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                className="ipt h-[34px] text-[12.5px]"
                placeholder={`৳ ${((open === "REFUND" ? refundable : due) / 100).toFixed(2)}`}
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
              />
              <span className={SOFT}>
                {open === "REFUND"
                  ? `At most ${formatTaka(refundable)}.`
                  : `Empty means the whole ${formatTaka(due)}.`}
              </span>
              <ActButton kind="solid" colour={open === "REFUND" ? SOLID.red : SOLID.green} onClick={save} disabled={busy}>
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

/*  audit 11 Sep 2026 — this row used to be handed the matching ApiOrder out of
    the hundred-row orders page, and drew the customer, the phone and the pay
    link from it. For any attempt on an order outside that page — which is most
    of them, since a gateway attempt is often older than the last hundred
    orders — all three silently came out as "—". The row now uses only what the
    attempt itself carries, and sends whoever needs the customer to the order,
    one click away, where the phone really is.  */
function GatewayRow({ p }: { p: ApiOnlinePayment }) {
  const s = GW[p.status] ?? { label: p.status, colour: SOLID.grey };
  const stillOwing = p.order ? p.order.totalPaisa - p.order.paidPaisa > 0 : false;
  return (
    <tr className="hover:bg-[var(--s-accent)]">
      <td className={`${CELL} w-[150px]`}>
        <span className={VALUE}>{fmtStamp(p.createdAt)}</span>
        {p.settledAt && <span className={LABEL}>settled {fmtStamp(p.settledAt)}</span>}
      </td>
      <td className={`${CELL} w-[150px]`}>
        {p.order ? <Link href={`/orders/${p.order.id}`} className={NO}>{p.order.orderNo}</Link> : <span className={SOFT}>—</span>}
        {p.order && (
          <span className={LABEL}>
            {formatTaka(p.order.paidPaisa)} of {formatTaka(p.order.totalPaisa)} paid
          </span>
        )}
      </td>
      <td className={`${CELL} w-[130px]`}>
        <span className={VALUE}>{paidWith(p)}</span>
        <span className={`block ${SOFT}`}>{p.provider === "SSLCOMMERZ" ? "SSLCommerz" : p.provider}</span>
      </td>
      <td className={CELL}>
        <Pill colour={s.colour}>{s.label}</Pill>
        {p.gatewayReason && <span className="block mt-1 font-medium leading-snug" style={{ color: p.status === "FAILED" ? SOLID.red : "var(--t-accent)" }}>{p.gatewayReason}</span>}
        {stillOwing && p.status !== "SUCCESS" && <span className={LABEL}>the order is still owing</span>}
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
      <td className={`${CELL} w-[150px]`}>
        {p.order ? <ActButton href={`/orders/${p.order.id}`}>Open order</ActButton> : <span className={SOFT}>—</span>}
      </td>
    </tr>
  );
}

/* ---------- returns tab ---------- */
/*  One status per segment, because that is what `GET /returns` filters on and
    what its `counts` block counts. The old "Open" lumped draft and
    pending_approval together and then counted them out of one page.  */
type RSeg = "" | ReturnStatus;
const RSEGS: [RSeg, string][] = [
  ["", "All"],
  ["pending_approval", "Needs approval"],
  ["approved", "Approved"],
  ["completed", "Completed"],
  ["draft", "Draft"],
  ["rejected", "Rejected"],
];
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

/** what a return that has not settled yet is asking for — the same reading the
 *  API's `waitingPaisa` uses, so the row and the tile cannot disagree */
function askingPaisa(r: ApiReturn): number {
  if (r.status === "completed") return r.refundPaisa || r.storeCreditPaisa || r.compensationPaisa;
  if (r.resolution === "REPLACEMENT") return 0;
  const cap = Math.max(0, (r.order?.paidPaisa ?? 0) - (r.order?.refundPaisa ?? 0));
  if (r.resolution === "PARTIAL_COMPENSATION") return Math.min(r.compensationPaisa || 0, cap);
  if (r.resolution === "STORE_CREDIT") return r.creditAskPaisa ?? r.returnValuePaisa;
  return Math.min(r.returnValuePaisa, cap);
}

function ReturnRow({ r, me, onChanged }: { r: ApiReturn; me: ApiMe | null; onChanged: () => void }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const st = RSTATUS[r.status] ?? { label: r.status, colour: SOLID.grey };
  const money = askingPaisa(r);
  const lines = (r.lines ?? []).map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ");

  /*  audit 11 Sep 2026 #31 — approving is an OWNER/MANAGER act and never the
      requester's own. The API refuses both; this only saves the 403.  */
  const mayDecide = !me || me.role === "OWNER" || me.role === "MANAGER";
  const isRequester =
    !!me && !!r.actorName && me.name.trim().toLowerCase() === r.actorName.trim().toLowerCase();

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
    <tr className="hover:bg-[var(--s-accent)]">
      <td className={`${CELL} w-[130px]`}>
        <Said say={say} />
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
      <td className={`${CELL} w-[120px] text-right whitespace-nowrap`}>
        <span className="font-medium">{formatTaka(money)}</span>
        <span className={LABEL}>
          {r.status === "completed" ? METHOD[r.refundMethod] ?? r.refundMethod : "asking"}
          {r.refundReference ? ` · ${r.refundReference}` : ""}
        </span>
      </td>
      <td className={`${CELL} w-[150px]`}>
        <Pill colour={st.colour}>{st.label}</Pill>
        {r.approvedAt && <span className={LABEL}>{r.approvedBy ?? ""} · {fmtStamp(r.approvedAt)}</span>}
      </td>
      <td className={`${CELL} w-[186px]`}>
        <div className="flex flex-col gap-1.5">
          {r.status === "pending_approval" && (
            <>
              <ActButton kind="solid" colour={SOLID.green} disabled={busy || !mayDecide || isRequester}
                onClick={() => run(() => approveReturn(r.id), "Could not approve.")}>Approve</ActButton>
              <ActButton disabled={busy || !mayDecide} onClick={() => setWhy(why === null ? "" : null)}>Reject</ActButton>
              {isRequester && <span className={SOFT}>You raised this one — somebody else approves it.</span>}
              {!mayDecide && <span className={SOFT}>Owner or manager only.</span>}
              {/*  audit #32 — a rejection without a written reason is one
                   nobody can answer for when the customer rings.  */}
              {why !== null && (
                <div className="rounded-[12px] border border-[var(--l-accent)] bg-white p-2.5 flex flex-col gap-2">
                  <input className="ipt h-[34px] text-[12.5px]" autoFocus value={why}
                    placeholder="Why is it refused?" onChange={(e) => setWhy(e.target.value)} />
                  <ActButton kind="solid" colour={SOLID.red} disabled={busy || !why.trim()}
                    onClick={() => run(async () => { await rejectReturn(r.id, why.trim()); setWhy(null); }, "Could not reject.")}>
                    {busy ? "…" : "Reject it"}
                  </ActButton>
                </div>
              )}
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
  "Money on website orders: what each owes or paid, gateway attempts, returns and refunds.";

export default function PaymentsView() {
  const [tab, setTab] = useState<Tab>("orders");
  const [me, setMe] = useState<ApiMe | null>(null);

  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [oTotal, setOTotal] = useState(0);
  const [oPage, setOPage] = useState(1);
  const [stats, setStats] = useState<ApiOrderStats | null>(null);
  const [onlineDue, setOnlineDue] = useState<number | null>(null);

  const [gw, setGw] = useState<{ rows: ApiOnlinePayment[]; counts: Record<string, number> } | null>(null);

  const [rets, setRets] = useState<ApiReturn[]>([]);
  const [rTotal, setRTotal] = useState(0);
  const [rPage, setRPage] = useState(1);
  const [rCounts, setRCounts] = useState<ReturnCounts | null>(null);
  const [rStats, setRStats] = useState<ReturnStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [oseg, setOseg] = useState<OSeg>("");
  const [gseg, setGseg] = useState<GSeg>("ALL");
  const [rseg, setRseg] = useState<RSeg>("pending_approval");
  const [method, setMethod] = useState<"" | "online" | "cod">("");

  useEffect(() => { meCached().then(setMe).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  /*  the band is the same on every tab, so its two stats calls do not depend
      on which tab is open — only the rows below do  */
  const loadBand = useCallback(async () => {
    const [s, onlineOwing, rs] = await Promise.all([
      orderStats(),
      orderStats({ due: true, paymentMethod: "online" }),
      returnStats({ channel: "online" }),
    ]);
    setStats(s);
    setOnlineDue(onlineOwing.counts.all);
    setRStats(rs);
  }, []);

  const loadRows = useCallback(async (opts?: { page?: number }) => {
    const page = opts?.page ?? 1;
    if (tab === "orders") {
      const res = await listOrdersPage({
        search: debounced || undefined,
        paymentMethod: method || undefined,
        due: oseg === "due" || oseg === "online_due" ? true : undefined,
        ...(oseg === "online_due" ? { paymentMethod: "online" as const } : {}),
        page,
        pageSize: PAGE,
      });
      setOrders(res.rows);
      setOTotal(res.total);
      setOPage(res.page);
    } else if (tab === "gateway") {
      /*  the gateway's own search, on the server. `take` is the page; the
          endpoint has no offset, so this is a "most recent N" window and the
          search is how anything older is found — which is what the box is
          for. (See C.md "Handover": /orders/online-payments wants real paging.)  */
      const g = await listOnlinePayments({
        status: gseg === "ALL" ? undefined : gseg,
        q: debounced || undefined,
        take: 200,
      });
      setGw(g);
    } else {
      const res = await listReturns({
        channel: "online",
        search: debounced || undefined,
        status: rseg || undefined,
        page,
        pageSize: PAGE,
      });
      setRets(res.rows ?? res.items ?? []);
      setRTotal(res.total);
      setRPage(res.page);
      setRCounts(res.counts);
    }
  }, [tab, debounced, method, oseg, gseg, rseg]);

  const load = useCallback(async (opts?: { page?: number }) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadBand(), loadRows(opts)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadBand, loadRows]);

  useEffect(() => { load({ page: 1 }); /* eslint-disable-next-line */ }, [tab, debounced, method, oseg, gseg, rseg]);

  const ocounts = useMemo<Partial<Record<OSeg, number>>>(
    () => (stats ? { "": stats.counts.all, due: stats.counts.due, online_due: onlineDue ?? undefined } : {}),
    [stats, onlineDue],
  );
  const rcounts = useMemo<Partial<Record<RSeg, number>>>(() => {
    if (!rCounts) return {};
    return {
      "": rCounts.all,
      pending_approval: rCounts.pending_approval,
      approved: rCounts.approved,
      completed: rCounts.completed,
      draft: rCounts.draft,
      rejected: rCounts.rejected,
    };
  }, [rCounts]);

  const v = (s: string) => (loading ? "…" : s);
  const tiles: Tile[] = [
    {
      key: "collected",
      label: "Collected",
      value: v(formatTaka(stats?.collectedPaisa ?? 0)),
      /*  `GET /orders/stats` counts this on DELIVERED orders (DEC-FIN-002),
          which is not the same thing as every payment ever recorded. The tile
          says which it is rather than pretending. See C.md "Handover".  */
      sub: loading ? undefined : "on delivered orders",
    },
    {
      key: "due",
      label: "To collect",
      value: v(formatTaka(stats?.duePaisa ?? 0)),
      hot: (stats?.duePaisa ?? 0) > 0,
      sub: loading ? undefined : `${stats?.dueOrders ?? 0} order${stats?.dueOrders === 1 ? "" : "s"} still owing`,
    },
    {
      key: "online_due",
      label: "Online, still owing",
      value: v(String(onlineDue ?? 0)),
      sub: loading ? undefined : "orders waiting on a payment",
    },
    {
      key: "failed",
      label: "Gateway failed",
      value: v(String((gw?.counts.FAILED ?? 0) + (gw?.counts.CANCELLED ?? 0))),
      sub: loading ? undefined : `of ${gw?.counts.ALL ?? 0} recent attempts`,
    },
    {
      key: "refunds",
      label: "Refunds pending",
      value: v(String(rStats?.waiting ?? 0)),
      /*  audit 11 Sep 2026 — this read ৳0 for almost the whole queue, because
          it summed `refundPaisa`, which is written AT completion: every return
          still waiting is zero by definition. It now sums what each waiting
          return is ASKING for, capped at what is still in hand on its order.  */
      sub: loading ? undefined : `${formatTaka(rStats?.waitingPaisa ?? 0)} to settle`,
    },
  ];
  const active =
    tab === "orders"
      ? oseg === "due" ? "due" : oseg === "online_due" ? "online_due" : "collected"
      : tab === "gateway" ? "failed" : "refunds";
  function onTile(k: string) {
    if (k === "collected") { setTab("orders"); setOseg(""); }
    if (k === "due") { setTab("orders"); setOseg("due"); }
    if (k === "online_due") { setTab("orders"); setOseg("online_due"); }
    if (k === "failed") { setTab("gateway"); setGseg("FAILED"); }
    if (k === "refunds") { setTab("returns"); setRseg("pending_approval"); }
  }

  const grows = gw?.rows ?? [];
  const shown = tab === "orders" ? orders.length : tab === "gateway" ? grows.length : rets.length;
  const total = tab === "orders" ? oTotal : tab === "gateway" ? grows.length : rTotal;
  const page = tab === "orders" ? oPage : tab === "returns" ? rPage : 1;
  const paged = tab !== "gateway" && total > PAGE;
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(total, page * PAGE);

  return (
    <div className={WRAP}>
      <Band title="Payments" help={HELP} tiles={tiles} active={active} onTile={onTile} right={<BandButton href="/returns/new" icon="plus">New return</BandButton>} />

      <div className="flex gap-0.5 border-b-[1.5px] border-[var(--l-accent)] mb-3">
        {TABS.map(([k, label]) => {
          const on = tab === k;
          const n = k === "orders" ? stats?.counts.all : k === "gateway" ? gw?.counts.ALL : rCounts?.all ?? rStats?.counts.all;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3.5 py-2.5 text-[13px] font-medium -mb-[1.5px] border-b-2 inline-flex items-center gap-1.5 ${on ? "text-purple border-purple" : "text-body-soft border-transparent hover:text-purple"}`}
            >
              {label}
              {n !== undefined && <span className="text-[11px] px-1.5 rounded-full bg-lavender-deep text-purple">{n}</span>}
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
          placeholder={tab === "orders" ? "Order no, name, phone, recipient, address" : tab === "gateway" ? "Order no, transaction id, bank reference" : "Return no, order no, name, phone"}
        />
        {tab === "orders" && (
          <select className="ipt max-w-[170px] h-[40px] font-medium" value={method} onChange={(e) => setMethod(e.target.value as "" | "online" | "cod")}>
            <option value="">All methods</option>
            <option value="online">Online</option>
            <option value="cod">Cash on delivery</option>
          </select>
        )}
        <Count n={total} noun={tab === "orders" ? "order" : tab === "gateway" ? "attempt" : "return"} loading={loading} />
      </div>

      {error && <ErrorBox error={error} onRetry={() => load({ page })} />}

      <div className={TABLE_WRAP}>
        {tab === "orders" && (
          <table className={TABLE}>
            <Head heads={["Order No", "Customer", "Method", "Payment", "Total", "Paid", "Due", "Last movement", "Action"]} />
            <tbody>
              {orders.map((o) => (
                <OrderRow key={o.id} o={o} onChanged={() => load({ page: oPage })} />
              ))}
            </tbody>
          </table>
        )}
        {tab === "gateway" && (
          <table className={TABLE}>
            <Head heads={["When", "Order", "Paid with", "Result", "Amount", "Gateway reference", "Action"]} />
            <tbody>
              {grows.map((p) => (
                <GatewayRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        )}
        {tab === "returns" && (
          <table className={TABLE}>
            <Head heads={["Return No", "Order No", "Customer", "Reason", "Resolution", "Amount", "Status", "Action"]} />
            <tbody>
              {rets.map((r) => (
                <ReturnRow key={r.id} r={r} me={me} onChanged={() => load({ page: rPage })} />
              ))}
            </tbody>
          </table>
        )}
        {!loading && shown === 0 && <Empty text="Nothing here." />}
      </div>

      {paged && (
        <div className="flex items-center gap-2 mt-3">
          <button className="text-[12.5px] px-3 py-2 rounded-[9px] border border-[var(--l-accent)] disabled:opacity-40"
            disabled={loading || page <= 1} onClick={() => load({ page: page - 1 })}>← Prev</button>
          <span className="text-[12.5px] text-body-soft">{from}–{to} of {total}</span>
          <button className="text-[12.5px] px-3 py-2 rounded-[9px] border border-[var(--l-accent)] disabled:opacity-40"
            disabled={loading || to >= total} onClick={() => load({ page: page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
}

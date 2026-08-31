"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getOrder,
  getOrderTimeline,
  getCustomer,
  adaptOrder,
  adaptTimeline,
  orderAction,
  cancelOrder,
  addOrderPayment,
  createAssignment,
  orderAssignments,
  listRiders,
  listCourierServices,
  type ApiCustomer,
  type ApiRider,
  type ApiCourierService,
  type ApiAssignment,
} from "../_data/api";
import {
  SALES_STATUS_META,
  DELIVERY_STATUS_META,
  PAYMENT_STATUS_META,
  paymentLabel,
  formatTaka,
  shortDate,
  clockTime,
  hasCrafted,
  type Order,
  type TimelineKind,
} from "../_data/orders";
import { TONE, Panel, type Tone } from "./OrderViews";
import Icon from "./Icon";

/*
  Order detail — tab-by-tab, READ-ONLY. All editing lives on /orders/[id]/edit.

  DESIGN RULE: colourful, decision-first. The journey stepper is the hero — a
  done step carries a tick, the live step carries a ring and a NOW pill, and a
  future step is just a number. You should never have to guess where an order is.

  Business rules shown: two owned tracks (Sales + Delivery), stock −1 at
  Preparing (DEC-MOD-003), materials read from Product, per-line refund.
*/

const SECTIONS = [
  ["summary", "Summary", "layers"],
  ["customer", "Customer & recipient", "user"],
  ["items", "Items", "bag"],
  ["delivery", "Delivery", "truck"],
  ["photos", "Photos & proof", "photo"],
  ["payment", "Payment", "cash"],
  ["activity", "Activity log", "clock"],
] as const;
type SecId = (typeof SECTIONS)[number][0];

const KIND_TONE: Record<TimelineKind, Tone> = { sales: "purple", delivery: "blue", payment: "green", system: "gold" };

/* status → tone, so colour always carries the same meaning */
function salesTone(s: Order["salesStatus"]): Tone {
  return s === "placed" ? "amber" : s === "confirmed" ? "blue" : s === "completed" ? "green" : "rose";
}
function deliveryTone(d: Order["deliveryStatus"]): Tone {
  return d === "preparing" ? "amber" : d === "out_for_delivery" ? "blue" : d === "delivered" ? "green" : d === "failed" ? "rose" : "purple";
}
function paymentTone(p: Order["payment"]["status"]): Tone {
  return p === "paid" || p === "cod_collected" ? "green" : p === "unpaid" ? "gold" : p === "refunded" ? "rose" : p === "advance_paid" ? "blue" : "purple";
}

/* ---------------- the stepper ---------------- */
function Stepper({
  steps,
  current,
  tone = "purple",
  dead,
  deadLabel,
}: {
  steps: string[];
  current: number;
  tone?: Tone;
  dead?: boolean;
  deadLabel?: string;
}) {
  if (dead) {
    const r = TONE.rose;
    return (
      <div className="rounded-[12px] px-4 py-3 text-[13px] font-medium border inline-flex items-center gap-2" style={{ background: r.bg, borderColor: r.border, color: r.text }}>
        <Icon name="shield" size={16} /> {deadLabel}
      </div>
    );
  }
  const t = TONE[tone];
  return (
    <div className="flex items-start pt-1">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <div key={s} className="flex-1 flex flex-col items-center relative min-w-0">
            {i > 0 && (
              <span className="absolute top-[15px] right-1/2 w-full h-[3px] rounded-full" style={{ background: done || now ? t.solid : "#e9dcf5" }} />
            )}
            <span
              className="relative z-10 w-[30px] h-[30px] rounded-full grid place-items-center text-[12px] font-medium"
              style={
                done
                  ? { background: TONE.green.solid, color: "#fff" }
                  : now
                    ? { background: t.solid, color: "#fff", boxShadow: `0 0 0 5px ${t.soft}` }
                    : { background: "#fff", color: "#a892bb", border: "2px solid #e9dcf5" }
              }
            >
              {done ? <Icon name="check" size={15} /> : i + 1}
            </span>
            <span
              className={"mt-2 text-[11.5px] text-center leading-tight px-1 " + (now ? "font-medium" : "")}
              style={{ color: now ? t.text : done ? "#3a2547" : "#a892bb" }}
            >
              {s}
            </span>
            {now && (
              <span className="mt-1 text-[9.5px] px-2 py-0.5 rounded-full text-white uppercase tracking-[0.06em]" style={{ background: t.solid }}>
                Now
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusCard({ label, value, tone, sub, icon }: { label: string; value: string; tone: Tone; sub?: string; icon: string }) {
  const t = TONE[tone];
  return (
    <div className="rounded-[14px] px-4 py-3 border" style={{ background: t.bg, borderColor: t.border }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-7 h-7 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}>
          <Icon name={icon} size={14} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.06em] font-medium" style={{ color: t.text }}>{label}</span>
      </div>
      <div className="font-display text-[19px] leading-tight" style={{ color: t.text }}>{value}</div>
      {sub && <div className="text-[11.5px] mt-0.5 opacity-80" style={{ color: t.text }}>{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-lavender-deep last:border-0 text-[13.5px]">
      <span className="text-body-soft">{k}</span>
      <span className="text-body text-right">{v}</span>
    </div>
  );
}

function Chip({ meta }: { meta: { label: string; chip: string; dot: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] px-2 py-0.5 rounded-full border font-medium ${meta.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

const SALES_STEPS = ["Placed", "Confirmed", "In fulfilment", "Completed"];
const DELIV_STEPS = ["Not started", "Preparing", "Out for delivery", "Delivered"];
const JOURNEY = ["Placed", "Confirmed", "Preparing", "Out for delivery", "Delivered"];

function salesStepIndex(o: Order): number {
  if (o.salesStatus === "placed") return 0;
  if (o.salesStatus === "completed") return 3;
  if (o.salesStatus === "confirmed" && (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery")) return 2;
  return 1;
}
function delivStepIndex(o: Order): number {
  switch (o.deliveryStatus) {
    case "preparing": return 1;
    case "out_for_delivery": return 2;
    case "delivered": return 3;
    default: return 0;
  }
}
function journeyIndex(o: Order): number {
  switch (o.deliveryStatus) {
    case "delivered": return 4;
    case "out_for_delivery": return 3;
    case "preparing": return 2;
    default: return o.salesStatus === "placed" ? 0 : 1;
  }
}

export default function OrderEditor({ id }: { id: string }) {
  const [o, setO] = useState<Order | null>(null);
  const [cust, setCust] = useState<ApiCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** why the last action was refused — shown on the page, never in an alert */
  const [actErr, setActErr] = useState("");
  const [sec, setSec] = useState<SecId>("summary");
  const [openMaterials, setOpenMaterials] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEntry, setCopiedEntry] = useState(false);
  /*  carrier hand-off — Phase 6: the ONE path is a DeliveryAssignment
      (POST /delivery/assignments), so the parcel reaches the board, analytics,
      cost posting and COD reconciliation. The old /orders/:id/courier wrote
      onto the Order and told Delivery nothing. */
  const [carrierKind, setCarrierKind] = useState<"RIDER" | "COURIER">("COURIER");
  const [carrierId, setCarrierId] = useState("");
  const [consignment, setConsignment] = useState("");
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [assignment, setAssignment] = useState<ApiAssignment | null>(null);
  /* record a payment */
  const [payAmt, setPayAmt] = useState(0);
  const [payKind, setPayKind] = useState<"COD_COLLECTED" | "ADVANCE" | "PAYMENT" | "REFUND">("COD_COLLECTED");

  async function reload() {
    const adapted = adaptOrder(await getOrder(id)) as unknown as Order;
    const tl = await getOrderTimeline(id).catch(() => []);
    (adapted as unknown as { timeline: unknown[] }).timeline = adaptTimeline(tl);
    setO(adapted);
    getCustomer(adapted.customerId).then(setCust).catch(() => setCust(null));
    orderAssignments(id).then((rows) => setAssignment(rows.find((a) => a.isActive) ?? null)).catch(() => setAssignment(null));
  }
  useEffect(() => {
    listRiders().then((r) => setRiders(r.filter((x) => x.isActive))).catch(() => setRiders([]));
    listCourierServices().then((c) => setCouriers(c.filter((x) => x.isActive))).catch(() => setCouriers([]));
  }, []);
  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /*
    ⚠️ NO `alert()` HERE ANY MORE — 29 Aug 2026, found walking the fulfilment
    circle.

    Pressing "Mark delivered" on an order whose online payment had not arrived
    threw the right refusal from the API — *"cannot mark delivered — 503928
    paisa is still unpaid. Record the payment first."* — and this caught it and
    put it in a browser `alert()`. A native alert BLOCKS the page: everything
    stops until somebody presses OK, and until then the screen is frozen with
    no visible reason. It cost most of an afternoon to find, because the symptom
    (a dead admin page) looks nothing like the cause (a correct business rule
    doing its job).

    The refusal now lands in a line on the page, in the shop's own colours,
    beside the button that caused it — the same principle as
    prisma-exception-filter (owner, 20 Aug): a rule saying no must read as a
    rule saying no, not as something broken.
  */
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActErr("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="px-8 pt-10"><p className="text-body-soft">Loading order…</p></div>;
  if (!o) return <div className="px-8 pt-10"><p className="text-body-soft">Order not found. <Link href="/orders" className="text-purple underline">Back to orders</Link></p></div>;

  const sm = SALES_STATUS_META[o.salesStatus];
  const dm = DELIVERY_STATUS_META[o.deliveryStatus];
  /*  The method decides the wording when nothing has been paid: cash owed at
      the door reads differently from an online payment that never arrived
      (29 Aug 2026 — see the note in api.ts).  */
  const pm = {
    ...PAYMENT_STATUS_META[o.payment.status],
    label: paymentLabel(o.payment.status, o.payment.method),
  };
  const cancelled = o.salesStatus === "cancelled";
  const terminal = cancelled || o.salesStatus === "completed";
  const failed = o.deliveryStatus === "failed" || o.deliveryStatus === "stock_reverted";
  const crafted = hasCrafted(o);
  const due = Math.max(0, o.payment.duePaisa);
  const paidNet = o.payment.paidPaisa - o.payment.refundPaisa;
  const custName = cust?.name ?? o.sender.name;
  const orderNo = (o as { orderNo?: string }).orderNo ?? o.id;

  /* the form shows until the parcel is out — re-assigning supersedes (DLV-R01) */
  const canAssign = !terminal && (!assignment || assignment.status === "ASSIGNED");
  /* channel slug → readable name; falls back to the slug so nothing renders blank */
  const rawChannel = (o as unknown as { channel?: string }).channel ?? "";
  const channelName = rawChannel ? rawChannel.charAt(0).toUpperCase() + rawChannel.slice(1) : "Web";

  /* one plain-text summary, reused by copy / WhatsApp / email */
  const shareText = [
    `Radian order ${orderNo}`,
    `${custName} · ${o.sender.phone}`,
    o.isGift && o.recipient ? `For: ${o.recipient.name} · ${o.recipient.phone}` : "",
    ...o.lines.map((l) => `• ${l.name} × ${l.qty} — ${formatTaka(l.linePaisa)}`),
    `Delivery: ${o.methodLabel}${o.slotLabel ? ` · ${o.slotLabel}` : ""}${o.date ? ` · ${o.date}` : ""}`,
    `Address: ${o.address}`,
    `Total: ${formatTaka(o.totalPaisa)}${due > 0 ? ` · Due ${formatTaka(due)}` : " · paid"}`,
    `Status: ${sm.label} / ${dm.label}`,
  ].filter(Boolean).join("\n");

  const shareCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("Could not copy — select the text manually.");
    }
  };
  const waPhone = (o.isGift ? o.recipient?.phone : o.sender.phone) ?? o.sender.phone;
  const waHref = `https://wa.me/${waPhone.replace(/\D/g, "")}?text=${encodeURIComponent(shareText)}`;
  const mailHref = `mailto:${o.sender.email ?? ""}?subject=${encodeURIComponent(`Radian order ${orderNo}`)}&body=${encodeURIComponent(shareText)}`;

  const badge = (sid: SecId): string | null => {
    if (sid === "items") return String(o.lines.length);
    if (sid === "payment") return due > 0 ? formatTaka(due) : null;
    if (sid === "photos") return o.prepPhoto && o.deliveryPhoto ? "✓" : null;
    return null;
  };

  /* the single next step, coloured by what it is */
  const nextStep: { label: string; tone: Tone; run: () => Promise<unknown> } | null =
    o.salesStatus === "placed"
      ? { label: "Confirm order", tone: "green", run: () => orderAction(id, "confirm") }
      : o.salesStatus === "confirmed" && o.deliveryStatus === "unassigned"
        ? { label: "Start preparing (stock −1)", tone: "amber", run: () => orderAction(id, "prepare") }
        : o.deliveryStatus === "preparing"
          ? { label: "Out for delivery", tone: "blue", run: () => orderAction(id, "out-for-delivery") }
          : o.deliveryStatus === "out_for_delivery"
            ? { label: "Mark delivered", tone: "green", run: () => orderAction(id, "delivered") }
            : null;

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1650px]">
      {/* header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Link href="/orders" className="border border-lavender-deep bg-white text-body-soft hover:text-purple w-[40px] h-[40px] rounded-[12px] grid place-items-center shrink-0" title="Back"><Icon name="chevronLeft" size={20} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display text-[26px] text-purple m-0 leading-none">Order {orderNo}</h1>
            <span className="text-[12px] px-2.5 py-1 rounded-full border font-medium" style={o.isGift ? { background: TONE.gold.bg, color: TONE.gold.text, borderColor: TONE.gold.border } : { background: TONE.purple.bg, color: TONE.purple.text, borderColor: TONE.purple.border }}>
              {o.isGift ? "🎁 Gift" : "Self"}
            </span>
          </div>
          {/* REV-M6: the channel name comes from the API, so a new/admin-created
              channel (Shop, TikTok…) shows properly instead of blank */}
          <p className="text-body-soft text-[13px] m-0 mt-1">Placed {shortDate(o.placedAt)}, {clockTime(o.placedAt)} · {channelName} · {o.methodLabel}</p>
        </div>
        {/* one-click share — same summary everywhere */}
        <div className="flex items-center gap-1.5 rounded-[12px] border p-1" style={{ borderColor: TONE.purple.border, background: TONE.purple.bg }}>
          <button type="button" onClick={shareCopy} title="Copy order details" className="text-[12.5px] px-2.5 py-1.5 rounded-[9px] font-medium bg-white inline-flex items-center gap-1.5" style={{ color: copied ? TONE.green.text : TONE.purple.text }}>
            <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => window.print()} title="Print" className="text-[12.5px] px-2.5 py-1.5 rounded-[9px] font-medium bg-white inline-flex items-center gap-1.5" style={{ color: TONE.purple.text }}>
            <Icon name="book" size={14} /> Print
          </button>
          <a href={waHref} target="_blank" rel="noreferrer" title="Send on WhatsApp" className="text-[12.5px] px-2.5 py-1.5 rounded-[9px] font-medium bg-white inline-flex items-center gap-1.5" style={{ color: TONE.green.text }}>
            <Icon name="phone" size={14} /> WhatsApp
          </a>
          <a href={mailHref} title="Send by email" className="text-[12.5px] px-2.5 py-1.5 rounded-[9px] font-medium bg-white inline-flex items-center gap-1.5" style={{ color: TONE.blue.text }}>
            <Icon name="mail" size={14} /> Email
          </a>
        </div>
        {!terminal && <Link href={`/orders/${o.id}/edit`} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] px-5 py-2.5 rounded-[12px] font-medium inline-flex items-center gap-2 shadow-soft"><Icon name="edit" size={16} /> Edit order</Link>}
      </div>

      {/* JOURNEY — compact: stepper left, next action right */}
      <div className="bg-white rounded-[14px] border shadow-soft px-4 py-3 mb-4 flex items-center gap-5 flex-wrap" style={{ borderColor: TONE.purple.border }}>
        <div className="flex-1 min-w-[320px]">
          <Stepper steps={JOURNEY} current={journeyIndex(o)} tone={cancelled ? "rose" : deliveryTone(o.deliveryStatus)} dead={cancelled} deadLabel="Order cancelled — per-line refund applied" />
        </div>
        {nextStep && !terminal && (
          <button type="button" disabled={busy} onClick={() => act(nextStep.run)} className="text-white text-[13px] px-4 py-2.5 rounded-[11px] font-bold disabled:opacity-50 inline-flex items-center gap-2 shrink-0" style={{ background: TONE[nextStep.tone].solid }}>
            <Icon name="check" size={15} /> {busy ? "Working…" : nextStep.label}
          </button>
        )}
        {terminal && (
          <span className="text-[12.5px] px-3 py-1.5 rounded-full font-medium border shrink-0" style={{ background: cancelled ? TONE.rose.bg : TONE.green.bg, color: cancelled ? TONE.rose.text : TONE.green.text, borderColor: cancelled ? TONE.rose.border : TONE.green.border }}>
            {cancelled ? "Cancelled — read-only" : "Completed — read-only"}
          </span>
        )}
      </div>

      {/*  Why the last step was refused — on the page, beside the button that
           was pressed. This is usually a RULE, not a fault: "record the payment
           first", "items are locked once preparing starts". It reads as one.  */}
      {actErr && (
        <div
          className="flex items-start gap-2.5 rounded-[12px] border px-4 py-3 mb-5 text-[13px]"
          style={{ background: TONE.gold.bg, borderColor: TONE.gold.border, color: TONE.gold.text }}
        >
          <Icon name="alert" size={16} />
          <span className="flex-1 min-w-0">{actErr}</span>
          <button type="button" onClick={() => setActErr("")} className="font-bold shrink-0 opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* status band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatusCard label="Order status" value={sm.label} tone={salesTone(o.salesStatus)} icon="layers" sub="owned by Sales" />
        <StatusCard label="Payment" value={pm.label} tone={paymentTone(o.payment.status)} icon="cash" sub={due > 0 ? `Due ${formatTaka(due)}` : "nothing to collect"} />
        <StatusCard label="Fulfilment" value={dm.label} tone={deliveryTone(o.deliveryStatus)} icon="truck" sub="owned by Delivery" />
        <StatusCard label="Total" value={formatTaka(o.totalPaisa)} tone={due > 0 ? "gold" : "green"} icon="tag" sub={due > 0 ? `Paid ${formatTaka(paidNet)}` : "fully paid"} />
      </div>

      {!terminal && (
        <div className="flex gap-2 flex-wrap mb-5">
          <button type="button" disabled={busy} onClick={() => { if (confirm("Cancel this order? Per-line refund (readymade full, crafted advance forfeit) will be applied.")) act(() => cancelOrder(id, "staff cancelled")); }} className="border bg-white text-[13px] px-4 py-2 rounded-[10px] font-medium disabled:opacity-50" style={{ borderColor: TONE.rose.border, color: TONE.rose.text }}>
            Cancel order
          </button>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* section nav */}
        <nav className="w-[212px] shrink-0 sticky top-4 hidden md:block">
          {SECTIONS.map(([sid, label, icon]) => {
            const b = badge(sid);
            const on = sec === sid;
            return (
              <button key={sid} type="button" onClick={() => setSec(sid)}
                className={"w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] text-[13.5px] mb-1 text-left transition-colors " + (on ? "font-medium shadow-soft" : "text-body-soft hover:bg-white/70")}
                style={on ? { background: TONE.purple.solid, color: "#fff" } : undefined}>
                <span className="w-7 h-7 rounded-[9px] grid place-items-center shrink-0" style={on ? { background: "rgba(255,255,255,.2)", color: "#fff" } : { background: TONE.purple.bg, color: TONE.purple.text }}>
                  <Icon name={icon} size={15} />
                </span>
                <span className="flex-1">{label}</span>
                {b && <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={on ? { background: "rgba(255,255,255,.25)", color: "#fff" } : { background: TONE.purple.soft, color: TONE.purple.text }}>{b}</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">
          <div className="md:hidden mb-4">
            <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
              {SECTIONS.map(([sid, label]) => (<option key={sid} value={sid}>{label}</option>))}
            </select>
          </div>

          {/* SUMMARY */}
          {sec === "summary" && (
            <>
              <Panel title="Sales status" icon="layers" tone={salesTone(o.salesStatus)} hint="owned by Sales — Placed → Confirmed → Completed">
                <div className="p-5">
                  <Stepper steps={SALES_STEPS} current={salesStepIndex(o)} tone={salesTone(o.salesStatus)} dead={cancelled} deadLabel="Cancelled — per-line refund issued" />
                </div>
              </Panel>

              <Panel title="Delivery status" icon="truck" tone={deliveryTone(o.deliveryStatus)} hint="Stock drops at Preparing.">
                <div className="p-5">
                  <Stepper steps={DELIV_STEPS} current={delivStepIndex(o)} tone={deliveryTone(o.deliveryStatus)} dead={failed} deadLabel={dm.label} />
                </div>
              </Panel>

              <Panel title="Money" icon="cash" tone={due > 0 ? "gold" : "green"} hint="stored in paisa · frozen at the price the customer paid">
                <div className="p-5">
                  <Row k="Subtotal" v={formatTaka(o.subtotalPaisa)} />
                  {o.couponCode && <Row k={`Coupon (${o.couponCode})`} v={`− ${formatTaka(o.discountPaisa)}`} />}
                  <Row k="Delivery" v={o.deliveryWaivedPaisa > 0 ? `${formatTaka(o.deliveryPaisa)} (waived ${formatTaka(o.deliveryWaivedPaisa)})` : formatTaka(o.deliveryPaisa)} />
                  <Row k={<span className="text-purple font-medium">Total</span>} v={<span className="text-purple font-medium text-[15px]">{formatTaka(o.totalPaisa)}</span>} />
                  <Row k="Paid" v={formatTaka(paidNet)} />
                  {due > 0 && <Row k="Due" v={<span className="font-medium" style={{ color: TONE.gold.text }}>{formatTaka(due)}</span>} />}
                </div>
              </Panel>

              <Panel title="Internal note" icon="book" tone="purple" hint="private staff note — edit it on the Edit order page">
                <div className="p-5 text-[13.5px] text-body">{o.internalNote || <span className="text-body-soft">No note.</span>}</div>
              </Panel>
            </>
          )}

          {/* CUSTOMER */}
          {sec === "customer" && (
            <>
              <Panel title="Customer" icon="user" tone="purple" hint="the account that placed the order — profile lives in Customer Management">
                <div className="p-5">
                  <Row k="Name" v={<Link href={`/customers/${o.customerId}`} className="text-purple font-medium underline">{custName}</Link>} />
                  <Row k="Phone / WhatsApp" v={<span className="inline-flex items-center gap-2.5">{o.sender.phone}<a href={`tel:${o.sender.phone}`} className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-[8px] border bg-white" style={{ color: TONE.green.text, borderColor: TONE.green.border }}><Icon name="phone" size={12} /> Call</a></span>} />
                  <Row k="Email" v={o.sender.email ?? "—"} />
                  <Row k="Country" v={cust?.country ?? "—"} />
                  <Row k="Orders" v={String(cust?.ordersCount ?? 0)} />
                  <Row k="Lifetime value" v={<span style={{ color: TONE.gold.text }} className="font-medium">{formatTaka(cust?.ltvPaisa ?? 0)}</span>} />
                  <p className="text-[13px] text-body-soft mt-3 mb-0">Lifetime value and order count are owned by Sales and update when the order is delivered — Customer Management only reads them.</p>
                </div>
              </Panel>

              {o.isGift ? (
                <Panel title="Recipient & gift" icon="pin" tone="gold" hint="the rider calls this number on arrival">
                  <div className="p-5">
                    <Row k="Recipient" v={o.recipient?.customerId ? <Link href={`/customers/${o.recipient.customerId}`} className="text-purple font-medium underline">{o.recipient?.name}</Link> : o.recipient?.name} />
                    <Row k="Recipient phone" v={o.recipient?.phone ? <span className="inline-flex items-center gap-2.5">{o.recipient.phone}<a href={`tel:${o.recipient.phone}`} className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-[8px] border bg-white" style={{ color: TONE.green.text, borderColor: TONE.green.border }}><Icon name="phone" size={12} /> Call</a></span> : "—"} />
                    <Row k="Gift message" v={o.giftMessage || "—"} />
                    <Row k="Anonymous gift" v={o.anonymousGift ? "Yes — hide sender" : "No"} />
                    <Row k="Photo updates" v={o.photoUpdates ? "On" : "Off"} />
                  </div>
                </Panel>
              ) : (
                <Panel title="Recipient" icon="pin" tone="purple" hint="self order">
                  <div className="p-5 text-[13.5px] text-body-soft">Delivered to the customer directly.</div>
                </Panel>
              )}
            </>
          )}

          {/* ITEMS */}
          {sec === "items" && (
            <Panel title="Items" icon="bag" tone="purple" count={o.lines.length} hint="frozen at the ordered price — change them on the Edit order page">
              <div className="p-5 flex flex-col gap-3">
                {o.lines.map((l) => {
                  const craftedLine = l.productType === "crafted";
                  const ct = craftedLine ? TONE.amber : TONE.purple;
                  return (
                    <div key={l.id} className="border rounded-[14px] p-4 flex gap-3.5" style={{ borderColor: ct.border, background: ct.bg }}>
                      <div className="w-[52px] h-[52px] rounded-[12px] shrink-0" style={{ background: l.bg }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/products/${l.productId}`} className="font-medium text-purple hover:underline">{l.name}</Link>
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: ct.soft, color: ct.text }}>{craftedLine ? "Crafted · advance" : "Readymade"}</span>
                          <button type="button" onClick={() => setOpenMaterials((c) => (c === l.id ? null : l.id))} className="text-[11px] text-purple inline-flex items-center gap-1 hover:underline"><Icon name="box" size={13} /> {openMaterials === l.id ? "Hide details" : "Item details"}</button>
                        </div>
                        {/*  DEC-PRD-014 — the variant leads, because it is what
                            has to be MADE. Everything else on this line
                            describes the same product; this is the only part
                            that says which one came off the shelf.  */}
                        <div className="text-[13px] text-body-soft mt-0.5">
                          {l.variantLabel && (
                            <span className="inline-block text-[12px] font-bold px-2 py-0.5 rounded-full mr-1.5 align-middle" style={{ background: TONE.purple.soft, color: TONE.purple.text }}>
                              {l.variantLabel}
                            </span>
                          )}
                          {l.sizeLabel}{l.bundleLabel ? ` · ${l.bundleLabel}` : ""}{l.addonLabels.length ? ` · + ${l.addonLabels.join(", ")}` : ""}{l.persoText ? ` · “${l.persoText}”` : ""}
                        </div>
                        <div className="text-[13px] text-body mt-1">{l.qty} × {formatTaka(l.unitPaisa)} = <b className="font-medium text-purple">{formatTaka(l.linePaisa)}</b></div>
                        {/*  DEC-PRD-061 — the customer's own photograph, and on
                            these products it is PRINTED ON THE GOODS (owner,
                            30 Aug). So it is shown at a size somebody can
                            actually judge and offered for download at the size
                            it arrived, not squeezed into a 40px square.  */}
                        {l.persoImageUrl && (
                          <div className="mt-2.5 inline-flex items-center gap-3 border rounded-[12px] p-2.5" style={{ borderColor: TONE.purple.border, background: TONE.purple.bg }}>
                            <a href={l.persoImageUrl} target="_blank" rel="noreferrer" className="block w-[72px] h-[72px] rounded-[9px] border shrink-0" style={{ borderColor: TONE.purple.border, background: `url(${l.persoImageUrl}) center/cover` }} />
                            <div>
                              <div className="text-[12px] font-medium uppercase tracking-[0.04em]" style={{ color: TONE.purple.text }}>Customer&apos;s photo</div>
                              <a href={l.persoImageUrl} download target="_blank" rel="noreferrer" className="text-[13px] font-bold text-purple inline-flex items-center gap-1.5 mt-1 hover:underline">
                                <Icon name="download" size={14} /> Download full size
                              </a>
                            </div>
                          </div>
                        )}
                        {l.refundNote && <div className="text-[12px] mt-1.5" style={{ color: TONE.rose.text }}>Refund: {formatTaka(l.refundPaisa ?? 0)} — {l.refundNote}</div>}
                        {openMaterials === l.id && (
                          <div className="mt-2.5 border rounded-[10px] bg-white p-3" style={{ borderColor: TONE.purple.border }}>
                            <div className="text-[11px] font-medium uppercase tracking-[0.04em] mb-1.5" style={{ color: TONE.purple.text }}>What was ordered</div>
                            <table className="w-full text-[12.5px]">
                              <tbody>
                                {[
                                  ["Variant", l.variantLabel || "—"], // DEC-PRD-014
                                  ["Size", l.sizeLabel || "Standard"],
                                  ["Bundle", l.bundleLabel || "—"],
                                  ["Add-ons", l.addonLabels.length ? l.addonLabels.join(", ") : "—"],
                                  ["Personalisation", l.persoText || "—"],
                                  ["Type", craftedLine ? "Crafted — made to order" : "Readymade"],
                                  ["Unit price (frozen)", formatTaka(l.unitPaisa)],
                                ].map(([k, v]) => (
                                  <tr key={k} className="border-b border-lavender-deep last:border-0">
                                    <td className="py-1.5 text-body-soft">{k}</td>
                                    <td className="py-1.5 text-right text-body">{v}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {/* REV-M5: materials live on the Product (its owner) — this page links
                                there instead of guessing from a stale local list */}
                            <Link href={`/products/${l.productId}`} className="text-[12px] text-purple font-medium mt-2 inline-block hover:underline">Open product for materials &amp; stock →</Link>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!terminal && <Link href={`/orders/${o.id}/edit`} className="inline-flex items-center gap-1.5 text-[13px] text-purple font-medium hover:underline"><Icon name="edit" size={15} /> Edit items, quantity &amp; discounts</Link>}
              </div>
            </Panel>
          )}

          {/* DELIVERY */}
          {sec === "delivery" && (
            <Panel title="Delivery" icon="truck" tone={deliveryTone(o.deliveryStatus)} hint="executed by Delivery — Sales only references the promise">
              <div className="p-5">
                <Row k="Method" v={o.methodLabel} />
                <Row k="Zone" v={o.zone === "dhaka" ? "Inside Dhaka" : "Nationwide"} />
                <Row k="Date" v={o.date ?? "As soon as possible"} />
                <Row k="Time slot" v={o.slotLabel ?? "—"} />
                <Row k="Address" v={o.address} />
                <Row k="Rider contact" v={o.isGift ? o.recipient?.phone ?? o.sender.phone : o.sender.phone} />
                <Row k="ETA" v={o.etaLabel} />
                <Row k="Delivery note" v={o.deliveryNotes || "—"} />
                {!terminal && <Link href={`/orders/${o.id}/edit`} className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-purple font-medium hover:underline"><Icon name="edit" size={15} /> Edit address, slot &amp; note</Link>}
              </div>
            </Panel>
          )}

          {/* CARRIER — one click hands the parcel to Delivery without leaving the
              order. Phase 6: this creates a real DeliveryAssignment, so the
              parcel reaches the board, analytics, cost and COD settlement. */}
          {sec === "delivery" && (
            <Panel title="Carrier hand-off" icon="truck" tone={assignment ? "green" : "blue"} hint="assigns through Delivery — the parcel lands on the delivery board and in its accounts; re-assigning replaces the previous assignment">
              <div className="p-5">
                {assignment ? (
                  <>
                    <Row k="Carrier" v={<span className="font-medium text-purple">{assignment.kind === "RIDER" ? `Rider — ${assignment.rider?.name ?? "?"}` : `Courier — ${assignment.courier?.name ?? "?"}`}</span>} />
                    <Row k="Assignment" v={assignment.assignmentNo} />
                    <Row k="Status" v={assignment.status.replace(/_/g, " ").toLowerCase()} />
                    <Row k="Consignment" v={assignment.consignmentNo || "—"} />
                    <Row k="Tracking" v={assignment.trackingUrl ? <a href={assignment.trackingUrl} target="_blank" rel="noreferrer" className="text-purple underline">Open tracking</a> : "—"} />
                  </>
                ) : (
                  <p className="text-[13px] text-body-soft mt-0 mb-3">Not with a carrier yet.</p>
                )}

                {canAssign && (
                  <>
                    <div className="inline-flex rounded-[12px] border border-[#e9dcf5] overflow-hidden mt-3">
                      {(["RIDER", "COURIER"] as const).map((k) => {
                        const on = carrierKind === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => { setCarrierKind(k); setCarrierId(""); }}
                            className="text-[13px] font-bold px-4 py-2 inline-flex items-center gap-1.5"
                            style={on ? { background: TONE.purple.solid, color: "#fff", boxShadow: "0 2px 8px rgba(107,70,155,.35)" } : { background: "#fff", color: "#a892bb" }}
                          >
                            <Icon name={k === "RIDER" ? "user" : "truck"} size={14} /> {k === "RIDER" ? "Own rider" : "Courier"}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3 mt-3">
                      <div>
                        <label className="text-[13px] text-body-soft font-medium mb-1 block">{carrierKind === "RIDER" ? "Rider" : "Courier"}</label>
                        <select className="ipt h-[42px]" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
                          <option value="">{carrierKind === "RIDER" ? "Select rider…" : "Select courier…"}</option>
                          {(carrierKind === "RIDER" ? riders : couriers).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      {carrierKind === "COURIER" && (
                        <div>
                          <label className="text-[13px] text-body-soft font-medium mb-1 block">Consignment id</label>
                          <input className="ipt h-[42px]" value={consignment} onChange={(e) => setConsignment(e.target.value)} placeholder="from the courier panel" />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap mt-3.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const payload = [
                            `Recipient: ${o.isGift ? o.recipient?.name : custName}`,
                            `Phone: ${o.isGift ? o.recipient?.phone : o.sender.phone}`,
                            `Address: ${o.address}`,
                            `Parcel: ${o.lines.map((l) => `${l.name} x${l.qty}`).join(", ")}`,
                            `COD amount: ${due > 0 ? formatTaka(due) : "0 (prepaid)"}`,
                            `Note: ${o.deliveryNotes || "-"}`,
                            `Ref: ${orderNo}`,
                          ].join("\n");
                          try {
                            await navigator.clipboard.writeText(payload);
                            setCopiedEntry(true);
                            setTimeout(() => setCopiedEntry(false), 2000);
                          } catch {
                            setActErr("Could not reach the clipboard — copy the details from the order instead.");
                          }
                        }}
                        className="text-[13px] px-4 py-2.5 rounded-[10px] font-bold border bg-white inline-flex items-center gap-1.5"
                        style={{ borderColor: TONE.blue.border, color: TONE.blue.text }}
                      >
                        <Icon name={copiedEntry ? "check" : "copy"} size={14} /> {copiedEntry ? "Copied" : "Copy data entry"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !carrierId}
                        onClick={() => act(async () => {
                          await createAssignment({
                            orderId: id,
                            kind: carrierKind,
                            ...(carrierKind === "RIDER"
                              ? { riderId: carrierId }
                              : { courierId: carrierId, consignmentNo: consignment.trim() || undefined }),
                          });
                          setCarrierId("");
                          setConsignment("");
                        })}
                        className="text-[13px] px-5 py-2.5 rounded-[10px] font-bold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                        style={{ background: TONE.blue.solid }}
                      >
                        <Icon name="truck" size={14} /> {assignment ? "Re-assign carrier" : "Assign carrier"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Panel>
          )}

          {/* PHOTOS */}
          {sec === "photos" && (
            <Panel title="Photos & proof" icon="photo" tone="blue" hint="captured by Delivery — before it leaves, and at the door">
              <div className="p-5">
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  {[["Before delivery", o.prepPhoto, "Added when the order is prepared."], ["After delivery", o.deliveryPhoto, "Added at handover."]].map(([label, photo, empty]) => {
                    const ph = photo as Order["prepPhoto"];
                    const t = ph ? TONE.green : TONE.purple;
                    return (
                      <div key={label as string} className="border rounded-[14px] overflow-hidden" style={{ borderColor: t.border, background: t.bg }}>
                        <div className="px-3.5 pt-3 pb-2 text-[12px] font-medium uppercase tracking-[0.04em] flex items-center gap-1.5" style={{ color: t.text }}>
                          {ph && <Icon name="check" size={13} />} {label as string}
                        </div>
                        {ph ? (
                          <>
                            <div className="h-[150px] relative" style={{ background: ph.bg }}><span className="absolute bottom-2 left-2 text-[11px] bg-white/90 text-purple px-2 py-0.5 rounded-full font-medium">{ph.caption}</span></div>
                            <div className="px-3.5 py-2.5 text-[12px]" style={{ color: t.text }}>{ph.by} · {shortDate(ph.at)}, {clockTime(ph.at)}</div>
                          </>
                        ) : (
                          <div className="h-[180px] grid place-items-center text-center px-4"><div>
                            <div className="w-10 h-10 rounded-full grid place-items-center mx-auto mb-2" style={{ background: t.soft, color: t.text }}><Icon name="photo" size={20} /></div>
                            <p className="text-[12px] m-0" style={{ color: t.text }}>{empty as string}</p>
                          </div></div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2 text-[13px] text-body-soft"><Icon name="check" size={15} /> Photo updates to the customer are {o.photoUpdates ? "on" : "off"}.</div>
              </div>
            </Panel>
          )}

          {/* PAYMENT */}
          {sec === "payment" && (
            <Panel title="Payment" icon="cash" tone={paymentTone(o.payment.status)} hint="gateway = SSLCommerz · ledger entry owned by Finance">
              <div className="p-5">
                <Row k="Method" v={o.payment.method === "online" ? "Online (SSLCommerz)" : "Cash on delivery"} />
                <Row k="Status" v={<Chip meta={pm} />} />
                <Row k="Order total" v={formatTaka(o.totalPaisa)} />
                <Row k="Paid" v={formatTaka(paidNet)} />
                {due > 0 && <Row k={o.payment.method === "cod" ? "Collect on delivery" : "To charge"} v={<span className="font-medium" style={{ color: TONE.gold.text }}>{formatTaka(due)}</span>} />}
                {o.payment.refundPaisa > 0 && <Row k="Refunded" v={<span style={{ color: TONE.rose.text }}>{formatTaka(o.payment.refundPaisa)}</span>} />}
                {/* record money in / out — cash collection lives here */}
                {!cancelled && (
                  <div className="mt-4 rounded-[12px] border p-4" style={{ background: TONE.green.bg, borderColor: TONE.green.border }}>
                    <div className="text-[12px] font-medium uppercase tracking-[0.05em] mb-2.5" style={{ color: TONE.green.text }}>Record a payment</div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 items-end">
                      <div>
                        <label className="text-[13px] text-body-soft font-medium mb-1 block">What happened</label>
                        <select className="ipt h-[42px]" value={payKind} onChange={(e) => setPayKind(e.target.value as typeof payKind)}>
                          <option value="COD_COLLECTED">Cash collected</option>
                          <option value="ADVANCE">Advance received</option>
                          <option value="PAYMENT">Payment received</option>
                          <option value="REFUND">Refund given</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[13px] text-body-soft font-medium mb-1 block">Amount ৳</label>
                        <input type="number" min={0} className="ipt h-[42px]" value={payAmt ? Math.round(payAmt / 100) : ""} placeholder={due > 0 ? String(Math.round(due / 100)) : "0"} onChange={(e) => setPayAmt(Math.max(0, Number(e.target.value)) * 100)} />
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const amt = payAmt || due;
                          if (amt <= 0) return alert("Enter an amount.");
                          act(() => addOrderPayment(id, { kind: payKind, amountPaisa: amt }).then(() => setPayAmt(0)));
                        }}
                        className="h-[42px] px-4 rounded-[11px] text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                        style={{ background: payKind === "REFUND" ? TONE.rose.solid : TONE.green.solid }}
                      >
                        <Icon name="cash" size={15} /> Record
                      </button>
                    </div>
                    {due > 0 && <p className="text-[11.5px] mt-2 mb-0" style={{ color: TONE.green.text }}>Leave the amount empty to record the full due of {formatTaka(due)}.</p>}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {crafted && <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px] border" style={{ background: TONE.amber.bg, borderColor: TONE.amber.border, color: TONE.amber.text }}>This order has a crafted item — advance payment applies and cash on delivery is blocked.</div>}
                  {o.isGift && <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px] border" style={{ background: TONE.gold.bg, borderColor: TONE.gold.border, color: TONE.gold.text }}>Gift order — cash on delivery is never offered.</div>}
                </div>
              </div>
            </Panel>
          )}

          {/* ACTIVITY */}
          {sec === "activity" && (
            <Panel title="Activity log" icon="clock" tone="blue" hint="who, when and what — written automatically, never editable">
              <div className="p-5">
                {o.timeline.length === 0 ? <p className="text-[13px] text-body-soft m-0">No activity recorded yet.</p> : (
                  <div className="flex flex-col">
                    {o.timeline.map((e, i, arr) => {
                      const t = TONE[KIND_TONE[e.kind] ?? "purple"];
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: t.solid }} />
                            {i < arr.length - 1 && <span className="w-px flex-1 bg-lavender-deep my-1" />}
                          </div>
                          <div className="pb-4">
                            <div className="text-[13.5px] text-body">{e.label}</div>
                            <div className="text-[13px] text-body-soft">{e.actor} · {shortDate(e.at)}, {clockTime(e.at)}</div>
                            {e.note && <div className="text-[13px] text-body-soft mt-0.5 italic">{e.note}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        {/* live preview */}
        <aside className="w-[300px] shrink-0 sticky top-4 hidden xl:block">
          <div className="text-[13px] text-body-soft font-medium uppercase tracking-[0.06em] mb-2.5 px-1">Live preview · customer view</div>
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-lift overflow-hidden">
            <div className="px-5 pt-5 pb-6 text-white" style={{ background: "linear-gradient(150deg,#470066,#cf43ea)" }}>
              <div className="text-[12px] opacity-85">{orderNo}</div>
              <div className="font-display text-[18px] leading-tight mt-0.5">{cancelled ? "Order cancelled" : o.deliveryStatus === "delivered" ? "Delivered 🌸" : o.isGift ? "Your gift is on its way" : "Your order is on its way"}</div>
              <div className="text-[12px] opacity-85 mt-1">{o.isGift ? `For ${o.recipient?.name} · ` : ""}{o.etaLabel}</div>
            </div>
            <div className="p-4">
              {cancelled ? (
                <div className="text-[12.5px]" style={{ color: TONE.rose.text }}>This order was cancelled. Any eligible refund has been issued.</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {JOURNEY.map((s, i) => {
                    const done = i < journeyIndex(o);
                    const now = i === journeyIndex(o);
                    return (
                      <div key={s} className="flex items-center gap-2 text-[12.5px]">
                        <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-white text-[10px] shrink-0" style={{ background: done ? TONE.green.solid : now ? TONE.purple.solid : "#e9dcf5" }}>{done ? "✓" : ""}</span>
                        <span className={now ? "text-purple font-medium" : done ? "text-body" : "text-body-soft"}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {o.prepPhoto && o.photoUpdates && !cancelled && <div className="mt-3 pt-3 border-t border-lavender-deep"><div className="text-[13px] text-body-soft mb-1.5">Photo update</div><div className="h-[70px] rounded-[10px]" style={{ background: o.prepPhoto.bg }} /></div>}
              {o.isGift && o.giftMessage && !cancelled && <div className="mt-3 pt-3 border-t border-lavender-deep text-[13px] text-body-soft italic">“{o.giftMessage}”</div>}
            </div>
          </div>
          <p className="text-[13px] text-body-soft mt-2.5 px-1">What the customer sees — one merged tracker, updating as Sales and Delivery advance the order.</p>
        </aside>
      </div>
    </div>
  );
}

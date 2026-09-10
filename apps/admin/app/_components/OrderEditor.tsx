"use client";

import { useEffect, useRef, useState } from "react";
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
  assignmentAction,
  orderAssignments,
  listRiders,
  listCourierServices,
  orderMessagesFor,
  retryOrderMessage,
  listFailReasons,
  type ApiFailReason,
  addOrderPhoto,
  editOrder,
  uploadItemImage,
  type ApiOrderMessage,
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
  codClosedReason,
  type Order,
  type TimelineKind,
} from "../_data/orders";
import type { Tone } from "./OrderViews";
import Icon from "./Icon";

/*
  Order detail — section by section, READ-ONLY. All editing lives on /orders/[id]/edit.

  THE SHAPE (owner, 9 Sep 2026 — design/order-page-v2.html):
  - one deep-purple band on top: order no, the share buttons, ONE stepper, four
    facts (Order · Payment · Delivery · Total). The three steppers this page
    used to carry said the same thing three times; staff ask one question —
    "where is it now" — so there is one answer
  - a bold action row under it: the ONE next step, Call, Record payment, Cancel
  - a deep-purple section nav on the left, white cards on the right. No tinted
    panels, no eyebrow sentences; what a card needs to explain sits behind ⓘ

  Business rules shown: stock −1 at Preparing (DEC-MOD-003), materials read
  from Product, per-line refund. The two owned tracks (Sales + Delivery) are
  still the truth underneath — only the drawing merged.
*/

const SECTIONS = [
  ["summary", "Summary", "layers"],
  ["customer", "Customer & recipient", "user"],
  ["items", "Items", "bag"],
  ["delivery", "Delivery", "truck"],
  ["photos", "Photos & proof", "photo"],
  ["payment", "Payment", "cash"],
  ["card", "Card message", "edit"],
  ["activity", "Activity log", "clock"],
] as const;
type SecId = (typeof SECTIONS)[number][0];

const KIND_COLOUR: Record<TimelineKind, string> = { sales: "#470066", delivery: "#1d7fd6", payment: "#0e8a44", system: "#b76e79" };

/* ---------------- solid colours: one per state, read across the room ---------------- */
const SOLID = { orchid: "#cf43ea", indigo: "#4f46e5", green: "#0e8a44", amber: "#d97706", red: "#d92d20", blue: "#1d7fd6", purple: "#470066", grey: "#8d7f98" };
function salesColour(st: Order["salesStatus"]): string {
  return st === "placed" ? SOLID.orchid : st === "confirmed" ? SOLID.indigo : st === "completed" ? SOLID.green : SOLID.red;
}
function deliveryColour(d: Order["deliveryStatus"]): string {
  return d === "preparing" ? SOLID.amber : d === "out_for_delivery" ? SOLID.blue : d === "delivered" ? SOLID.green : d === "failed" || d === "stock_reverted" ? SOLID.red : SOLID.grey;
}
function paymentColour(o: Order): string {
  const p = o.payment.status;
  if (p === "paid" || p === "cod_collected") return SOLID.green;
  if (p === "advance_paid") return SOLID.indigo;
  if (p === "refunded") return SOLID.red;
  if (p === "partially_refunded") return SOLID.purple;
  return o.payment.method === "cod" ? SOLID.amber : SOLID.red;
}

/* ---------------- the ONE stepper, drawn on the dark band ---------------- */
function Stepper({ steps, current, dead, deadLabel }: { steps: string[]; current: number; dead?: boolean; deadLabel?: string }) {
  if (dead) {
    return (
      <div className="rounded-[12px] px-4 py-3 text-[13px] font-semibold inline-flex items-center gap-2 bg-white/10 border border-white/20 text-[#ffb4ad]">
        <Icon name="shield" size={16} /> {deadLabel}
      </div>
    );
  }
  return (
    <div className="flex items-start">
      {steps.map((st, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <div key={st} className="flex-1 flex flex-col items-center relative min-w-0">
            {i > 0 && <span className="absolute top-[14px] right-1/2 w-full h-[4px] rounded-full" style={{ background: done || now ? "#fff" : "rgba(255,255,255,.18)" }} />}
            <span
              className="relative z-10 w-[30px] h-[30px] rounded-full grid place-items-center text-[12px] font-bold"
              style={
                done
                  ? { background: "#fff", color: "#ce6ef7" }
                  : now
                    ? { background: "#fff", color: "#ce6ef7", boxShadow: "0 0 0 4px rgba(255,255,255,.22)" }
                    : { background: "#320049", color: "#e7d8f2", border: "3px solid rgba(255,255,255,.3)" }
              }
            >
              {done ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="mt-2 text-[12.5px] font-semibold text-center leading-tight px-1" style={{ color: now || done ? "#fff" : "#d9c5e6" }}>
              {st}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* a fact on the band — label, big value, one small line */
function Fact({ label, value, sub, colour, hot }: { label: string; value: string; sub?: string; colour: string; hot?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[14px] px-4 py-3 pl-[18px] border border-white/15 bg-white/[0.08]">
      <span className="absolute left-0 top-[9px] bottom-[9px] w-[5px] rounded-r-[6px]" style={{ background: colour }} />
      <div className="text-[11px] font-medium text-[#d9c5e6]">{label}</div>
      <div className="font-semibold text-[17px] leading-tight mt-1" style={{ color: hot ? "#ffb4ad" : "#fff" }}>{value}</div>
      {sub && <div className="text-[12px] font-semibold text-[#d9c5e6] mt-1">{sub}</div>}
    </div>
  );
}

/* the white card every section is drawn in — the explanation lives behind ⓘ */
function Card({ title, count, hint, right, children }: { title: string; icon?: string; tone?: Tone; count?: number; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[16px] border-[1.5px] border-[#3e3248] mb-3">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <h3 className="font-semibold text-[17px] text-purple m-0 leading-tight">{title}</h3>
        {count !== undefined && <span className="text-[11px] font-bold px-2 py-[2px] rounded-full bg-lavender text-purple">{count}</span>}
        {hint && (
          <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-lavender-deep text-purple text-[10.5px] font-semibold grid place-items-center cursor-help" title={hint}>
            i
          </span>
        )}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-[#3e3248] last:border-0 text-[13.5px]">
      <span className="font-medium text-body-soft">{k}</span>
      <span className="font-semibold text-body text-right">{v}</span>
    </div>
  );
}

function Pill({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full text-white leading-none whitespace-nowrap" style={{ background: colour }}>
      {children}
    </span>
  );
}

const JOURNEY = ["Placed", "Confirmed", "Preparing", "Out for delivery", "Delivered"];

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
  /*  R4 (4 Sep 2026) — a double-click on "Start preparing" moved the order
      TWO stages. The first click finished, the page re-rendered, the primary
      button became "Out for delivery" in the same spot, and the second click
      of the same double-click pressed it. `busy` alone cannot stop that: it
      is React state, so a click that lands before the render sees it as
      free, and it is already false again by the time the button has changed
      its name. Two guards, neither of them state:
        · `inFlight` — a ref, flipped synchronously, so a second click while
          a request is out is dropped before anything is sent
        · `cooldown` — after a successful transition the primary button stays
          shut for a moment, so the NEXT stage can only be reached by a fresh,
          deliberate click, never by the tail of the last one  */
  const inFlight = useRef(false);
  const [cooldown, setCooldown] = useState(false);
  /** why the last action was refused — shown on the page, never in an alert */
  const [actErr, setActErr] = useState("");
  const [sec, setSec] = useState<SecId>("summary");
  const [openMaterials, setOpenMaterials] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEntry, setCopiedEntry] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  /*  carrier hand-off — Phase 6: the ONE path is a DeliveryAssignment
      (POST /delivery/assignments), so the parcel reaches the board, analytics,
      cost posting and COD reconciliation. The old /orders/:id/courier wrote
      onto the Order and told Delivery nothing. */
  const [carrierKind, setCarrierKind] = useState<"RIDER" | "COURIER" | "ONE_TIME">("RIDER");
  const [carrierId, setCarrierId] = useState("");
  const [consignment, setConsignment] = useState("");
  /*  ONE_TIME (owner, 10 Sep 2026): a Pathao/Uber rider called for this trip.
      No name is kept anywhere — platform, a phone for today, what was paid.  */
  const [platform, setPlatform] = useState("Pathao ride");
  const [riderPhone, setRiderPhone] = useState("");
  const [fare, setFare] = useState("");
  const [paidCash, setPaidCash] = useState(true);
  const [chargeCustomer, setChargeCustomer] = useState(false);
  /*  the failed-delivery box (owner, 10 Sep 2026): reason + what staff decided  */
  const [failOpen, setFailOpen] = useState(false);
  const [failReasons, setFailReasons] = useState<ApiFailReason[]>([]);
  const [failReasonId, setFailReasonId] = useState("");
  const [failNote, setFailNote] = useState("");
  const [failDecision, setFailDecision] = useState<"RETRY" | "KEEP" | "CANCEL">("RETRY");
  /*  the photograph's journey to the customer — newest PHOTO_UPDATE message  */
  const [photoMsg, setPhotoMsg] = useState<ApiOrderMessage | null>(null);
  const [riders, setRiders] = useState<ApiRider[]>([]);
  const [couriers, setCouriers] = useState<ApiCourierService[]>([]);
  const [assignment, setAssignment] = useState<ApiAssignment | null>(null);
  /* proof photographs, added from the order itself (8 Sep 2026) */
  const [uploading, setUploading] = useState<"PREP" | "DELIVERY" | null>(null);
  const [photoErr, setPhotoErr] = useState("");
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
    orderMessagesFor(id)
      .then((rows) => setPhotoMsg(rows.filter((m) => m.kind === "PHOTO_UPDATE").sort((a, b) => b.attempt - a.attempt)[0] ?? null))
      .catch(() => setPhotoMsg(null));
  }
  /**
   * Add (or replace) a proof photograph on this order.
   *
   * ⚠️ The picture is UPLOADED and the row keeps the address — DLV-R08. A phone
   * photograph as a base64 data-URL regularly blew past the request limit, and
   * the shot the rider thought he had filed was never saved.
   */
  async function uploadPhoto(kind: "PREP" | "DELIVERY", file: File) {
    setPhotoErr("");
    setUploading(kind);
    try {
      const url = await uploadItemImage(file, "delivery", 1400);
      await addOrderPhoto(id, { kind, url, capturedBy: "Admin" });
      await reload();
      /*  the send is queued and swept within seconds — look again so the
          card can say WhatsApp / email / profile-only without a refresh  */
      if (kind === "PREP" && o?.photoUpdates) window.setTimeout(() => void reload(), 4000);
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "Could not upload that photo.");
    } finally {
      setUploading(null);
    }
  }

  /** the customer's copy of those photographs — on or off, from the order itself */
  async function togglePhotoUpdates() {
    if (!o) return;
    setPhotoErr("");
    setBusy(true);
    try {
      await editOrder(id, { photoUpdates: !o.photoUpdates });
      await reload();
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "Could not change that.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    listRiders().then((r) => setRiders(r.filter((x) => x.isActive))).catch(() => setRiders([]));
    listCourierServices().then((c) => setCouriers(c.filter((x) => x.isActive))).catch(() => setCouriers([]));
    listFailReasons().then(setFailReasons).catch(() => setFailReasons([]));
  }, []);
  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    /*  The board links straight to a card (?sec=delivery, ?sec=photos) or to
        the failed box (?fail=1) — owner, 10 Sep 2026: same buttons, same
        page, one click apart.  */
    try {
      const sp = new URLSearchParams(window.location.search);
      const want = sp.get("sec");
      if (want && SECTIONS.some(([k]) => k === want)) setSec(want as SecId);
      if (sp.get("fail") === "1") setFailOpen(true);
    } catch {
      /* no window — nothing to read */
    }
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
  async function act(fn: () => Promise<unknown>, opts: { transition?: boolean } = {}) {
    if (inFlight.current) return; // R4 — one request at a time, decided synchronously
    inFlight.current = true;
    setBusy(true);
    setActErr("");
    let moved = false;
    try {
      await fn();
      moved = true;
      await reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (moved && opts.transition) {
        setCooldown(true);
        window.setTimeout(() => setCooldown(false), 1500);
      }
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
  /*  R2 / DEC-SAL-015 — the notice on the Payment tab used to say "crafted
      item — cash on delivery is blocked". CRAFTED stopped being a COD rule on
      30 Aug (the shop assembles nearly everything it sells); the server's
      `assertCodAllowed` and the website already knew. This screen did not.  */
  const codClosed = codClosedReason(o);
  const due = Math.max(0, o.payment.duePaisa);
  const paidNet = o.payment.paidPaisa - o.payment.refundPaisa;
  const custName = cust?.name ?? o.sender.name;
  const orderNo = (o as { orderNo?: string }).orderNo ?? o.id;

  /* the form shows until the parcel is out — re-assigning supersedes (DLV-R01) */
  /*  DEC-DLV-021 — a parcel ON THE ROAD can still change hands, so the form
      stays open while it is out. It closes once the parcel has landed or the
      assignment is dead; re-assigning then would be rewriting history, not
      swapping a carrier.  */
  const canAssign =
    !terminal && (!assignment || assignment.status === "ASSIGNED" || assignment.status === "OUT_FOR_DELIVERY");
  const isSwap = assignment?.status === "OUT_FOR_DELIVERY";
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
      /*  The clipboard can be refused by the browser; saying so beside the
          button beats a blocking alert over the whole order.  */
      setActErr("Could not reach the clipboard — select the text and copy it by hand.");
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

  /*  The single next step, coloured by what it is.

      ⚠️ THE LAST TWO GO THROUGH DELIVERY WHEN A CARRIER IS CARRYING THE PARCEL
      — 30 Aug 2026, found while walking DEC-DLV-021.

      "Out for delivery" here used to call `orders.out-for-delivery` directly.
      The ORDER moved and the ASSIGNMENT did not: DLV-000002 sat at *assigned*
      while the order read *out for delivery*, so the board showed a parcel
      nobody had taken out, the analytics never saw it leave, and a carrier
      swap was recorded as CANCELLED because the assignment never said it was
      on the road. Two doors to the same fact, and one of them silent — the
      same shape as the courier bug that opened this phase.

      `assignmentAction` calls the order method itself, so the order rules
      (stock, unpaid refusal, DEC-SAL-016 times) all still run — this only
      makes sure Delivery hears about it too. With no assignment there is
      nothing to tell, and the order action stands on its own.  */
  const live = assignment && assignment.isActive ? assignment : null;
  /*  THE TWO GATES BEFORE THE DOOR (owner, 10 Sep 2026). The next step is
      never hidden: when it is locked, the button says what unlocks it and
      takes you there — a carrier first, then the customer's photograph when
      they ticked "photo updates" at checkout. The server refuses the same
      two things, so a stale page cannot slip past.  */
  const hasCarrier = !!live && live.status === "ASSIGNED";
  const needsPhoto = o.photoUpdates && !o.prepPhoto;
  const readyToGo = o.deliveryStatus === "preparing" || o.deliveryStatus === "failed";
  type Step = { label: string; colour: string; run?: () => Promise<unknown>; go?: SecId; locked?: string };
  const nextStep: Step | null =
    o.salesStatus === "placed"
      ? { label: "Confirm order", colour: SOLID.green, run: () => orderAction(id, "confirm") }
      : o.salesStatus === "confirmed" && o.deliveryStatus === "unassigned"
        ? { label: "Start preparing", colour: SOLID.amber, run: () => orderAction(id, "prepare") }
        : readyToGo
          ? !hasCarrier
            ? { label: o.deliveryStatus === "failed" ? "Assign a carrier for the retry" : "Assign carrier", colour: SOLID.blue, go: "delivery", locked: "Out for delivery · needs a carrier" }
            : needsPhoto
              ? { label: "Add the customer's photo", colour: SOLID.blue, go: "photos", locked: "Out for delivery · needs the photo the customer asked for" }
              : { label: "Out for delivery", colour: SOLID.orchid, run: () => assignmentAction(live!.id, "out") }
          : o.deliveryStatus === "out_for_delivery"
            ? {
                label: "Mark delivered",
                colour: SOLID.green,
                run: () =>
                  live && live.status === "OUT_FOR_DELIVERY"
                    ? assignmentAction(live.id, "delivered")
                    : orderAction(id, "delivered"),
              }
            : null;
  const canFail = !terminal && (o.deliveryStatus === "out_for_delivery" || (hasCarrier && o.deliveryStatus === "preparing"));

  const shareBtn = "h-[34px] px-3 rounded-[10px] bg-white text-purple text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-lavender";
  const actBtn = "h-[40px] px-4 rounded-[11px] text-[13.5px] font-semibold inline-flex items-center gap-2 disabled:opacity-50";

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1650px]">
      {/* THE BAND — order, share, one stepper, four facts */}
      <div className="rounded-[20px] px-6 pt-5 pb-5 mb-4 text-white" style={{ background: "linear-gradient(135deg,#320049 0%,#5a0a80 100%)" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/orders/list" className="w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0 bg-white/10 border border-white/25 text-white hover:bg-white/20" title="Back">
            <Icon name="chevronLeft" size={19} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display font-semibold text-[24px] text-white m-0 leading-none">{orderNo}</h1>
              <span className="text-[10.5px] font-bold tracking-[0.08em] px-2 py-[3px] rounded-full leading-none" style={o.isGift ? { background: SOLID.orchid, color: "#fff" } : { background: "rgba(255,255,255,.18)", color: "#fff" }}>
                {o.isGift ? "GIFT" : "SELF"}
              </span>
            </div>
            {/* REV-M6: the channel name comes from the API, so a new/admin-created
                channel (Shop, TikTok…) shows properly instead of blank */}
            <p className="text-[13px] font-medium text-[#d9c5e6] m-0 mt-1.5">
              {shortDate(o.placedAt)}, {clockTime(o.placedAt)} · {channelName} · {o.methodLabel} · {custName}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={shareCopy} title="Copy order details" className={shareBtn} style={copied ? { color: SOLID.green } : undefined}>
              <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => window.print()} title="Print" className={shareBtn}>
              <Icon name="book" size={14} /> Print
            </button>
            <a href={waHref} target="_blank" rel="noreferrer" title="Send on WhatsApp" className={shareBtn}>
              <Icon name="phone" size={14} /> WhatsApp
            </a>
            <a href={mailHref} title="Send by email" className={shareBtn}>
              <Icon name="mail" size={14} /> Email
            </a>
            {!terminal && (
              <Link href={`/orders/${o.id}/edit`} className="h-[34px] px-3.5 rounded-[10px] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5" style={{ background: SOLID.orchid }}>
                <Icon name="edit" size={14} /> Edit order
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 mb-4 px-2">
          <Stepper steps={JOURNEY} current={journeyIndex(o)} dead={cancelled || failed} deadLabel={cancelled ? "Order cancelled — per-line refund applied" : dm.label} />
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Fact label="Order" value={sm.label} colour={salesColour(o.salesStatus)} sub={o.salesStatus === "placed" ? "waiting for you" : undefined} />
          <Fact label="Payment" value={due > 0 ? `${pm.label} · ${formatTaka(due)}` : pm.label} colour={paymentColour(o)} hot={due > 0 && !cancelled} sub={due > 0 ? (o.payment.method === "cod" ? "collect at the door" : "to charge") : "nothing to collect"} />
          <Fact label="Delivery" value={dm.label} colour={deliveryColour(o.deliveryStatus)} sub={[o.date, o.slotLabel].filter(Boolean).join(" · ") || o.etaLabel || undefined} />
          <Fact label="Total" value={formatTaka(o.totalPaisa)} colour="#fff" sub={`${o.lines.length} item${o.lines.length === 1 ? "" : "s"} · paid ${formatTaka(paidNet)}`} />
        </div>
      </div>

      {/* THE ACTION ROW — the one next step, then the things you reach for */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        {nextStep && !terminal && (
          <button
            type="button"
            disabled={busy || cooldown}
            onClick={() => (nextStep.run ? act(nextStep.run, { transition: true }) : setSec(nextStep.go!))}
            className={`${actBtn} text-white`}
            style={{ background: nextStep.colour }}
          >
            <Icon name={nextStep.run ? "check" : "chevronRight"} size={16} /> {busy ? "Working…" : nextStep.label}
          </button>
        )}
        {nextStep?.locked && !terminal && (
          <span className="h-[40px] px-4 rounded-[11px] text-[13px] font-medium inline-flex items-center gap-2 bg-[#2a2131] text-[#aea5b6] border-[1.5px] border-[#3e3447]" title="Locked until the step on the left is done">
            {nextStep.locked}
          </span>
        )}
        {canFail && (
          <button type="button" disabled={busy} onClick={() => setFailOpen((v) => !v)} className={`${actBtn} bg-white border-[1.5px]`} style={{ borderColor: "#522c28", color: SOLID.red }}>
            <Icon name="alert" size={15} /> Delivery failed
          </button>
        )}
        {terminal && (
          <span className="h-[40px] px-4 rounded-[11px] text-[13.5px] font-semibold inline-flex items-center gap-2 bg-white border-[1.5px]" style={{ color: cancelled ? SOLID.red : SOLID.green, borderColor: cancelled ? SOLID.red : SOLID.green }}>
            {cancelled ? "Cancelled — read-only" : "Completed — read-only"}
          </span>
        )}
        <a href={`tel:${waPhone}`} className={`${actBtn} bg-white border-[1.5px]`} style={{ color: SOLID.green, borderColor: SOLID.green }}>
          <Icon name="phone" size={15} /> Call {o.isGift ? "recipient" : "customer"}
        </a>
        {!cancelled && due > 0 && (
          <button type="button" onClick={() => setSec("payment")} className={`${actBtn} bg-white border-[1.5px] border-[#3e3248] text-purple`}>
            <Icon name="cash" size={15} /> Record payment
          </button>
        )}
        {!terminal && (
          <button type="button" disabled={busy} onClick={() => { if (confirm("Cancel this order? Per-line refund (readymade full, crafted advance forfeit) will be applied.")) act(() => cancelOrder(id, "staff cancelled")); }} className={`${actBtn} ml-auto bg-white border-[1.5px]`} style={{ borderColor: "#522c28", color: SOLID.red }}>
            Cancel order
          </button>
        )}
      </div>

      {/*  Why the last step was refused — on the page, beside the button that
           was pressed. This is usually a RULE, not a fault: "record the payment
           first", "items are locked once preparing starts". It reads as one.  */}
      {actErr && (
        <div className="flex items-start gap-2.5 rounded-[12px] border-[1.5px] px-4 py-3 mb-4 text-[13px] font-medium bg-white" style={{ borderColor: SOLID.amber, color: "#f7b86e" }}>
          <Icon name="alert" size={16} />
          <span className="flex-1 min-w-0">{actErr}</span>
          <button type="button" onClick={() => setActErr("")} className="font-semibold shrink-0 opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/*  FAILED — the reason from the list and what staff decided (owner,
           10 Sep 2026). Retry keeps the order, waiting for a new carrier;
           Keep leaves it failed for now; Cancel goes through Sales with its
           refund rules. Who pays a retry's fare is chosen when the retry is
           assigned, on the carrier card.  */}
      {failOpen && !terminal && (
        <div className="rounded-[14px] border-[1.5px] bg-white px-5 py-4 mb-4" style={{ borderColor: "#522c28" }}>
          <div className="text-[13.5px] font-semibold mb-3" style={{ color: SOLID.red }}>Delivery failed — what happened, and what next?</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <div>
              <label className="text-[13px] text-body-soft font-medium mb-1 block">Why</label>
              <select className="ipt h-[42px]" value={failReasonId} onChange={(e) => setFailReasonId(e.target.value)}>
                <option value="">Pick a reason…</option>
                {failReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[13px] text-body-soft font-medium mb-1 block">Note</label>
              <input className="ipt h-[42px]" value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 max-md:grid-cols-1">
            {([
              ["RETRY", "Retry", "assign a carrier again"],
              ["KEEP", "Keep as failed", "no retry yet — stays on the board"],
              ["CANCEL", "Cancel order", "goes to Cancelled · refund rules apply"],
            ] as const).map(([k, t, sub]) => {
              const on = failDecision === k;
              return (
                <button key={k} type="button" onClick={() => setFailDecision(k)} className="text-left rounded-[12px] border-[1.5px] px-4 py-3 bg-white" style={{ borderColor: on ? SOLID.red : "#3e3248", background: on ? "#391616" : "#fff" }}>
                  <span className="block text-[13.5px] font-semibold" style={{ color: on ? SOLID.red : "#f1eaf6" }}>{t}</span>
                  <span className="block text-[12px] text-body-soft">{sub}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3.5">
            <button
              type="button"
              disabled={busy || (!failReasonId && !failNote.trim())}
              onClick={() => act(async () => {
                const body = { failReasonId: failReasonId || undefined, failReason: failNote.trim() || undefined, decision: failDecision };
                if (live && (live.status === "OUT_FOR_DELIVERY" || live.status === "ASSIGNED")) await assignmentAction(live.id, "fail", body);
                else await orderAction(id, "fail");
                setFailOpen(false);
                setFailReasonId("");
                setFailNote("");
              }, { transition: true })}
              className={`${actBtn} text-white`}
              style={{ background: SOLID.red }}
            >
              {busy ? "Working…" : failDecision === "CANCEL" ? "Mark failed and cancel the order" : failDecision === "RETRY" ? "Mark failed — I will retry" : "Mark failed"}
            </button>
            <button type="button" onClick={() => setFailOpen(false)} className={`${actBtn} bg-white border-[1.5px] border-[#3e3248] text-purple`}>Close</button>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* section nav — the deep purple panel */}
        <nav className="w-[220px] shrink-0 sticky top-4 hidden md:block rounded-[16px] p-2" style={{ background: "#320049" }}>
          {SECTIONS.filter(([sid]) => sid !== "card" || o.isGift).map(([sid, label]) => {
            const b = badge(sid);
            const on = sec === sid;
            return (
              <button key={sid} type="button" onClick={() => setSec(sid)}
                className={"w-full flex items-center justify-between gap-2 px-3 py-[10px] rounded-[11px] text-[13.5px] font-bold text-left " + (on ? "bg-white text-purple" : "text-[#e7d8f2] hover:bg-white/10")}>
                <span className="flex-1">{label}</span>
                {b && <span className={"text-[11px] px-2 py-[2px] rounded-full font-bold " + (on ? "bg-lavender text-purple" : "bg-white/15 text-white")}>{b}</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0">
          <div className="md:hidden mb-4">
            <select className="ipt h-[44px]" value={sec} onChange={(e) => setSec(e.target.value as SecId)}>
              {SECTIONS.filter(([sid]) => sid !== "card" || o.isGift).map(([sid, label]) => (<option key={sid} value={sid}>{label}</option>))}
            </select>
          </div>

          {/* SUMMARY — the two things staff open an order for: who, and what */}
          {sec === "summary" && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title="Customer & recipient" hint="The account that placed the order. Lifetime value and order count are Sales-owned and update when the order is delivered." right={<button type="button" onClick={() => setSec("customer")} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-[1.5px] border-[#3e3248] text-purple bg-white">More</button>}>
                  <div className="px-5 pb-4">
                    <Row k="Customer" v={<Link href={`/customers/${o.customerId}`} className="text-purple hover:underline">{custName}</Link>} />
                    <Row k="Phone" v={o.sender.phone} />
                    <Row k="Recipient" v={o.isGift ? `${o.recipient?.name ?? "—"}${o.recipient?.phone ? ` · ${o.recipient.phone}` : ""}` : "Same person"} />
                    <Row k="Address" v={o.address} />
                    <Row k="Delivery" v={`${o.methodLabel}${o.date ? ` · ${o.date}` : ""}${o.slotLabel ? ` · ${o.slotLabel}` : ""}`} />
                  </div>
                </Card>
                <Card title="Items" count={o.lines.length} right={!terminal ? <Link href={`/orders/${o.id}/edit`} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-[1.5px] border-[#3e3248] text-purple bg-white">Edit</Link> : undefined}>
                  <div className="px-5 pb-4">
                    {o.lines.map((l) => (
                      <div key={l.id} className="grid grid-cols-[44px_1fr_auto_auto] gap-3 items-center py-2 border-b border-[#3e3248] last:border-0">
                        <div className="w-[44px] h-[44px] rounded-[10px]" style={{ background: l.bg }} />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold text-body truncate">{l.name}</div>
                          <div className="text-[12px] font-medium text-body-soft truncate">{[l.variantLabel, l.sizeLabel, l.bundleLabel].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="text-[13px] font-bold text-body-soft">× {l.qty}</div>
                        <div className="font-semibold text-[15px] text-body">{formatTaka(l.linePaisa)}</div>
                      </div>
                    ))}
                    <div className="pt-2 mt-1 border-t-2 border-lavender-deep">
                      {o.couponCode ? <Row k={`Coupon (${o.couponCode})`} v={`− ${formatTaka(o.discountPaisa)}`} /> : null}
                      <Row k="Delivery" v={o.deliveryWaivedPaisa > 0 ? `${formatTaka(o.deliveryPaisa)} (waived ${formatTaka(o.deliveryWaivedPaisa)})` : formatTaka(o.deliveryPaisa)} />
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-body-soft">Total</span>
                        <span className="font-semibold text-[22px] text-purple">{formatTaka(o.totalPaisa)}</span>
                      </div>
                      <div className="flex justify-between text-[13px] font-semibold"><span className="text-body-soft">Paid</span><span style={{ color: paidNet > 0 ? SOLID.green : SOLID.grey }}>{formatTaka(paidNet)}</span></div>
                      {due > 0 && <div className="flex justify-between text-[13px] font-semibold"><span className="text-body-soft">Due</span><span style={{ color: SOLID.red }}>{formatTaka(due)}</span></div>}
                    </div>
                  </div>
                </Card>
              </div>
              {o.internalNote && (
                <Card title="Internal note" hint="A private staff note — change it on the Edit order page.">
                  <div className="px-5 pb-4 text-[13.5px] font-medium text-body">{o.internalNote}</div>
                </Card>
              )}
            </>
          )}

          {/* CUSTOMER */}
          {sec === "customer" && (
            <>
              <Card title="Customer" hint="The account that placed the order — the profile lives in Customer Management. Lifetime value and order count are Sales-owned and update when the order is delivered.">
                <div className="px-5 pb-4">
                  <Row k="Name" v={<Link href={`/customers/${o.customerId}`} className="text-purple font-medium underline">{custName}</Link>} />
                  <Row k="Phone / WhatsApp" v={<span className="inline-flex items-center gap-2.5">{o.sender.phone}<a href={`tel:${o.sender.phone}`} className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-[8px] border bg-white" style={{ color: SOLID.green, borderColor: SOLID.green }}><Icon name="phone" size={12} /> Call</a></span>} />
                  <Row k="Email" v={o.sender.email ?? "—"} />
                  <Row k="Country" v={cust?.country ?? "—"} />
                  <Row k="Orders" v={String(cust?.ordersCount ?? 0)} />
                  <Row k="Lifetime value" v={formatTaka(cust?.ltvPaisa ?? 0)} />
                </div>
              </Card>

              {o.isGift ? (
                <Card title="Recipient & gift" hint="The rider calls this number on arrival.">
                  <div className="px-5 pb-4">
                    <Row k="Recipient" v={o.recipient?.customerId ? <Link href={`/customers/${o.recipient.customerId}`} className="text-purple font-medium underline">{o.recipient?.name}</Link> : o.recipient?.name} />
                    <Row k="Recipient phone" v={o.recipient?.phone ? <span className="inline-flex items-center gap-2.5">{o.recipient.phone}<a href={`tel:${o.recipient.phone}`} className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-[8px] border bg-white" style={{ color: SOLID.green, borderColor: SOLID.green }}><Icon name="phone" size={12} /> Call</a></span> : "—"} />
                    <Row k="Anonymous gift" v={o.anonymousGift ? "Yes — hide sender" : "No"} />
                    <Row k="Photo updates" v={o.photoUpdates ? "On" : "Off"} />
                  </div>
                </Card>
              ) : (
                <Card title="Recipient">
                  <div className="px-5 pb-4 text-[13.5px] font-medium text-body-soft">Delivered to the customer directly.</div>
                </Card>
              )}
            </>
          )}

          {/* CARD MESSAGE — its own section (gift orders only) */}
          {sec === "card" && o.isGift && (
            <>

              {/*  ── THE CARD, AS IT WILL BE WRITTEN (owner, 8 Sep 2026) ──
                   It used to be one `Row` among eight, truncated beside its
                   label, and the customer's line breaks were gone. This is
                   what somebody at the bench copies by hand, so it gets the
                   card's own shape and a Copy button — and it prints exactly
                   what the checkout sent, signature and all.  */}
              {o.isGift ? (
                <Card title="Card message" hint="Hand-written on the Radian card — copy it exactly, line breaks included.">
                  <div className="px-5 pb-4">
                    {o.giftMessage ? (
                      <>
                        <div className="rounded-[14px] border-[1.5px] border-lavender-deep p-5">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-orchid">Radian</div>
                          <p className="whitespace-pre-wrap text-[16px] leading-[1.7] text-purple m-0 mt-3">{o.giftMessage}</p>
                        </div>
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(o.giftMessage ?? "");
                              setCopiedCard(true);
                              setTimeout(() => setCopiedCard(false), 1600);
                            }}
                            className="text-[13px] font-semibold px-4 py-2.5 rounded-[10px] border-2 border-purple text-purple"
                          >
                            {copiedCard ? "Copied" : "Copy the message"}
                          </button>
                          {o.anonymousGift && (
                            <span className="text-[12.5px] font-semibold" style={{ color: SOLID.amber }}>
                              Unsigned — the sender&apos;s name must not appear on the card
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-[13.5px] font-medium text-body-soft m-0">No message — the card goes blank.</p>
                    )}
                  </div>
                </Card>
              ) : null}
            </>
          )}

          {/* ITEMS */}
          {sec === "items" && (
            <Card title="Items" count={o.lines.length} hint="Frozen at the ordered price — change them on the Edit order page." right={!terminal ? <Link href={`/orders/${o.id}/edit`} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-[1.5px] border-[#3e3248] text-purple bg-white">Edit</Link> : undefined}>
              <div className="px-5 pb-5 flex flex-col gap-3">
                {o.lines.map((l) => {
                  const craftedLine = l.productType === "crafted";
                  return (
                    <div key={l.id} className="border-[1.5px] border-[#3e3248] rounded-[14px] p-4 flex gap-3.5 bg-white">
                      <div className="w-[52px] h-[52px] rounded-[12px] shrink-0" style={{ background: l.bg }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/products/${l.productId}`} className="font-semibold text-[14.5px] text-purple hover:underline">{l.name}</Link>
                          <Pill colour={craftedLine ? SOLID.amber : SOLID.grey}>{craftedLine ? "Crafted · advance" : "Readymade"}</Pill>
                          <button type="button" onClick={() => setOpenMaterials((c) => (c === l.id ? null : l.id))} className="text-[11px] text-purple inline-flex items-center gap-1 hover:underline"><Icon name="box" size={13} /> {openMaterials === l.id ? "Hide details" : "Item details"}</button>
                        </div>
                        {/*  DEC-PRD-014 — the variant leads, because it is what
                            has to be MADE. Everything else on this line
                            describes the same product; this is the only part
                            that says which one came off the shelf.  */}
                        <div className="text-[13px] text-body-soft mt-0.5">
                          {l.variantLabel && (
                            <span className="inline-block text-[12px] font-semibold px-2 py-0.5 rounded-full mr-1.5 align-middle" style={{ background: "#2b1c35", color: "#ce6ef7" }}>
                              {l.variantLabel}
                            </span>
                          )}
                          {l.sizeLabel}{l.bundleLabel ? ` · ${l.bundleLabel}` : ""}{l.addonLabels.length ? ` · + ${l.addonLabels.join(", ")}` : ""}{l.persoText ? ` · “${l.persoText}”` : ""}
                        </div>
                        <div className="text-[13px] font-medium text-body mt-1">{l.qty} × {formatTaka(l.unitPaisa)} = <b className="font-semibold text-[15px] text-purple">{formatTaka(l.linePaisa)}</b></div>
                        {/*  DEC-PRD-061 — the customer's own photograph, and on
                            these products it is PRINTED ON THE GOODS (owner,
                            30 Aug). So it is shown at a size somebody can
                            actually judge and offered for download at the size
                            it arrived, not squeezed into a 40px square.  */}
                        {l.persoImageUrl && (
                          <div className="mt-2.5 inline-flex items-center gap-3 border rounded-[12px] p-2.5" style={{ borderColor: "#3e3248", background: "#fff" }}>
                            <a href={l.persoImageUrl} target="_blank" rel="noreferrer" className="block w-[72px] h-[72px] rounded-[9px] border shrink-0" style={{ borderColor: "#3e3248", background: `url(${l.persoImageUrl}) center/cover` }} />
                            <div>
                              <div className="text-[12px] font-medium uppercase tracking-[0.04em]" style={{ color: "#ce6ef7" }}>Customer&apos;s photo</div>
                              <a href={l.persoImageUrl} download target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-purple inline-flex items-center gap-1.5 mt-1 hover:underline">
                                <Icon name="download" size={14} /> Download full size
                              </a>
                            </div>
                          </div>
                        )}
                        {l.refundNote && <div className="text-[12px] mt-1.5" style={{ color: SOLID.red }}>Refund: {formatTaka(l.refundPaisa ?? 0)} — {l.refundNote}</div>}
                        {openMaterials === l.id && (
                          <div className="mt-2.5 border rounded-[10px] bg-white p-3" style={{ borderColor: "#3e3248" }}>
                            <div className="text-[11px] font-medium mb-1.5" style={{ color: "#ce6ef7" }}>What was ordered</div>
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
              </div>
            </Card>
          )}

          {/* DELIVERY */}
          {sec === "delivery" && (
            <Card title="Delivery" hint="Executed by Delivery — Sales only holds the promise." right={!terminal ? <Link href={`/orders/${o.id}/edit`} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-[1.5px] border-[#3e3248] text-purple bg-white">Edit</Link> : undefined}>
              <div className="px-5 pb-4">
                <Row k="Method" v={o.methodLabel} />
                <Row k="Zone" v={o.zone === "dhaka" ? "Inside Dhaka" : "Nationwide"} />
                <Row k="Date" v={o.date ?? "As soon as possible"} />
                <Row k="Time slot" v={o.slotLabel ?? "—"} />
                <Row k="Address" v={o.address} />
                <Row k="Rider contact" v={o.isGift ? o.recipient?.phone ?? o.sender.phone : o.sender.phone} />
                <Row k="ETA" v={o.etaLabel} />
                <Row k="Delivery note" v={o.deliveryNotes || "—"} />
              </div>
            </Card>
          )}

          {/* CARRIER — one click hands the parcel to Delivery without leaving the
              order. Phase 6: this creates a real DeliveryAssignment, so the
              parcel reaches the board, analytics, cost and COD settlement. */}
          {sec === "delivery" && (
            <Card title="Carrier" hint="Assigns through Delivery — the parcel lands on the delivery board and in its accounts. A parcel already on the road can be swapped to another carrier; that is never counted as a failed delivery.">
              <div className="px-5 pb-5">
                {assignment ? (
                  <>
                    <Row k="Carrier" v={<span className="font-medium text-purple">{assignment.kind === "RIDER" ? `Rider — ${assignment.rider?.name ?? "?"}` : assignment.kind === "ONE_TIME" ? `One-time — ${assignment.platform ?? "rider"}${assignment.riderPhone ? ` · ${assignment.riderPhone}` : ""}${assignment.costPaisa ? ` · paid ${formatTaka(assignment.costPaisa)}${assignment.paidCash ? " cash" : ""}` : ""}` : `Courier — ${assignment.courier?.name ?? "?"}`}</span>} />
                    <Row k="Assignment" v={assignment.assignmentNo} />
                    <Row k="Status" v={assignment.status.replace(/_/g, " ").toLowerCase()} />
                    <Row k="Consignment" v={assignment.consignmentNo || "—"} />
                    <Row k="Tracking" v={assignment.trackingUrl ? <a href={assignment.trackingUrl} target="_blank" rel="noreferrer" className="text-purple underline">Open tracking</a> : "—"} />
                  </>
                ) : (
                  <p className="text-[13px] font-medium text-body-soft mt-0 mb-3">Not with a carrier yet.</p>
                )}

                {canAssign && (
                  <>
                    <div className="inline-flex rounded-[12px] border-[1.5px] border-[#3e3248] overflow-hidden mt-3 bg-white">
                      {(["RIDER", "COURIER", "ONE_TIME"] as const).map((k) => {
                        const on = carrierKind === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => { setCarrierKind(k); setCarrierId(""); }}
                            className="text-[13px] font-semibold px-4 py-2 inline-flex items-center gap-1.5"
                            style={on ? { background: SOLID.purple, color: "#fff" } : { background: "#fff", color: "#afa4b7" }}
                          >
                            <Icon name={k === "RIDER" ? "user" : k === "COURIER" ? "truck" : "bolt"} size={14} /> {k === "RIDER" ? "Own rider" : k === "COURIER" ? "Courier company" : "One-time rider"}
                          </button>
                        );
                      })}
                    </div>

                    {carrierKind !== "ONE_TIME" ? (
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
                    ) : (
                      /*  Owner, 10 Sep 2026: "Uber ba Pathao theke je rider ashe, tar
                          naam rakhar pokkhe ami na." Platform, a phone for today,
                          the fare — nothing goes into the Riders list.  */
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mt-3">
                        <div>
                          <label className="text-[13px] text-body-soft font-medium mb-1 block">Platform</label>
                          <select className="ipt h-[42px]" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                            {["Pathao ride", "Uber", "Other"].map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[13px] text-body-soft font-medium mb-1 block">Rider phone (optional)</label>
                          <input className="ipt h-[42px]" value={riderPhone} onChange={(e) => setRiderPhone(e.target.value)} placeholder="for today only" />
                        </div>
                        <div>
                          <label className="text-[13px] text-body-soft font-medium mb-1 block">Fare ৳</label>
                          <input type="number" min={0} className="ipt h-[42px]" value={fare} onChange={(e) => setFare(e.target.value)} placeholder="leave blank for Settle" />
                        </div>
                        <label className="flex items-center gap-2 text-[13px] font-medium text-body self-end h-[42px]">
                          <input type="checkbox" className="w-4 h-4 accent-purple" checked={paidCash} onChange={(e) => setPaidCash(e.target.checked)} /> Paid in cash now
                        </label>
                      </div>
                    )}
                    {o.deliveryStatus === "failed" && (
                      <label className="flex items-center gap-2 text-[13px] font-medium text-body mt-3">
                        <input type="checkbox" className="w-4 h-4 accent-purple" checked={chargeCustomer} onChange={(e) => setChargeCustomer(e.target.checked)} />
                        This retry&apos;s delivery cost is charged to the customer (added to due when the cost is recorded)
                      </label>
                    )}

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
                        className="text-[13px] px-4 py-2.5 rounded-[10px] font-semibold border-[1.5px] bg-white inline-flex items-center gap-1.5"
                        style={{ borderColor: SOLID.blue, color: SOLID.blue }}
                      >
                        <Icon name={copiedEntry ? "check" : "copy"} size={14} /> {copiedEntry ? "Copied" : "Copy data entry"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || (carrierKind !== "ONE_TIME" && !carrierId)}
                        onClick={() => act(async () => {
                          await createAssignment({
                            orderId: id,
                            kind: carrierKind,
                            chargeCustomer: o.deliveryStatus === "failed" ? chargeCustomer : false,
                            ...(carrierKind === "RIDER"
                              ? { riderId: carrierId }
                              : carrierKind === "COURIER"
                                ? { courierId: carrierId, consignmentNo: consignment.trim() || undefined }
                                : {
                                    platform,
                                    riderPhone: riderPhone.trim() || undefined,
                                    costPaisa: fare ? Math.round(Number(fare) * 100) : undefined,
                                    paidCash,
                                  }),
                          });
                          setCarrierId("");
                          setConsignment("");
                          setRiderPhone("");
                          setFare("");
                          setChargeCustomer(false);
                        })}
                        className="text-[13px] px-5 py-2.5 rounded-[10px] font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                        style={{ background: SOLID.blue }}
                      >
                        {/*  DEC-DLV-021 — the word changes with the situation.
                            Swapping a parcel already on the road is a
                            different act from re-assigning one still in the
                            shop, and the button should not pretend otherwise. */}
                        <Icon name="truck" size={14} /> {isSwap ? "Swap carrier — it is on the road" : assignment ? "Re-assign carrier" : "Assign carrier"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* PHOTOS
              8 Sep 2026 — this panel could only LOOK at photographs. The one
              place to add one was Delivery → Proof photos, which meant leaving
              the order and searching for it again, so in practice nobody did
              and the switch below said "photo updates are on" about photos
              that were never taken. Both are real controls now. */}
          {sec === "photos" && (
            <Card title="Photos & proof" hint="Before it leaves the studio, and at the door. When the customer ticked photo updates at checkout, the before-delivery photo goes to them the moment it is saved: WhatsApp first, email if the number has no WhatsApp, and it is on their account either way. Out for delivery stays locked until that photo exists.">
              <div className="px-5 pb-5">
                {o.photoUpdates && (
                  <div className="mb-4 rounded-[12px] border-[1.5px] px-4 py-3 flex items-center gap-3 flex-wrap bg-white" style={{ borderColor: o.prepPhoto ? "#31493b" : "#534328" }}>
                    <span className="w-6 h-6 rounded-full grid place-items-center text-white text-[12px] shrink-0" style={{ background: o.prepPhoto ? SOLID.green : SOLID.amber }}>{o.prepPhoto ? "✓" : "!"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-body">{o.prepPhoto ? "Customer asked for a photo — done" : "Customer asked for a photo before delivery"}</div>
                      <div className="text-[12.5px] text-body-soft">
                        {!o.prepPhoto
                          ? "Add the before-delivery photo below; it is sent by itself."
                          : !photoMsg
                            ? "Saved to their account. Sending…"
                            : photoMsg.status === "SENT"
                              ? `Sent on ${photoMsg.channel === "WHATSAPP" ? "WhatsApp" : photoMsg.channel === "EMAIL" ? "email" : photoMsg.channel}${photoMsg.sentAt ? ` · ${shortDate(Date.parse(photoMsg.sentAt))}, ${clockTime(Date.parse(photoMsg.sentAt))}` : ""} · also on their account`
                              : photoMsg.status === "QUEUED"
                                ? "Sending…"
                                : `On their account only — ${photoMsg.error ?? "could not send"}`}
                      </div>
                    </div>
                    {photoMsg && (photoMsg.status === "FAILED" || photoMsg.status === "SKIPPED") && (
                      <button type="button" onClick={() => void retryOrderMessage(photoMsg.id).then(() => reload())} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-purple text-white shrink-0">Send again</button>
                    )}
                    {o.prepPhoto && (
                      <a href={waHref} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-[1.5px] border-[#3e3248] text-purple bg-white shrink-0">Reply on WhatsApp</a>
                    )}
                  </div>
                )}
                {photoErr && (
                  <div className="mb-4 rounded-[12px] px-4 py-3 text-[13px] font-semibold border-[1.5px] bg-white" style={{ borderColor: SOLID.red, color: SOLID.red }}>
                    {photoErr}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  {([
                    ["Before delivery", o.prepPhoto, "Nothing yet — add the bouquet before it leaves.", "PREP"],
                    ["After delivery", o.deliveryPhoto, "Nothing yet — add the handover shot.", "DELIVERY"],
                  ] as const).map(([label, photo, empty, kind]) => {
                    const ph = photo as Order["prepPhoto"];
                    return (
                      <div key={label} className="border-[1.5px] border-[#3e3248] rounded-[14px] overflow-hidden bg-white">
                        <div className="px-3.5 pt-3 pb-2 text-[11.5px] font-bold flex items-center gap-1.5" style={{ color: ph ? SOLID.green : "#afa4b7" }}>
                          {ph && <Icon name="check" size={13} />} {label}
                        </div>
                        {ph ? (
                          <>
                            <div className="h-[170px] relative" style={{ background: ph.bg }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {ph.url && <img src={ph.url} alt={label} className="w-full h-full object-cover" />}
                              {ph.caption && <span className="absolute bottom-2 left-2 text-[11px] bg-white/90 text-purple px-2 py-0.5 rounded-full font-medium">{ph.caption}</span>}
                            </div>
                            <div className="px-3.5 py-2.5 text-[12px] font-medium text-body-soft flex items-center justify-between gap-2 flex-wrap">
                              <span>{ph.by} · {shortDate(ph.at)}, {clockTime(ph.at)}</span>
                              {ph.url && <a href={ph.url} target="_blank" rel="noreferrer" className="font-semibold underline">Open</a>}
                            </div>
                          </>
                        ) : (
                          <div className="h-[170px] grid place-items-center text-center px-4 bg-[#291f31]"><div>
                            <div className="w-10 h-10 rounded-full grid place-items-center mx-auto mb-2 bg-white text-purple border-[1.5px] border-[#3e3248]"><Icon name="photo" size={20} /></div>
                            <p className="text-[12px] font-semibold text-body-soft m-0">{empty}</p>
                          </div></div>
                        )}
                        <div className="px-3.5 pb-3.5 pt-1">
                          <label className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2.5 rounded-[10px] text-white cursor-pointer" style={{ background: SOLID.purple, opacity: uploading ? 0.5 : 1 }}>
                            <Icon name="photo" size={14} />
                            {uploading === kind ? "Uploading…" : ph ? "Replace photo" : "Add photo"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={Boolean(uploading)}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void uploadPhoto(kind, f);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/*  The switch the owner asked for: it decides whether these
                     photographs are SENT. Off is not a reason to stop taking
                     them — the shop keeps its own proof either way, which is
                     what the line under it says.  */}
                <div className="mt-5 border-[1.5px] border-[#3e3248] rounded-[14px] px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap bg-white">
                  <div className="text-[13.5px] font-semibold text-purple">Send these photos to the customer</div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void togglePhotoUpdates()}
                    aria-pressed={o.photoUpdates}
                    className="w-[52px] h-[30px] rounded-full p-[3px] shrink-0 disabled:opacity-50"
                    style={{ background: o.photoUpdates ? SOLID.green : "#2c1e38" }}
                  >
                    <span className="block w-[24px] h-[24px] rounded-full bg-white transition-transform" style={{ transform: o.photoUpdates ? "translateX(22px)" : "none" }} />
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* PAYMENT */}
          {sec === "payment" && (
            <Card title="Payment" hint="Gateway = SSLCommerz. The ledger entry itself is owned by Finance.">
              <div className="px-5 pb-5">
                <Row k="Method" v={o.payment.method === "online" ? "Online (SSLCommerz)" : "Cash on delivery"} />
                <Row k="Status" v={<Pill colour={paymentColour(o)}>{pm.label}</Pill>} />
                <Row k="Order total" v={formatTaka(o.totalPaisa)} />
                <Row k="Paid" v={formatTaka(paidNet)} />
                {due > 0 && <Row k={o.payment.method === "cod" ? "Collect on delivery" : "To charge"} v={<span style={{ color: SOLID.red }}>{formatTaka(due)}</span>} />}
                {o.payment.refundPaisa > 0 && <Row k="Refunded" v={<span style={{ color: SOLID.red }}>{formatTaka(o.payment.refundPaisa)}</span>} />}
                {/* record money in / out — cash collection lives here */}
                {!cancelled && (
                  <div className="mt-4 rounded-[12px] border-[1.5px] border-[#3e3248] p-4 bg-white">
                    <div className="text-[11.5px] font-bold mb-2.5 text-purple">Record a payment</div>
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
                          if (amt <= 0) { setActErr("Type how much first."); return; }
                          act(() => addOrderPayment(id, { kind: payKind, amountPaisa: amt }).then(() => setPayAmt(0)));
                        }}
                        className="h-[42px] px-4 rounded-[11px] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                        style={{ background: payKind === "REFUND" ? SOLID.red : SOLID.green }}
                      >
                        <Icon name="cash" size={15} /> Record
                      </button>
                    </div>
                    {due > 0 && <p className="text-[12px] font-medium text-body-soft mt-2 mb-0">Empty amount = the full due, {formatTaka(due)}.</p>}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {codClosed && <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-semibold border-[1.5px] bg-white" style={{ borderColor: SOLID.amber, color: "#f7b86e" }}>{codClosed}</div>}
                  {o.isGift && <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-semibold border-[1.5px] bg-white" style={{ borderColor: SOLID.orchid, color: SOLID.purple }}>Gift order — cash on delivery is never offered.</div>}
                </div>
              </div>
            </Card>
          )}

          {/* MESSAGES — every SMS / email / WhatsApp about this order, and why one did not go */}
          {sec === "activity" && <OrderMessagesPanel orderId={o.id} />}

          {/* ACTIVITY */}
          {sec === "activity" && (
            <Card title="Activity log" hint="Who, when and what — written automatically, never editable.">
              <div className="px-5 pb-5">
                {o.timeline.length === 0 ? <p className="text-[13px] font-medium text-body-soft m-0">No activity recorded yet.</p> : (
                  <div className="flex flex-col">
                    {o.timeline.map((e, i, arr) => {
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: KIND_COLOUR[e.kind] ?? SOLID.purple }} />
                            {i < arr.length - 1 && <span className="w-px flex-1 bg-lavender-deep my-1" />}
                          </div>
                          <div className="pb-4">
                            <div className="text-[13.5px] font-semibold text-body">{e.label}</div>
                            <div className="text-[12.5px] font-medium text-body-soft">{e.actor} · {shortDate(e.at)}, {clockTime(e.at)}</div>
                            {e.note && <div className="text-[12.5px] font-medium text-body-soft mt-0.5">{e.note}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* live preview */}
        <aside className="w-[280px] shrink-0 sticky top-4 hidden xl:block">
          <div className="bg-white border-[1.5px] border-[#3e3248] rounded-[16px] overflow-hidden">
            <div className="px-5 pt-5 pb-6 text-white" style={{ background: "linear-gradient(150deg,#470066,#cf43ea)" }}>
              <div className="text-[11px] font-medium opacity-85">Customer sees</div>
              <div className="font-semibold text-[15px] leading-tight mt-0.5">{cancelled ? "Order cancelled" : o.deliveryStatus === "delivered" ? "Delivered 🌸" : o.isGift ? "Your gift is on its way" : "Your order is on its way"}</div>
              <div className="text-[12px] opacity-85 mt-1">{o.isGift ? `For ${o.recipient?.name} · ` : ""}{o.etaLabel}</div>
            </div>
            <div className="p-4">
              {cancelled ? (
                <div className="text-[12.5px] font-semibold" style={{ color: SOLID.red }}>This order was cancelled. Any eligible refund has been issued.</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {JOURNEY.map((s, i) => {
                    const done = i < journeyIndex(o);
                    const now = i === journeyIndex(o);
                    return (
                      <div key={s} className="flex items-center gap-2 text-[12.5px]">
                        <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-white text-[10.5px] shrink-0" style={{ background: done ? SOLID.green : now ? SOLID.purple : "#2c1e38" }}>{done ? "✓" : ""}</span>
                        <span className={now ? "text-purple font-semibold" : done ? "text-body font-medium" : "text-body-soft font-medium"}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {o.prepPhoto && o.photoUpdates && !cancelled && <div className="mt-3 pt-3 border-t border-lavender-deep"><div className="text-[13px] text-body-soft mb-1.5">Photo update</div><div className="h-[70px] rounded-[10px]" style={{ background: o.prepPhoto.bg }} /></div>}
              {o.isGift && o.giftMessage && !cancelled && <div className="mt-3 pt-3 border-t border-lavender-deep text-[13px] text-body-soft italic">“{o.giftMessage}”</div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/*  The messages the system sent this customer about the order (owner, 8 Sep
    2026): which door each left by — SMS for a Bangladeshi number, email for a
    foreign one, WhatsApp last — and, when one failed, the provider's reason.
    A failed one can be retried from here.  */
const MSG_KIND: Record<string, string> = {
  ORDER_CONFIRMATION: "Order confirmation",
  ORDER_CONFIRMATION_COD: "Order confirmation (COD)",
  ORDER_OUT_FOR_DELIVERY: "Out for delivery",
  ORDER_DELIVERED: "Delivered",
  PAYMENT_FAILED: "Payment failed",
  REVIEW_REQUEST: "Review request",
  PHOTO_UPDATE: "Photo of the gift",
  DELIVERY_PHOTO: "Photo at the door",
};
const MSG_COLOUR: Record<ApiOrderMessage["status"], string> = { SENT: SOLID.green, FAILED: SOLID.amber, SKIPPED: SOLID.grey, QUEUED: SOLID.blue };

function OrderMessagesPanel({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<ApiOrderMessage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => orderMessagesFor(orderId).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function retry(id: string) {
    setBusy(id);
    try { await retryOrderMessage(id); await load(); } finally { setBusy(null); }
  }

  const failed = (rows ?? []).filter((m) => m.status === "FAILED").length;
  return (
    <Card title="Messages to the customer" count={rows?.length}
      hint={`SMS for a Bangladeshi number, email for a foreign one, WhatsApp last. A failed one says why, and can be sent again.${failed ? ` ${failed} failed.` : ""}`}>
      <div className="px-5 pb-5">
        {!rows ? <p className="text-[13px] font-medium text-body-soft m-0">Loading…</p>
          : rows.length === 0 ? <p className="text-[13px] font-medium text-body-soft m-0">Nothing sent yet.</p> : (
          <div className="flex flex-col gap-2.5">
            {rows.map((m) => {
              return (
                <div key={m.id} className="flex items-start gap-3 rounded-[12px] border-[1.5px] border-[#3e3248] bg-white px-3.5 py-2.5">
                  <Pill colour={MSG_COLOUR[m.status]}>{m.status}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-body font-semibold">
                      {MSG_KIND[m.kind] ?? m.kind}
                      {m.attempt > 1 && <span className="text-body-soft font-normal"> · attempt {m.attempt}</span>}
                      <span className="text-body-soft font-normal"> · via {m.channel}</span>
                    </div>
                    <div className="text-[12.5px] text-body-soft">
                      {m.sentAt ? `sent ${shortDate(Date.parse(m.sentAt))}, ${clockTime(Date.parse(m.sentAt))}` : `due ${shortDate(Date.parse(m.dueAt))}, ${clockTime(Date.parse(m.dueAt))}`}
                    </div>
                    {m.error && <div className="text-[12.5px] font-medium mt-0.5" style={{ color: "#f7b86e" }}>{m.error}</div>}
                  </div>
                  {(m.status === "FAILED" || m.status === "SKIPPED") && (
                    <button type="button" disabled={busy === m.id} onClick={() => retry(m.id)}
                      className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-purple text-white shrink-0 disabled:opacity-50">
                      {busy === m.id ? "Sending…" : "Send again"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

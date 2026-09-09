"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listOrders,
  orderAction,
  orderShareText,
  orderContactPhone,
  SALES_STATUS_META,
  DELIVERY_STATUS_META,
  paymentLabel,
  zoneLabel,
  formatTaka,
  type ApiOrder,
} from "../_data/api";

/*
  All orders — the grid the owner chose on 9 Sep 2026 (design/orders-grid-looks.html,
  look 5 for the body, look B for the top).

  THE SHAPE, AND WHY
  - Top: a deep-purple band carries the title, the one button and the five
    numbers. Colour is spent once, here, so the work below can be white.
  - Body: a real grid — eight cells per order, a line between every cell,
    every fact in the cell it belongs to. The owner's old panel worked this
    way and his staff know where to look; the pastel cards it replaced made
    them read every row.
  - The customer's NAME is the anchor of a row (display face, largest thing
    on the line). Staff talk about orders by the person, not the number.
  - Action = three labelled buttons, never icons alone: Open · the ONE next
    step (Confirm -> Start preparing -> Out for delivery -> Mark delivered) ·
    Call. A finished or cancelled order shows only what still makes sense.
  - No loose prose anywhere on the screen. The explanation lives behind the i.
*/

/* ---------- solid pills: one colour per state, read across the room ---------- */
const SOLID = {
  orchid: "#cf43ea",
  indigo: "#4f46e5",
  green: "#0e8a44",
  amber: "#d97706",
  red: "#d92d20",
  blue: "#1d7fd6",
  purple: "#470066",
  grey: "#8d7f98",
};
const SALES_COLOUR: Record<ApiOrder["salesStatus"], string> = {
  placed: SOLID.orchid,
  confirmed: SOLID.indigo,
  completed: SOLID.green,
  cancelled: SOLID.red,
};
const DELIVERY_COLOUR: Record<ApiOrder["deliveryStatus"], string> = {
  unassigned: SOLID.grey,
  preparing: SOLID.amber,
  out_for_delivery: SOLID.blue,
  delivered: SOLID.green,
  failed: SOLID.red,
  stock_reverted: SOLID.purple,
};
function paymentColour(o: ApiOrder): string {
  switch (o.paymentStatus) {
    case "paid":
    case "cod_collected":
      return SOLID.green;
    case "advance_paid":
      return SOLID.indigo;
    case "partially_refunded":
      return SOLID.purple;
    case "refunded":
      return SOLID.red;
    default:
      return o.paymentMethod === "cod" ? SOLID.amber : SOLID.red;
  }
}

function Pill({ colour, outline, children }: { colour: string; outline?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap leading-none"
      style={outline ? { color: colour, border: `1.5px solid ${colour}`, background: "#fff" } : { background: colour, color: "#fff" }}
    >
      {children}
    </span>
  );
}

function Tag({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold tracking-[0.06em] px-1.5 py-[2px] rounded-[5px] text-white leading-none" style={{ background: colour }}>
      {children}
    </span>
  );
}

/* ---------- dates ---------- */
const DAY = 86_400_000;
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** "9 Sep 26, 5:51 PM" */
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}
/** the delivery day the way staff say it: Today · Tomorrow · 12 Sep */
function fmtDay(v?: string | null): { label: string; today: boolean } | null {
  if (!v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return { label: v, today: false };
  const diff = Math.round((startOfDay(ms) - startOfDay(Date.now())) / DAY);
  if (diff === 0) return { label: "Today", today: true };
  if (diff === 1) return { label: "Tomorrow", today: false };
  if (diff === -1) return { label: "Yesterday", today: false };
  return { label: new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), today: false };
}

/* ---------- the one next step ---------- */
type NextAction = Parameters<typeof orderAction>[1];
type Next = { label: string; action: NextAction; colour: string; icon: string } | null;
function nextStep(o: ApiOrder): Next {
  if (o.salesStatus === "cancelled" || o.salesStatus === "completed") return null;
  if (o.salesStatus === "placed") return { label: "Confirm", action: "confirm", colour: SOLID.green, icon: "check" };
  switch (o.deliveryStatus) {
    case "unassigned":
      return { label: "Start preparing", action: "prepare", colour: SOLID.amber, icon: "bolt" };
    case "preparing":
      return { label: "Out for delivery", action: "out-for-delivery", colour: SOLID.blue, icon: "truck" };
    case "out_for_delivery":
      return { label: "Mark delivered", action: "delivered", colour: SOLID.green, icon: "check" };
    default:
      return null;
  }
}

const CELL = "px-3 py-3 align-top border-b border-r border-[#dfd3ea] last:border-r-0";
const LABEL = "block text-[11px] font-semibold text-[#7b6b87] leading-tight";
const MONEY_LABEL = "inline-block w-[46px] text-[11px] font-semibold text-[#7b6b87]";
const ICON_BTN = "w-[22px] h-[22px] rounded-[6px] border border-[#dfd3ea] grid place-items-center text-body-soft hover:text-purple hover:border-purple bg-white";
const ACT = "h-[34px] rounded-[9px] px-3 inline-flex items-center gap-2 text-[12.5px] font-semibold";

function copy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked — nothing to do */
  }
}

function Row({ o, onChanged }: { o: ApiOrder; onChanged: () => void }) {
  const say = useSay();
  const [busy, setBusy] = useState(false);
  const name = o.customer?.name ?? o.senderName;
  const count = o.customer?.ordersCount ?? 0;
  const day = fmtDay(o.date);
  const cancelled = o.salesStatus === "cancelled";
  const live = !cancelled && o.deliveryStatus !== "delivered";
  const hot = live && !!day?.today;
  const next = nextStep(o);
  const phone = orderContactPhone(o);
  const share = orderShareText(o);
  const wa = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(share)}`;
  const showDelivery = ["preparing", "out_for_delivery", "delivered", "failed"].includes(o.deliveryStatus);
  const second = o.deliveryStatus === "delivered" ? "Delivered" : "Deliver";
  const when = [day?.label, o.slotLabel || o.etaLabel].filter(Boolean).join(" · ");

  async function run() {
    if (!next) return;
    setBusy(true);
    try {
      await orderAction(o.id, next.action);
      onChanged();
    } catch (e) {
      say.fromError(e, `Could not ${next.label.toLowerCase()} ${o.orderNo}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[#fcfaff]">
      <td className={`${CELL} w-[34px]`} style={hot ? { boxShadow: `inset 4px 0 0 ${SOLID.red}` } : undefined}>
        <Said say={say} />
        <input type="checkbox" className="w-4 h-4 accent-purple mt-0.5" aria-label={`Select ${o.orderNo}`} />
      </td>

      {/* order no */}
      <td className={`${CELL} w-[122px]`}>
        <Link href={`/orders/${o.id}`} className="font-bold text-[15px] text-purple whitespace-nowrap hover:underline">
          {o.orderNo}
        </Link>
        <div className="flex gap-1.5 mt-1.5">
          <button type="button" title="Copy details" className={ICON_BTN} onClick={() => copy(share)}>
            <Icon name="copy" size={11} />
          </button>
          <a href={wa} target="_blank" rel="noreferrer" title="Send on WhatsApp" className={ICON_BTN}>
            <Icon name="phone" size={11} />
          </a>
          {!cancelled && o.salesStatus !== "completed" && (
            <Link href={`/orders/${o.id}/edit`} title="Edit" className={ICON_BTN}>
              <Icon name="edit" size={11} />
            </Link>
          )}
        </div>
      </td>

      {/* date */}
      <td className={`${CELL} w-[172px]`}>
        <span className={LABEL}>Placed</span>
        <b className="block text-[12.5px] font-semibold text-body mb-1.5">{fmtStamp(o.placedAt)}</b>
        {when && !cancelled && (
          <>
            <span className={LABEL}>{second}</span>
            <b className="block text-[12.5px] font-semibold" style={{ color: hot ? SOLID.red : undefined }}>{when}</b>
          </>
        )}
      </td>

      {/* customer */}
      <td className={CELL}>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/orders/${o.id}`} className="font-semibold text-[15px] leading-tight text-purple hover:underline">
            {name}
          </Link>
          {count <= 1 ? <Tag colour={SOLID.blue}>NEW</Tag> : <Tag colour={SOLID.green}>REPEAT · {count}</Tag>}
          {o.isGift && <Tag colour={SOLID.orchid}>GIFT</Tag>}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[14px] font-semibold text-purple">
          {o.senderPhone}
          <button type="button" title="Copy phone" className="text-body-soft hover:text-purple" onClick={() => copy(o.senderPhone)}>
            <Icon name="copy" size={11} />
          </button>
        </div>
        {o.isGift && o.recipientName && (
          <div className="text-[12.5px] font-medium text-body-soft mt-1">
            To <b className="font-semibold text-body">{o.recipientName}</b>
            {o.recipientPhone ? ` · ${o.recipientPhone}` : ""}
          </div>
        )}
        <div className="text-[12.5px] font-medium text-body-soft mt-1 leading-snug">{o.address}</div>
      </td>

      {/* total */}
      <td className={`${CELL} w-[132px] whitespace-nowrap`}>
        <div className="leading-[1.55]">
          <span className={MONEY_LABEL}>Total</span>
          <b className="font-semibold text-[15px] text-body">{formatTaka(o.totalPaisa)}</b>
        </div>
        <div className="leading-[1.55]">
          <span className={MONEY_LABEL}>Paid</span>
          <b className="font-semibold text-[13.5px]" style={{ color: o.paidPaisa > 0 ? SOLID.green : SOLID.grey }}>{formatTaka(o.paidPaisa)}</b>
        </div>
        <div className="leading-[1.55]">
          <span className={MONEY_LABEL}>Due</span>
          <b className="font-semibold text-[13.5px]" style={{ color: o.duePaisa > 0 && !cancelled ? SOLID.red : SOLID.grey }}>
            {formatTaka(cancelled ? 0 : o.duePaisa)}
          </b>
        </div>
      </td>

      {/* status */}
      <td className={`${CELL} w-[150px]`}>
        <div className="flex flex-col items-start gap-1.5">
          <Pill colour={SALES_COLOUR[o.salesStatus]} outline={cancelled}>{SALES_STATUS_META[o.salesStatus].label}</Pill>
          {cancelled ? (
            <Pill colour={SOLID.grey} outline>—</Pill>
          ) : (
            <Pill colour={paymentColour(o)}>{paymentLabel(o.paymentStatus, o.paymentMethod)}</Pill>
          )}
        </div>
      </td>

      {/* delivery */}
      <td className={`${CELL} w-[166px]`}>
        <b className="block text-[13px] font-semibold text-body whitespace-nowrap">{o.methodLabel || "—"}</b>
        <span className="block text-[12px] font-medium text-[#7b6b87] mt-0.5 whitespace-nowrap">
          {zoneLabel(o.zone)} · {o.channel?.name ?? "Website"}
        </span>
        {showDelivery && (
          <div className="mt-1.5">
            <Pill colour={DELIVERY_COLOUR[o.deliveryStatus]}>{DELIVERY_STATUS_META[o.deliveryStatus].label}</Pill>
          </div>
        )}
      </td>

      {/* action */}
      <td className={`${CELL} w-[158px]`}>
        <div className="flex flex-col gap-1.5">
          <Link href={`/orders/${o.id}`} className={`${ACT} text-white bg-purple hover:bg-purple-deep`}>
            <Icon name="eye" size={14} /> Open
          </Link>
          {next && (
            <button type="button" disabled={busy} onClick={run} className={`${ACT} text-white disabled:opacity-60`} style={{ background: next.colour }}>
              <Icon name={next.icon} size={14} /> {busy ? "…" : next.label}
            </button>
          )}
          {!cancelled && (
            <a href={`tel:${phone}`} className={`${ACT} bg-white border-[1.5px]`} style={{ color: SOLID.green, borderColor: SOLID.green }}>
              <Icon name="phone" size={14} /> Call
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ---------- the band on top: title, one button, five numbers ---------- */
interface Stats {
  action: number;
  fulfilling: number;
  delivered: number;
  revenue: number;
  toCollect: number;
}
function Band({ loading, s }: { loading: boolean; s: Stats }) {
  const tiles: { label: string; value: string; hot?: boolean; href?: string }[] = [
    { label: "Needs action", value: String(s.action), hot: s.action > 0, href: "/orders/action" },
    { label: "Preparing / out", value: String(s.fulfilling), href: "/orders/scheduled" },
    { label: "Delivered", value: String(s.delivered) },
    { label: "Revenue", value: formatTaka(s.revenue), href: "/orders/reports" },
    { label: "To collect", value: formatTaka(s.toCollect), href: "/orders/payments" },
  ];
  const tile = "block rounded-[14px] px-4 py-3.5 border border-white/15 bg-white/[0.08]";
  return (
    <div className="rounded-[20px] px-6 pt-5 pb-6 mb-4 text-white" style={{ background: "linear-gradient(135deg,#320049 0%,#5a0a80 100%)" }}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display font-semibold text-[24px] leading-none m-0 inline-flex items-center gap-2.5 text-white">
          All orders
          <span
            className="w-5 h-5 rounded-full border border-white/40 text-[11px] font-semibold grid place-items-center font-ui cursor-help"
            title="Every website, Facebook, Instagram, WhatsApp and phone order. Walk-in POS is a separate module. Revenue counts delivered orders only; To collect is every unpaid balance on an open order."
          >
            i
          </span>
        </h1>
        <Link href="/orders/new" className="bg-white text-purple text-[14px] font-semibold px-5 py-2.5 rounded-[12px] inline-flex items-center gap-2 hover:bg-lavender">
          <Icon name="plus" size={17} /> New order
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="block text-[11.5px] font-medium text-[#d9c5e6]">{t.label}</span>
              <span className="block font-semibold text-[24px] leading-none mt-2" style={{ color: t.hot ? "#ffb4ad" : "#fff" }}>
                {loading ? "…" : t.value}
              </span>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className={`${tile} hover:bg-white/[0.14]`}>{inner}</Link>
          ) : (
            <div key={t.label} className={tile}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

const SEGS: [string, string][] = [
  ["", "All"],
  ["placed", "Needs action"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];
const HEADS = ["", "Order No", "Date", "Customer", "Total", "Status", "Delivery", "Action"];

export default function OrderListView() {
  const [all, setAll] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sales, setSales] = useState("");
  const [type, setType] = useState("");
  const [pay, setPay] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listOrders();
      setAll(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    let action = 0, fulfilling = 0, delivered = 0, revenue = 0, toCollect = 0;
    const bySales: Record<string, number> = {};
    for (const o of all) {
      bySales[o.salesStatus] = (bySales[o.salesStatus] ?? 0) + 1;
      if (o.salesStatus === "placed") action++;
      if (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery") fulfilling++;
      if (o.deliveryStatus === "delivered") { delivered++; revenue += o.totalPaisa; }
      if (o.duePaisa > 0 && o.salesStatus !== "cancelled") toCollect += o.duePaisa;
    }
    return { action, fulfilling, delivered, revenue, toCollect, bySales };
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((o) => {
      const name = (o.customer?.name ?? o.senderName).toLowerCase();
      const okQ =
        !needle ||
        o.orderNo.toLowerCase().includes(needle) ||
        name.includes(needle) ||
        o.senderPhone.includes(needle) ||
        (o.recipientName ?? "").toLowerCase().includes(needle) ||
        (o.recipientPhone ?? "").includes(needle) ||
        o.address.toLowerCase().includes(needle);
      const okSales = !sales || o.salesStatus === sales;
      const okType = !type || (type === "gift" ? o.isGift : !o.isGift);
      const okPay = !pay || o.paymentMethod === pay;
      return okQ && okSales && okType && okPay;
    });
  }, [all, q, sales, type, pay]);

  return (
    <div className={WRAP}>
      <Band loading={loading} s={stats} />

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <div className="inline-flex bg-white border-[1.5px] border-[#dfd3ea] rounded-[12px] p-1 gap-0.5">
          {SEGS.map(([val, label]) => {
            const on = sales === val;
            const n = val ? stats.bySales[val] ?? 0 : all.length;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSales(val)}
                className={`px-3.5 py-2 rounded-[9px] text-[13px] font-semibold inline-flex items-center gap-1.5 ${on ? "bg-purple text-white" : "text-body-soft hover:text-purple"}`}
              >
                {label}
                {!loading && (val === "" || val === "placed") && (
                  <em className={`not-italic text-[11px] px-1.5 py-[1px] rounded-full ${on ? "bg-white/20" : "bg-lavender-deep"}`}>{n}</em>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={17} />
          </span>
          <input className="ipt ipt-icon h-[42px] font-medium" placeholder="Order no, name, phone, recipient, address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[150px] h-[42px] font-semibold" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Self &amp; gift</option>
          <option value="self">Self only</option>
          <option value="gift">Gift only</option>
        </select>
        <select className="ipt max-w-[160px] h-[42px] font-semibold" value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="">All payments</option>
          <option value="online">Online</option>
          <option value="cod">Cash on delivery</option>
        </select>
        <span className="text-[13px] font-semibold text-body-soft">{loading ? "…" : `${rows.length} order${rows.length === 1 ? "" : "s"}`}</span>
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className="bg-white border-[1.5px] border-[#dfd3ea] rounded-[14px] overflow-x-auto">
        <table className="w-full border-collapse text-[13px] min-w-[1080px]">
          <thead>
            <tr>
              {HEADS.map((h, i) => (
                <th
                  key={h || "select"}
                  className="text-left bg-lavender text-purple font-semibold text-[12px] tracking-[0.04em] uppercase px-3 py-2.5 border-b-[1.5px] border-r border-[#dfd3ea] last:border-r-0"
                >
                  {i === 0 ? <input type="checkbox" className="w-4 h-4 accent-purple" aria-label="Select all" /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <Row key={o.id} o={o} onChanged={load} />
            ))}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <span className="w-11 h-11 rounded-full grid place-items-center mx-auto mb-2 bg-lavender text-purple">
              <Icon name="search" size={20} />
            </span>
            <p className="text-[13.5px] font-medium text-body-soft m-0">No orders match.</p>
          </div>
        )}
      </div>
    </div>
  );
}

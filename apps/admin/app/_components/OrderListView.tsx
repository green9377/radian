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
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, ICON_BTN, TABLE_WRAP, TABLE,
  Pill, Tag, ActButton, Band, BandButton, Segs, Search, Count, Head, Empty,
  fmtStamp, fmtDay, copy, CopyIcon, type Tile,
} from "./OrdersUi";

/*
  All orders — the grid the owner chose on 9 Sep 2026 (design/orders-grid-looks.html
  look 5 + look B), cleaned up to design/orders-module-v4.html the same day.

  - Eight cells per order, every fact in the cell it belongs to. Names, order
    numbers and money are the same 13px as everything else — weight 500 is
    the only emphasis. One hairline between rows, none between columns.
  - The band's five tiles: three filter THIS page (Needs action, Preparing /
    out, Delivered today); Revenue opens Reports, To collect opens Payments.
    Nothing links to a page that is not in the Orders menu.
  - Cancelled orders live here, under their own segment. There is no
    separate Cancelled page any more.
  - Action = labelled buttons, never icons alone: Open · the ONE next step ·
    Call. A finished or cancelled order shows only what still makes sense.
*/

const SALES_COLOUR: Record<ApiOrder["salesStatus"], string> = {
  placed: SOLID.amber,
  confirmed: SOLID.indigo,
  completed: SOLID.green,
  cancelled: SOLID.red,
};
const DELIVERY_COLOUR: Record<ApiOrder["deliveryStatus"], string> = {
  unassigned: SOLID.grey,
  preparing: SOLID.blue,
  out_for_delivery: SOLID.orchid,
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
      return SOLID.amber;
    case "partially_refunded":
    case "refunded":
      return SOLID.grey;
    default:
      return o.paymentMethod === "cod" ? SOLID.purple : SOLID.red;
  }
}

/* ---------- the one next step ---------- */
type NextAction = Parameters<typeof orderAction>[1];
type Next = { label: string; action: NextAction; colour: string; icon: string } | null;
function nextStep(o: ApiOrder): Next {
  if (o.salesStatus === "cancelled" || o.salesStatus === "completed") return null;
  if (o.salesStatus === "placed") return { label: "Confirm", action: "confirm", colour: SOLID.indigo, icon: "check" };
  switch (o.deliveryStatus) {
    case "unassigned":
      return { label: "Start preparing", action: "prepare", colour: SOLID.blue, icon: "bolt" };
    case "preparing":
      return { label: "Out for delivery", action: "out-for-delivery", colour: SOLID.orchid, icon: "truck" };
    case "out_for_delivery":
      return { label: "Mark delivered", action: "delivered", colour: SOLID.green, icon: "check" };
    default:
      return null;
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
  const refunded = o.paymentStatus === "refunded" || o.paymentStatus === "partially_refunded";

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
    <tr className="hover:bg-[#231538]">
      <td className={`${CELL} w-[34px]`} style={hot ? { boxShadow: `inset 4px 0 0 ${SOLID.red}` } : undefined}>
        <Said say={say} />
        <input type="checkbox" className="w-[15px] h-[15px] accent-purple mt-0.5" aria-label={`Select ${o.orderNo}`} />
      </td>

      {/* order no */}
      <td className={`${CELL} w-[118px]`}>
        <Link href={`/orders/${o.id}`} className={NO}>{o.orderNo}</Link>
        <div className="flex gap-1.5 mt-2">
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
      <td className={`${CELL} w-[176px]`}>
        <span className={LABEL}>Placed</span>
        <span className={`${VALUE} mb-1.5`}>{fmtStamp(o.placedAt)}</span>
        {cancelled ? null : when ? (
          <>
            <span className={LABEL}>{second}</span>
            <span className={VALUE} style={hot ? { color: SOLID.red } : undefined}>{when}</span>
          </>
        ) : null}
      </td>

      {/* customer */}
      <td className={CELL}>
        <div className="flex items-center flex-wrap">
          <Link href={`/orders/${o.id}`} className={NAME}>{name}</Link>
          {count <= 1 ? <Tag colour={SOLID.blue}>NEW</Tag> : <Tag colour={SOLID.green}>REPEAT · {count}</Tag>}
          {o.isGift && <Tag colour={SOLID.orchid}>GIFT</Tag>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 font-medium text-body">
          {o.senderPhone}
          <CopyIcon text={o.senderPhone} title="Copy phone" />
        </div>
        {o.isGift && o.recipientName && (
          <div className={`${SOFT} mt-0.5`}>
            To <span className="text-body">{o.recipientName}</span>
            {o.recipientPhone ? ` · ${o.recipientPhone}` : ""}
          </div>
        )}
        <div className={`${SOFT} mt-0.5`}>{o.address}</div>
      </td>

      {/* total */}
      <td className={`${CELL} w-[136px] whitespace-nowrap`}>
        <div className="grid grid-cols-[40px_1fr] gap-x-1.5 gap-y-[3px]">
          <span className="text-[11px] font-medium text-[#afa4b7] leading-[1.5]">Total</span>
          <span className="font-medium text-body">{formatTaka(o.totalPaisa)}</span>
          <span className="text-[11px] font-medium text-[#afa4b7] leading-[1.5]">Paid</span>
          <span className="font-medium" style={{ color: o.paidPaisa > 0 ? SOLID.green : SOLID.grey }}>{formatTaka(o.paidPaisa)}</span>
          <span className="text-[11px] font-medium text-[#afa4b7] leading-[1.5]">{refunded ? "Refund" : "Due"}</span>
          {refunded ? (
            <span className="font-medium" style={{ color: SOLID.grey }}>{formatTaka(o.refundPaisa)}</span>
          ) : (
            <span className="font-medium" style={{ color: o.duePaisa > 0 && !cancelled ? SOLID.red : SOLID.grey }}>{formatTaka(cancelled ? 0 : o.duePaisa)}</span>
          )}
        </div>
      </td>

      {/* status */}
      <td className={`${CELL} w-[150px]`}>
        <div className="flex flex-col items-start gap-1.5">
          <Pill colour={SALES_COLOUR[o.salesStatus]}>{SALES_STATUS_META[o.salesStatus].label}</Pill>
          {cancelled && !refunded ? null : <Pill colour={paymentColour(o)}>{paymentLabel(o.paymentStatus, o.paymentMethod)}</Pill>}
        </div>
      </td>

      {/* delivery */}
      <td className={`${CELL} w-[160px]`}>
        <span className={`${VALUE} whitespace-nowrap`}>{o.methodLabel || "—"}</span>
        <span className={`block ${SOFT} whitespace-nowrap`}>
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
          <ActButton kind="primary" href={`/orders/${o.id}`}>Open</ActButton>
          {next && (
            <ActButton kind="solid" colour={next.colour} onClick={run} disabled={busy}>
              {busy ? "…" : next.label}
            </ActButton>
          )}
          {!cancelled && <ActButton kind="call" href={`tel:${phone}`} external>Call</ActButton>}
        </div>
      </td>
    </tr>
  );
}

type Seg = "" | "placed" | "fulfilling" | "confirmed" | "delivered" | "due" | "cancelled";
const SEGS: [Seg, string][] = [
  ["", "All"],
  ["placed", "Needs action"],
  ["fulfilling", "Preparing / out"],
  ["confirmed", "Confirmed"],
  ["delivered", "Delivered"],
  ["due", "To collect"],
  ["cancelled", "Cancelled"],
];
function inSeg(o: ApiOrder, s: Seg): boolean {
  switch (s) {
    case "":
      return true;
    case "placed":
      return o.salesStatus === "placed";
    case "fulfilling":
      return o.salesStatus !== "cancelled" && (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery");
    case "confirmed":
      return o.salesStatus === "confirmed" && o.deliveryStatus === "unassigned";
    case "delivered":
      return o.deliveryStatus === "delivered";
    case "due":
      return o.duePaisa > 0 && o.salesStatus !== "cancelled";
    case "cancelled":
      return o.salesStatus === "cancelled";
  }
}
const HEADS = ["", "Order No", "Date", "Customer", "Total", "Status", "Delivery", "Action"];

const HELP =
  "Every website, Facebook, Instagram, WhatsApp and phone order, cancelled ones included. Walk-in POS is a separate module. " +
  "Needs action = placed and not yet confirmed. Preparing / out = being made or on the road. Revenue counts delivered orders only; " +
  "To collect is every unpaid balance on an open order. Every tile filters this page — Revenue shows the delivered orders it is counted from, To collect the orders still owing.";

export default function OrderListView() {
  const [all, setAll] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Seg>("");
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
    let revenue = 0, toCollect = 0, deliveredToday = 0, out = 0;
    const counts: Record<Seg, number> = { "": all.length, placed: 0, fulfilling: 0, confirmed: 0, delivered: 0, due: 0, cancelled: 0 };
    for (const o of all) {
      for (const [k] of SEGS) if (k && inSeg(o, k)) counts[k]++;
      if (o.deliveryStatus === "out_for_delivery" && o.salesStatus !== "cancelled") out++;
      if (o.deliveryStatus === "delivered") {
        revenue += o.totalPaisa;
        if (fmtDay(o.date)?.today) deliveredToday++;
      }
      if (o.duePaisa > 0 && o.salesStatus !== "cancelled") toCollect += o.duePaisa;
    }
    return { counts, revenue, toCollect, deliveredToday, out };
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
      const okType = !type || (type === "gift" ? o.isGift : !o.isGift);
      const okPay = !pay || o.paymentMethod === pay;
      return okQ && inSeg(o, seg) && okType && okPay;
    });
  }, [all, q, seg, type, pay]);

  const v = (s: string) => (loading ? "…" : s);
  const tiles: Tile[] = [
    { key: "placed", label: "Needs action", value: v(String(stats.counts.placed)), sub: "placed, not confirmed", hot: stats.counts.placed > 0 },
    { key: "fulfilling", label: "Preparing / out", value: v(String(stats.counts.fulfilling)), sub: `${stats.out} out for delivery` },
    { key: "delivered", label: "Delivered", value: v(String(stats.counts.delivered)), sub: `${stats.deliveredToday} today` },
    { key: "revenue", label: "Revenue", value: v(formatTaka(stats.revenue)), sub: "delivered orders only" },
    { key: "due", label: "To collect", value: v(formatTaka(stats.toCollect)), sub: `${stats.counts.due} orders still owing` },
  ];

  return (
    <div className={WRAP}>
      <Band
        title="All orders"
        help={HELP}
        right={<BandButton href="/orders/new" icon="plus">New order</BandButton>}
        tiles={tiles}
        active={seg === "delivered" ? "delivered" : seg || undefined}
        onTile={(k) => { const key = (k === "revenue" ? "delivered" : k) as Seg; setSeg(seg === key ? "" : key); }}
      />

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <Segs items={SEGS} value={seg} counts={loading ? undefined : stats.counts} onChange={setSeg} />
        <Search value={q} onChange={setQ} placeholder="Order no, name, phone, recipient, address" />
        <select className="ipt max-w-[150px] h-[40px] font-medium" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Self &amp; gift</option>
          <option value="self">Self only</option>
          <option value="gift">Gift only</option>
        </select>
        <select className="ipt max-w-[170px] h-[40px] font-medium" value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="">All payments</option>
          <option value="online">Online</option>
          <option value="cod">Cash on delivery</option>
        </select>
        <Count n={rows.length} noun="order" loading={loading} />
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={HEADS} />
          <tbody>
            {rows.map((o) => (
              <Row key={o.id} o={o} onChanged={load} />
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <Empty text="No orders match." />}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listOrdersPage,
  orderStats,
  orderAction,
  orderShareText,
  orderContactPhone,
  SALES_STATUS_META,
  DELIVERY_STATUS_META,
  paymentLabel,
  zoneLabel,
  formatTaka,
  type ApiOrder,
  type ApiOrderStats,
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
/*
  ⚠️ THE LAST TWO STEPS ARE GONE FROM THIS ROW — audit 11 Sep 2026 #14.

  "Out for delivery" and "Mark delivered" called `POST /orders/:id/…` straight
  from here, and the API refused BOTH of them every single time: since R5 the
  order may not outrun its own delivery assignment, so those two transitions
  belong to the carrier path (`POST /delivery/assignments/:id/…`) and Sales
  answers "send it out from the Delivery panel". A button that has never once
  worked is worse than no button — staff press it, read a refusal they cannot
  act on from this screen, and learn to distrust the row.

  What is left are the two steps Sales genuinely owns: Confirm and Start
  preparing. Past that the row says where to go, and Open is the button.
*/
type NextAction = Parameters<typeof orderAction>[1];
type Next = { label: string; action: NextAction; colour: string; icon: string } | null;
function nextStep(o: ApiOrder): Next {
  if (o.salesStatus === "cancelled" || o.salesStatus === "completed") return null;
  if (o.salesStatus === "placed") return { label: "Confirm", action: "confirm", colour: SOLID.indigo, icon: "check" };
  if (o.deliveryStatus === "unassigned" && o.salesStatus === "confirmed")
    return { label: "Start preparing", action: "prepare", colour: SOLID.blue, icon: "bolt" };
  return null;
}
/** where the next step actually happens, when it is not this screen's to take */
function handOff(o: ApiOrder): string | null {
  if (o.salesStatus === "cancelled" || o.salesStatus === "completed") return null;
  if (o.deliveryStatus === "preparing") return "Delivery board";
  if (o.deliveryStatus === "out_for_delivery") return "Delivery board";
  if (o.deliveryStatus === "failed") return "Decide on the order";
  return null;
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
  const where = handOff(o);
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
      {/* order no */}
      <td className={`${CELL} w-[132px]`} style={hot ? { boxShadow: `inset 4px 0 0 ${SOLID.red}` } : undefined}>
        <Said say={say} />
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
          {/*  #14 — where the next step is taken, said rather than offered as a
               button that would only ever be refused  */}
          {!next && where && (
            <span className="text-[11.5px] font-medium text-[#afa4b7] leading-[1.3] px-1">
              Next step: {where}
            </span>
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
/*  `inSeg` LEFT THIS FILE (audit 11 Sep 2026). The six segments are
    `where` clauses on the server now — see `segWhere` in orders.service.ts.
    Two copies of "what counts as fulfilling" is how a tile and a table end up
    disagreeing about the same order.  */

/*  the select column is gone — the checkbox on every row did nothing at
    all, and there was no bulk action for it to do (audit 11 Sep 2026)  */
const HEADS = ["Order No", "Date", "Customer", "Total", "Status", "Delivery", "Action"];

const HELP =
  "Every website, Facebook, Instagram, WhatsApp and phone order, cancelled ones included. Walk-in POS is a separate module. " +
  "Needs action = placed and not yet confirmed. Preparing / out = being made or on the road. Revenue counts delivered orders only; " +
  "To collect is every unpaid balance on an open order. Delivered today counts by the time it was actually handed over. " +
  "Searching, filtering and every tile are counted in the database over all orders, not over this page.";

const PAGE_SIZE = 50;

export default function OrderListView() {
  /*
    ⚠️ THE HUNDRED-ROW WINDOW IS GONE — audit 11 Sep 2026.

    This screen used to fetch `pageSize=100` once and then do everything to
    that array in the browser: search, the six segments, self/gift, payment
    method, and the five band tiles. Under a hundred orders it was right by
    accident. Past it, an order from last month could not be found by typing
    its number, and Revenue and To collect reported a slice of the shop while
    looking exactly as healthy as the truth would.

    Every one of those is now a query parameter, and the tiles come from
    `GET /orders/stats` over the WHOLE filtered set. The only thing this
    component still decides is which page to ask for.
  */
  const [rows, setRows] = useState<ApiOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ApiOrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  /** the search box, debounced — one request per pause, not one per keystroke */
  const [needle, setNeedle] = useState("");
  const [seg, setSeg] = useState<Seg>("");
  const [type, setType] = useState("");
  const [pay, setPay] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  /** every filter, in the shape the API reads */
  const query = useMemo(
    () => ({
      q: needle || undefined,
      seg: seg || undefined,
      paymentMethod: (pay || undefined) as "online" | "cod" | undefined,
      isGift: type === "gift" ? true : type === "self" ? false : undefined,
    }),
    [needle, seg, pay, type],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, st] = await Promise.all([
        listOrdersPage({ ...query, page, pageSize: PAGE_SIZE }),
        orderStats(query),
      ]);
      setRows(res.rows);
      setTotal(res.total);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /*  changing a filter always goes back to page 1 — page 7 of a set that no
      longer has seven pages is an empty table with no explanation  */
  useEffect(() => {
    setPage(1);
  }, [query]);

  const counts: Partial<Record<Seg, number>> = stats
    ? {
        "": stats.counts.all,
        placed: stats.counts.placed,
        fulfilling: stats.counts.fulfilling,
        confirmed: stats.counts.confirmed,
        delivered: stats.counts.delivered,
        due: stats.counts.due,
        cancelled: stats.counts.cancelled,
      }
    : {};

  const v = (s: string) => (loading && !stats ? "…" : s);
  const tiles: Tile[] = [
    { key: "placed", label: "Needs action", value: v(String(stats?.counts.placed ?? 0)), sub: "placed, not confirmed", hot: (stats?.counts.placed ?? 0) > 0 },
    { key: "fulfilling", label: "Preparing / out", value: v(String(stats?.counts.fulfilling ?? 0)), sub: `${stats?.counts.outForDelivery ?? 0} out for delivery` },
    { key: "delivered", label: "Delivered", value: v(String(stats?.counts.delivered ?? 0)), sub: `${stats?.counts.deliveredToday ?? 0} handed over today` },
    { key: "revenue", label: "Revenue", value: v(formatTaka(stats?.revenuePaisa ?? 0)), sub: "delivered orders only" },
    { key: "due", label: "To collect", value: v(formatTaka(stats?.duePaisa ?? 0)), sub: `${stats?.dueOrders ?? 0} orders still owing` },
  ];

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);

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
        <Segs items={SEGS} value={seg} counts={stats ? counts : undefined} onChange={setSeg} />
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
        <Count n={total} noun="order" loading={loading} />
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

      {/*  Paging, said plainly: which orders these are out of how many. The
           old screen simply stopped at a hundred and said nothing at all.  */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <span className="text-[13px] font-medium text-body-soft">
            {first}–{last} of {total}
          </span>
          <div className="flex gap-2">
            <ActButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
              Previous
            </ActButton>
            <ActButton onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>
              Next
            </ActButton>
          </div>
        </div>
      )}
    </div>
  );
}

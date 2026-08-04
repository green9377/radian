"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, TONE, Stat, PageHead, Chip, ErrorBox, type Tone } from "./OrderViews";
import {
  listOrders,
  orderAction,
  orderShareText,
  orderContactPhone,
  SALES_STATUS_META,
  DELIVERY_STATUS_META,
  PAYMENT_STATUS_META,
  zoneLabel,
  formatTaka,
  ago,
  initials,
  genAvatar,
  type ApiOrder,
} from "../_data/api";

/*
  Orders list — real data from :4000 /orders.
  Colourful by design: tinted KPI cards, a status stripe on every row, gradient
  avatars, and quick filter pills so the answer to "what needs me?" is visible
  before you read a single word. POS is a separate module.
*/

/* the row stripe colour follows where the order actually is */
function rowTone(o: ApiOrder): Tone {
  if (o.salesStatus === "cancelled") return "rose";
  if (o.deliveryStatus === "delivered") return "green";
  if (o.salesStatus === "placed") return "amber";
  if (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery") return "blue";
  return "purple";
}

/* row menu — the small jobs you shouldn't have to open an order for */
function RowMenu({ o, onDone }: { o: ApiOrder; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = orderShareText(o);
  const phone = orderContactPhone(o);
  const wa = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  const mail = `mailto:${o.senderEmail ?? ""}?subject=${encodeURIComponent(`Radian order ${o.orderNo}`)}&body=${encodeURIComponent(text)}`;
  const item = "w-full text-left px-3 py-2 text-[12.5px] hover:bg-lavender/60 inline-flex items-center gap-2 border-b border-lavender-deep last:border-0";

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} title="More" className="w-[34px] h-[34px] grid place-items-center rounded-[9px] border bg-white text-body-soft hover:text-purple" style={{ borderColor: TONE.purple.border }}>
        <Icon name="grid" size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-[212px] bg-white border rounded-[12px] shadow-lift overflow-hidden" style={{ borderColor: TONE.purple.border }}>
            <Link href={`/orders/${o.id}`} className={item} style={{ color: TONE.purple.text }}><Icon name="bag" size={14} /> Open order</Link>
            <a href={`tel:${phone}`} className={item} style={{ color: TONE.green.text }}><Icon name="phone" size={14} /> Call {o.isGift ? "recipient" : "customer"}</a>
            <a href={wa} target="_blank" rel="noreferrer" className={item} style={{ color: TONE.green.text }}><Icon name="phone" size={14} /> Send on WhatsApp</a>
            <a href={mail} className={item} style={{ color: TONE.blue.text }}><Icon name="mail" size={14} /> Send by email</a>
            <button type="button" className={item} style={{ color: TONE.purple.text }} onClick={async () => { try { await navigator.clipboard.writeText(text); } catch {} setOpen(false); }}>
              <Icon name="copy" size={14} /> Copy details
            </button>
            {o.salesStatus === "placed" && (
              <button type="button" disabled={busy} className={item} style={{ color: TONE.green.text }}
                onClick={async () => { setBusy(true); try { await orderAction(o.id, "confirm"); onDone(); setOpen(false); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } }}>
                <Icon name="check" size={14} /> {busy ? "Confirming…" : "Confirm order"}
              </button>
            )}
            {!["cancelled", "completed"].includes(o.salesStatus) && (
              <Link href={`/orders/${o.id}/edit`} className={item} style={{ color: TONE.purple.text }}><Icon name="edit" size={14} /> Edit order</Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
    let action = 0, fulfilling = 0, delivered = 0, revenue = 0, codDue = 0;
    for (const o of all) {
      if (o.salesStatus === "placed") action++;
      if (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery") fulfilling++;
      if (o.deliveryStatus === "delivered") { delivered++; revenue += o.totalPaisa; }
      if (o.duePaisa > 0 && o.salesStatus !== "cancelled") codDue += o.duePaisa;
    }
    return { action, fulfilling, delivered, revenue, codDue };
  }, [all]);

  const rows = useMemo(() => {
    return all.filter((o) => {
      const name = (o.customer?.name ?? o.senderName).toLowerCase();
      const okQ =
        !q ||
        o.orderNo.toLowerCase().includes(q.toLowerCase()) ||
        name.includes(q.toLowerCase()) ||
        o.senderPhone.includes(q) ||
        (o.recipientName ?? "").toLowerCase().includes(q.toLowerCase());
      const okSales = !sales || o.salesStatus === sales;
      const okType = !type || (type === "gift" ? o.isGift : type === "self" ? !o.isGift : true);
      const okPay = !pay || o.paymentMethod === pay;
      return okQ && okSales && okType && okPay;
    });
  }, [all, q, sales, type, pay]);

  /* quick filter pills — one tap instead of hunting in a dropdown */
  const pills: [string, string, Tone][] = [
    ["", "All", "purple"],
    ["placed", "Needs action", "amber"],
    ["confirmed", "Confirmed", "blue"],
    ["completed", "Completed", "green"],
    ["cancelled", "Cancelled", "rose"],
  ];

  return (
    <div className={WRAP}>
      <PageHead
        eyebrow="Commerce · Sales"
        title="All orders"
        action={
          <Link href="/orders/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft">
            <Icon name="plus" size={18} /> New order
          </Link>
        }
      >
        Every website, Facebook, Instagram, WhatsApp and phone order. Walk-in POS is a separate module.
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Needs action" value={loading ? "…" : String(stats.action)} tone="rose" icon="bolt" href="/orders/action" />
        <Stat label="Preparing / out" value={loading ? "…" : String(stats.fulfilling)} tone="amber" icon="truck" />
        <Stat label="Delivered" value={loading ? "…" : String(stats.delivered)} tone="green" icon="check" />
        <Stat label="Revenue" value={loading ? "…" : formatTaka(stats.revenue)} tone="purple" icon="cash" sub="delivered only" />
        <Stat label="To collect" value={loading ? "…" : formatTaka(stats.codDue)} tone="gold" icon="tag" href="/orders/payments" />
      </div>

      {/* quick status pills */}
      <div className="flex gap-2 flex-wrap mb-3">
        {pills.map(([val, label, tone]) => {
          const on = sales === val;
          const t = TONE[tone];
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSales(val)}
              className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-colors"
              style={on ? { background: t.solid, color: "#fff", borderColor: t.solid } : { background: t.bg, color: t.text, borderColor: t.border }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[320px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search order, customer, phone or recipient…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[150px] h-[44px]" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Self &amp; gift</option>
          <option value="self">Self only</option>
          <option value="gift">Gift only</option>
        </select>
        <select className="ipt max-w-[150px] h-[44px]" value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="">All payments</option>
          <option value="online">Online</option>
          <option value="cod">Cash on delivery</option>
        </select>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} order${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <div className="grid grid-cols-[4px_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto_auto] gap-3 items-center px-0 pr-4 py-2.5 bg-lavender/70 text-body-soft text-[11px] uppercase tracking-[0.05em] font-medium">
          <span />
          <span className="pl-3">Order &amp; customer</span>
          <span>Delivery</span>
          <span>Amount</span>
          <span className="text-center">Status</span>
          <span />
        </div>

        {rows.map((o) => {
          const t = TONE[rowTone(o)];
          const name = o.customer?.name ?? o.senderName;
          const items = o._count?.lines ?? o.lines?.length ?? 0;
          return (
            <div key={o.id} className="grid grid-cols-[4px_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto_auto] gap-3 items-center pr-4 border-t border-lavender-deep hover:bg-lavender/40 transition-colors">
              <span className="self-stretch" style={{ background: t.solid }} />
              <div className="flex items-center gap-3 min-w-0 py-3 pl-3">
                <div className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-medium shrink-0" style={{ background: genAvatar(name) }}>
                  {initials(name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/orders/${o.id}`} className="text-[13.5px] font-medium text-purple hover:underline">{o.orderNo}</Link>
                    {o.isGift && <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: TONE.gold.bg, color: TONE.gold.text }}>Gift</span>}
                  </div>
                  <div className="text-[13px] text-body-soft truncate">
                    {name} · {ago(o.placedAt)} · {items} item{items === 1 ? "" : "s"} · {o.channel?.name ?? "Web"}
                  </div>
                </div>
              </div>
              <div className="min-w-0 text-[12.5px] py-3">
                <div className="text-body truncate">{o.methodLabel || "—"}</div>
                <div className="text-body-soft text-[11.5px] truncate">{zoneLabel(o.zone)}{o.slotLabel ? ` · ${o.slotLabel}` : ""}</div>
              </div>
              <div className="min-w-0 py-3">
                <div className="text-[13.5px] font-medium text-purple">{formatTaka(o.totalPaisa)}</div>
                <div className="mt-0.5"><Chip meta={PAYMENT_STATUS_META[o.paymentStatus]} /></div>
              </div>
              <div className="flex flex-col gap-1 items-start py-3">
                <Chip meta={SALES_STATUS_META[o.salesStatus]} />
                <Chip meta={DELIVERY_STATUS_META[o.deliveryStatus]} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a href={`tel:${orderContactPhone(o)}`} title="Call" className="w-[34px] h-[34px] grid place-items-center rounded-[9px] border bg-white" style={{ borderColor: TONE.green.border, color: TONE.green.text }}>
                  <Icon name="phone" size={15} />
                </a>
                <Link href={`/orders/${o.id}`} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[9px] border bg-white hover:border-orchid text-purple" style={{ borderColor: TONE.purple.border }}>
                  Open
                </Link>
                <RowMenu o={o} onDone={load} />
              </div>
            </div>
          );
        })}

        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center border-t border-lavender-deep">
            <span className="w-11 h-11 rounded-full grid place-items-center mx-auto mb-2" style={{ background: TONE.purple.soft, color: TONE.purple.text }}>
              <Icon name="search" size={20} />
            </span>
            <p className="text-[13.5px] text-body-soft m-0">No orders match your filters.</p>
          </div>
        )}
      </div>

      <p className="text-body-soft text-[12px] mt-3.5">
        The stripe on the left tells you where an order is at a glance — amber needs you, blue is being fulfilled, green is delivered, rose is cancelled.
      </p>
    </div>
  );
}

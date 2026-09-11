"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import { Donut, HBar, LegendDot } from "./Charts";
import {
  listOrders,
  orderAction,
  SALES_STATUS_META,
  DELIVERY_STATUS_META,
  PAYMENT_STATUS_META,
  paymentLabel,
  zoneLabel,
  formatTaka,
  ago,
  initials,
  genAvatar,
  orderReport,
  type ApiOrder,
  type ApiOrderReport,
  type ApiOrderReportRow,
} from "../_data/api";

/*
  Sales / Orders — sub-sections.

  DESIGN RULE (module-wide): colourful, friendly, decision-first. Every screen
  answers "what needs me now?" in colour before it shows a table. Tinted KPI
  cards with icon badges, coloured panel headers, a status stripe on every row,
  and one obvious action per item. Brand palette first (purple / orchid /
  lavender / rosegold), semantic colours only to carry meaning.

  Module boundary kept: Sales owns the order + lifecycle. Delivery owns
  fulfilment/proof, Offers owns coupons, Finance owns the ledger, Returns owns
  the return record — those are referenced, never owned here.
*/

export const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/* ---------------- colour system ---------------- */
export type Tone = "purple" | "green" | "amber" | "rose" | "blue" | "gold";
export const TONE: Record<Tone, { bg: string; border: string; text: string; solid: string; soft: string }> = {
  purple: { bg: "#2b1c35", border: "#3f2d4e", text: "#ce6ef7", solid: "#7d2ea8", soft: "#2c1e37" },
  green: { bg: "#1c3626", border: "#2d4d3a", text: "#76efab", solid: "#149a52", soft: "#20382a" },
  amber: { bg: "#3a2b16", border: "#534228", text: "#f7a96e", solid: "#e08a1e", soft: "#3e2e18" },
  rose: { bg: "#391719", border: "#52282b", text: "#ed8078", solid: "#d64550", soft: "#3c181b" },
  blue: { bg: "#16293b", border: "#283e53", text: "#70bcf5", solid: "#2b7fd4", soft: "#172a3e" },
  gold: { bg: "#38181e", border: "#4b2f34", text: "#c7949b", solid: "#b76e79", soft: "#381c22" },
};

/* ---------------- atoms ---------------- */
export function PageHead({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
          <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
          {eyebrow}
        </div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
        {children && <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "purple",
  icon,
  sub,
  href,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon: string;
  sub?: string;
  href?: string;
}) {
  const t = TONE[tone];
  const inner = (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}>
          <Icon name={icon} size={16} />
        </span>
        <span className="text-[12px] font-medium leading-tight" style={{ color: t.text }}>{label}</span>
      </div>
      <div className="font-display text-[26px] leading-none" style={{ color: t.text }}>{value}</div>
      {sub && <div className="text-[11.5px] mt-1 opacity-75" style={{ color: t.text }}>{sub}</div>}
    </>
  );
  const cls = "rounded-[16px] px-4 py-3.5 border block transition-transform";
  return href ? (
    <Link href={href} className={cls + " hover:-translate-y-0.5"} style={{ background: t.bg, borderColor: t.border }}>{inner}</Link>
  ) : (
    <div className={cls} style={{ background: t.bg, borderColor: t.border }}>{inner}</div>
  );
}

export function Panel({
  title,
  icon,
  tone = "purple",
  count,
  hint,
  children,
}: {
  title: string;
  icon: string;
  tone?: Tone;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="bg-white rounded-[16px] border shadow-soft overflow-hidden mb-5" style={{ borderColor: t.border }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}>
        <span className="w-7 h-7 rounded-[9px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}>
          <Icon name={icon} size={15} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[15px] m-0 leading-tight" style={{ color: t.text }}>{title}</h3>
          {hint && <div className="text-[11.5px] opacity-75" style={{ color: t.text }}>{hint}</div>}
        </div>
        {count !== undefined && (
          <span className="ml-auto text-[12px] font-medium px-2.5 py-1 rounded-full text-white shrink-0" style={{ background: t.solid }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function Chip({ meta }: { meta: { label: string; chip: string; dot: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${meta.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EmptyRow({ text, tone = "purple" }: { text: string; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div className="px-4 py-8 text-center">
      <span className="w-10 h-10 rounded-full grid place-items-center mx-auto mb-2" style={{ background: t.soft, color: t.text }}>
        <Icon name="check" size={19} />
      </span>
      <p className="text-[13px] m-0" style={{ color: t.text }}>{text}</p>
    </div>
  );
}

export function NoteBox({ tone = "purple", children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="rounded-[12px] px-4 py-3 text-[12.5px] border mt-1" style={{ background: t.bg, borderColor: t.border, color: t.text }}>
      {children}
    </div>
  );
}

/* order row with a coloured status stripe + avatar */
function OrderRow({ o, tone = "purple", right }: { o: ApiOrder; tone?: Tone; right?: React.ReactNode }) {
  const name = o.customer?.name ?? o.senderName;
  const t = TONE[tone];
  return (
    <div className="grid grid-cols-[4px_auto_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-center pr-4 border-t border-lavender-deep first:border-t-0 hover:bg-lavender/40 transition-colors">
      <span className="self-stretch" style={{ background: t.solid }} />
      <div className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-medium my-2.5 ml-3 shrink-0" style={{ background: genAvatar(name) }}>
        {initials(name)}
      </div>
      <div className="min-w-0 py-2.5">
        <Link href={`/orders/${o.id}`} className="text-[13.5px] font-medium text-purple hover:underline">{o.orderNo}</Link>
        <div className="text-[13px] text-body-soft truncate">
          {name} · {ago(o.placedAt)} · {o.channel?.name ?? "Web"}
          {o.isGift ? " · 🎁 Gift" : ""}
        </div>
      </div>
      <div className="min-w-0 text-[13px] text-body-soft truncate">
        {o.methodLabel || "—"} · {zoneLabel(o.zone)}
        {o.slotLabel ? ` · ${o.slotLabel}` : ""}
      </div>
      <div className="flex items-center gap-2.5 shrink-0 py-2">{right}</div>
    </div>
  );
}

/* shared data hook */
function useOrders() {
  const [items, setItems] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listOrders();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return { items, loading, error, reload: load };
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = TONE.rose;
  return (
    <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] border flex items-center gap-2" style={{ background: t.bg, borderColor: t.border, color: t.text }}>
      <Icon name="shield" size={16} /> {error}. Is the API (:4000) running?
      <button className="underline ml-1 font-medium" onClick={onRetry}>Retry</button>
    </div>
  );
}

const amountEl = (v: number) => <span className="text-[13.5px] font-medium text-purple">{formatTaka(v)}</span>;

/* ════════════════════ 1. OVERVIEW ════════════════════ */
export function OrdersOverview() {
  const { items, loading, error, reload } = useOrders();

  const s = useMemo(() => {
    let needsAction = 0, fulfilling = 0, delivered = 0, cancelled = 0, revenue = 0, due = 0, refundOwed = 0;
    const byChannel = new Map<string, number>();
    for (const o of items) {
      if (o.salesStatus === "placed") needsAction++;
      if (o.deliveryStatus === "preparing" || o.deliveryStatus === "out_for_delivery") fulfilling++;
      if (o.deliveryStatus === "delivered") { delivered++; revenue += o.totalPaisa; }
      if (o.salesStatus === "cancelled") cancelled++;
      if (o.duePaisa > 0 && o.salesStatus !== "cancelled") due += o.duePaisa;
      if (o.refundPaisa > 0) refundOwed += o.refundPaisa;
      const ch = o.channel?.name ?? "Web";
      byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
    }
    const aov = delivered > 0 ? Math.round(revenue / delivered) : 0;
    return { needsAction, fulfilling, delivered, cancelled, revenue, due, refundOwed, aov, byChannel: [...byChannel.entries()].sort((a, b) => b[1] - a[1]) };
  }, [items]);

  const CH_COLORS = [TONE.purple.solid, TONE.blue.solid, TONE.green.solid, TONE.amber.solid, TONE.gold.solid, TONE.rose.solid];

  return (
    <div className={WRAP}>
      <PageHead
        eyebrow="Today's work · Orders"
        title="Orders overview"
        action={
          <Link href="/orders/new" className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft">
            <Icon name="plus" size={18} /> New order
          </Link>
        }
      />
      {error && <ErrorBox error={error} onRetry={reload} />}

      {/* hero — the one thing to do next */}
      <div className="rounded-[18px] p-5 mb-5 text-white shadow-lift flex items-center gap-5 flex-wrap" style={{ background: "linear-gradient(120deg,#470066 0%,#8a2bb0 42%,#cf43ea 74%,#b76e79 100%)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] uppercase tracking-[0.08em] opacity-80">Waiting on you</div>
          <div className="font-display text-[34px] leading-none mt-1">
            {loading ? "…" : s.needsAction} order{s.needsAction === 1 ? "" : "s"} to confirm
          </div>
        </div>
        <Link href="/orders/action" className="bg-white text-purple text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shrink-0 hover:bg-lavender">
          <Icon name="check" size={17} /> Open action queue
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Needs action" value={loading ? "…" : String(s.needsAction)} tone="rose" icon="bolt" sub="not confirmed" href="/orders/action" />
        <Stat label="Preparing / out" value={loading ? "…" : String(s.fulfilling)} tone="amber" icon="truck" sub="with Delivery" href="/orders/scheduled" />
        <Stat label="Delivered" value={loading ? "…" : String(s.delivered)} tone="green" icon="check" />
        <Stat label="Revenue" value={loading ? "…" : formatTaka(s.revenue)} tone="purple" icon="cash" sub="delivered only" href="/orders/reports" />
        <Stat label="To collect" value={loading ? "…" : formatTaka(s.due)} tone="gold" icon="tag" sub="COD + unpaid" href="/orders/payments" />
        <Stat label="Cancelled" value={loading ? "…" : String(s.cancelled)} tone="blue" icon="trash" href="/orders/cancelled" />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Panel title="Where orders come from" icon="grid" tone="blue" hint="share of every order">
          {s.byChannel.length === 0 ? (
            <EmptyRow text="No orders yet." tone="blue" />
          ) : (
            <div className="p-4 flex items-center gap-5 flex-wrap">
              <Donut size={128} thickness={16}
                segments={s.byChannel.map(([, n], i) => ({ value: n, color: CH_COLORS[i % CH_COLORS.length] }))}
                centerTop={String(items.length)} centerBottom="orders" />
              <div className="flex-1 min-w-[180px]">
                {s.byChannel.slice(0, 5).map(([ch, n], i) => (
                  <HBar key={ch} label={ch} value={n} max={s.byChannel[0][1]}
                    color={CH_COLORS[i % CH_COLORS.length]}
                    right={`${n} · ${items.length ? Math.round((n / items.length) * 100) : 0}%`} />
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Money health" icon="cash" tone="green" hint="delivered orders only">
          <div className="p-5">
            <div className="text-[13px] text-body-soft">Average order value</div>
            <div className="font-display text-[32px] leading-none mt-1" style={{ color: TONE.green.text }}>{loading ? "…" : formatTaka(s.aov)}</div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-[12px] px-3.5 py-2.5" style={{ background: TONE.gold.bg }}>
                <div className="text-[11.5px]" style={{ color: TONE.gold.text }}>Still to collect</div>
                <div className="text-[16px] font-medium" style={{ color: TONE.gold.text }}>{formatTaka(s.due)}</div>
              </div>
              <div className="rounded-[12px] px-3.5 py-2.5" style={{ background: TONE.rose.bg }}>
                <div className="text-[11.5px]" style={{ color: TONE.rose.text }}>Refunded</div>
                <div className="text-[16px] font-medium" style={{ color: TONE.rose.text }}>{formatTaka(s.refundOwed)}</div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-1">
        {([
          ["/orders/list", "All orders", "Search and filter everything", "purple", "bag"],
          ["/orders/payments", "Payments & dues", "Collect and refund", "gold", "cash"],
          ["/orders/scheduled", "Scheduled", "Slots, midnight, gifts", "amber", "clock"],
          ["/orders/recovery", "Recovery", "Incomplete checkouts", "rose", "heart"],
          ["/orders/returns", "Returns", "Staff-started returns", "blue", "box"],
          ["/orders/reports", "Reports", "Channel, zone, AOV", "green", "layers"],
        ] as [string, string, string, Tone, string][]).map(([href, label, desc, tone, icon]) => {
          const t = TONE[tone];
          return (
            <Link key={href} href={href} className="rounded-[14px] px-4 py-3.5 border flex items-center gap-3 hover:-translate-y-0.5 transition-transform" style={{ background: t.bg, borderColor: t.border }}>
              <span className="w-9 h-9 rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: t.solid }}>
                <Icon name={icon} size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium" style={{ color: t.text }}>{label}</div>
                <div className="text-[11.5px] opacity-75" style={{ color: t.text }}>{desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════ 2. ACTION QUEUE ════════════════════ */
export function OrdersActionQueue() {
  const say = useSay();
  const { items, loading, error, reload } = useOrders();
  const [busy, setBusy] = useState<string | null>(null);

  const pending = items.filter((o) => o.salesStatus === "placed");
  const paid = pending.filter((o) => o.paymentMethod === "online" && (o.paymentStatus === "paid" || o.paymentStatus === "advance_paid"));
  const cod = pending.filter((o) => o.paymentMethod === "cod");
  const unpaidOnline = pending.filter((o) => o.paymentMethod === "online" && o.paymentStatus === "unpaid");

  async function confirm(id: string) {
    setBusy(id);
    try {
      await orderAction(id, "confirm");
      await reload();
    } catch (e) {
      say.fromError(e, "Could not confirm that order.");
    } finally {
      setBusy(null);
    }
  }

  const confirmBtn = (o: ApiOrder, tone: Tone) => (
    <button type="button" disabled={busy === o.id} onClick={() => confirm(o.id)} className="text-[12.5px] text-white px-3.5 py-1.5 rounded-[9px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5" style={{ background: TONE[tone].solid }}>
      <Icon name="check" size={14} /> {busy === o.id ? "…" : "Confirm"}
    </button>
  );
  const callBtn = (o: ApiOrder) => (
    <a href={`tel:${o.senderPhone}`} className="text-[12.5px] px-3 py-1.5 rounded-[9px] font-medium inline-flex items-center gap-1.5 border bg-white" style={{ color: TONE.green.text, borderColor: TONE.green.border }}>
      <Icon name="phone" size={13} /> Call
    </a>
  );

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Action queue" />
      <Said say={say} />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Paid — just verify" value={loading ? "…" : String(paid.length)} tone="green" icon="check" />
        <Stat label="COD — call first" value={loading ? "…" : String(cod.length)} tone="amber" icon="phone" />
        <Stat label="Unpaid — chase" value={loading ? "…" : String(unpaidOnline.length)} tone="rose" icon="bolt" />
      </div>

      <Panel title="Paid" icon="check" tone="green" count={paid.length}>
        {loading ? <EmptyRow text="Loading…" tone="green" /> : paid.length === 0 ? <EmptyRow text="All clear — nothing waiting." tone="green" /> : paid.map((o) => (
          <OrderRow key={o.id} o={o} tone="green" right={<>{amountEl(o.totalPaisa)}<Chip meta={{ ...PAYMENT_STATUS_META[o.paymentStatus], label: paymentLabel(o.paymentStatus, o.paymentMethod) }} />{confirmBtn(o, "green")}</>} />
        ))}
      </Panel>

      <Panel title="Cash on delivery" icon="phone" tone="amber" count={cod.length}>
        {loading ? <EmptyRow text="Loading…" tone="amber" /> : cod.length === 0 ? <EmptyRow text="Nothing to call right now." tone="amber" /> : cod.map((o) => (
          <OrderRow key={o.id} o={o} tone="amber" right={<>{amountEl(o.totalPaisa)}{callBtn(o)}{confirmBtn(o, "amber")}</>} />
        ))}
      </Panel>

      <Panel title="Online but unpaid" icon="bolt" tone="rose" count={unpaidOnline.length}>
        {loading ? <EmptyRow text="Loading…" tone="rose" /> : unpaidOnline.length === 0 ? <EmptyRow text="No stuck payments." tone="rose" /> : unpaidOnline.map((o) => (
          <OrderRow key={o.id} o={o} tone="rose" right={<>{amountEl(o.totalPaisa)}{callBtn(o)}<Link href="/orders/recovery" className="text-[12.5px] font-medium underline" style={{ color: TONE.rose.text }}>Recovery</Link></>} />
        ))}
      </Panel>
    </div>
  );
}

/* ════════════════════ 3. PAYMENTS & DUES ════════════════════ */
export function OrdersPayments() {
  const { items, loading, error, reload } = useOrders();

  const due = items.filter((o) => o.duePaisa > 0 && o.salesStatus !== "cancelled");
  const refunds = items.filter((o) => o.refundPaisa > 0);
  const totals = useMemo(() => ({
    codDue: due.filter((o) => o.paymentMethod === "cod").reduce((n, o) => n + o.duePaisa, 0),
    onlineDue: due.filter((o) => o.paymentMethod === "online").reduce((n, o) => n + o.duePaisa, 0),
    refunded: refunds.reduce((n, o) => n + o.refundPaisa, 0),
    collected: items.reduce((n, o) => n + o.paidPaisa, 0),
  }), [items, due, refunds]);

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Payments & dues" />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="COD to collect" value={loading ? "…" : formatTaka(totals.codDue)} tone="gold" icon="cash" />
        <Stat label="Online unpaid" value={loading ? "…" : formatTaka(totals.onlineDue)} tone="amber" icon="bolt" />
        <Stat label="Collected" value={loading ? "…" : formatTaka(totals.collected)} tone="green" icon="check" />
        <Stat label="Refunded" value={loading ? "…" : formatTaka(totals.refunded)} tone="rose" icon="trash" />
      </div>

      <Panel title="Outstanding — to collect or charge" icon="cash" tone="gold" count={due.length}>
        {loading ? <EmptyRow text="Loading…" tone="gold" /> : due.length === 0 ? <EmptyRow text="Nothing outstanding — all paid up." tone="green" /> : due.map((o) => (
          <OrderRow key={o.id} o={o} tone="gold" right={<>
            <span className="text-[13px] text-body-soft">of {formatTaka(o.totalPaisa)}</span>
            <span className="text-[14px] font-medium" style={{ color: TONE.gold.text }}>{formatTaka(o.duePaisa)}</span>
            <Chip meta={{ ...PAYMENT_STATUS_META[o.paymentStatus], label: paymentLabel(o.paymentStatus, o.paymentMethod) }} />
          </>} />
        ))}
      </Panel>

      <Panel title="Refunds recorded" icon="trash" tone="rose" count={refunds.length}>
        {refunds.length === 0 ? <EmptyRow text="No refunds." tone="rose" /> : refunds.map((o) => (
          <OrderRow key={o.id} o={o} tone="rose" right={<><span className="text-[14px] font-medium" style={{ color: TONE.rose.text }}>{formatTaka(o.refundPaisa)}</span><Chip meta={SALES_STATUS_META[o.salesStatus]} /></>} />
        ))}
      </Panel>

    </div>
  );
}

/* ════════════════════ 4. SCHEDULED ════════════════════ */
export function OrdersScheduled() {
  const { items, loading, error, reload } = useOrders();

  const open = items.filter((o) => o.salesStatus !== "cancelled" && o.deliveryStatus !== "delivered");
  const groups = useMemo(() => {
    const m = new Map<string, ApiOrder[]>();
    for (const o of open) {
      const key = o.date || "No fixed date";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "No fixed date" ? 1 : b[0] === "No fixed date" ? -1 : a[0].localeCompare(b[0])));
  }, [open]);
  const gifts = open.filter((o) => o.isGift).length;
  const midnight = open.filter((o) => (o.methodLabel || "").toLowerCase().includes("midnight")).length;

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Scheduled & occasions" />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Open orders" value={loading ? "…" : String(open.length)} tone="purple" icon="bag" />
        <Stat label="Gift orders" value={loading ? "…" : String(gifts)} tone="blue" icon="heart" />
        <Stat label="Midnight" value={loading ? "…" : String(midnight)} tone="amber" icon="moon" />
      </div>

      {loading ? <Panel title="Loading" icon="clock" tone="purple"><EmptyRow text="Loading…" /></Panel>
        : groups.length === 0 ? <Panel title="Nothing scheduled" icon="clock" tone="green"><EmptyRow text="No open deliveries." tone="green" /></Panel>
          : groups.map(([date, list]) => (
            <Panel key={date} title={date} icon="clock" tone={date === "No fixed date" ? "blue" : "amber"} count={list.length}>
              {list.map((o) => (
                <OrderRow key={o.id} o={o} tone={date === "No fixed date" ? "blue" : "amber"} right={<>
                  {amountEl(o.totalPaisa)}
                  <Chip meta={DELIVERY_STATUS_META[o.deliveryStatus]} />
                </>} />
              ))}
            </Panel>
          ))}

    </div>
  );
}

/* ════════════════════ 5. REPORTS ════════════════════ */
/*
  REV-C4 — THE NUMBERS ON THIS PAGE ARE COUNTED BY THE DATABASE, 30 Aug 2026.

  ⚠️ They were not, and that is the fault this rewrite exists for. The page ran
  `useOrders()` — which asks the API for `pageSize: "100"` — and then summed
  that array: revenue, average order value, the cancellation rate, and every
  channel / zone / payment / gift split. Under a hundred orders the answers are
  right by accident. Past a hundred every figure on the screen is wrong, and it
  goes on looking perfectly healthy on demo, where there will never be a
  hundred. The one critical the 17 July Sales review left open, and the same
  family as Phase 5's faults: a screen quietly lying about a rule that is
  itself correct.

  `GET /orders/report` now does the counting in Postgres — six grouped queries,
  no order rows crossing the wire, and the same answer at 40 orders as at
  40,000.
*/
export function OrdersReports() {
  const [rep, setRep] = useState<ApiOrderReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRep(await orderReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const Bars = ({ title, icon, tone, rows }: { title: string; icon: string; tone: Tone; rows: ApiOrderReportRow[] }) => {
    const max = Math.max(1, ...rows.map((r) => r.n));
    return (
      <Panel title={title} icon={icon} tone={tone}>
        {rows.length === 0 ? <EmptyRow text="No data." tone={tone} /> : (
          <div className="p-4 flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="text-body font-medium">{r.label}</span>
                  <span className="text-body-soft">{r.n} orders · {formatTaka(r.revenuePaisa)}</span>
                </div>
                <div className="h-[9px] rounded-full bg-lavender overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((r.n / max) * 100)}%`, background: TONE[tone].solid }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    );
  };

  const n = (v: number | undefined) => (loading || rep === null ? "…" : String(v ?? 0));
  const taka = (v: number | undefined) => (loading || rep === null ? "…" : formatTaka(v ?? 0));

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Order reports" />
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Orders" value={n(rep?.totalOrders)} tone="purple" icon="bag" />
        <Stat
          label="Revenue"
          value={taka(rep?.revenuePaisa)}
          tone="green"
          icon="cash"
          sub={rep ? `${rep.deliveredOrders} delivered` : undefined}
        />
        <Stat label="Average order" value={taka(rep?.aovPaisa)} tone="gold" icon="star" />
        <Stat
          label="Cancellation rate"
          value={loading || rep === null ? "…" : `${rep.cancelRatePct}%`}
          tone="rose"
          icon="trash"
          sub={rep ? `${rep.cancelledOrders} cancelled` : undefined}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Bars title="By channel" icon="grid" tone="purple" rows={rep?.channel ?? []} />
        <Bars title="By zone" icon="truck" tone="blue" rows={rep?.zone ?? []} />
        <Bars title="By payment method" icon="cash" tone="green" rows={rep?.payment ?? []} />
        <Bars title="Self vs gift" icon="heart" tone="gold" rows={rep?.type ?? []} />
      </div>
    </div>
  );
}

/* ════════════════════ 6. RECOVERY ════════════════════ */
export function OrdersRecovery() {
  const { items, loading, error, reload } = useOrders();

  const atRisk = items.filter((o) => o.salesStatus === "placed" && o.paymentMethod === "online" && o.paymentStatus === "unpaid");
  const value = atRisk.reduce((n, o) => n + o.totalPaisa, 0);

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Recovery — incomplete orders" />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Awaiting payment" value={loading ? "…" : String(atRisk.length)} tone="amber" icon="clock" />
        <Stat label="Value at risk" value={loading ? "…" : formatTaka(value)} tone="rose" icon="cash" />
        <Stat label="Recovered" value="—" tone="green" icon="heart" />
      </div>

      <Panel title="Placed but not paid" icon="phone" tone="amber" count={atRisk.length}>
        {loading ? <EmptyRow text="Loading…" tone="amber" /> : atRisk.length === 0 ? <EmptyRow text="Nothing waiting on payment." tone="green" /> : atRisk.map((o) => (
          <OrderRow key={o.id} o={o} tone="amber" right={<>
            {amountEl(o.totalPaisa)}
            <a href={`tel:${o.senderPhone}`} className="text-[12.5px] px-3 py-1.5 rounded-[9px] font-medium inline-flex items-center gap-1.5 border bg-white" style={{ color: TONE.green.text, borderColor: TONE.green.border }}>
              <Icon name="phone" size={13} /> Call
            </a>
          </>} />
        ))}
      </Panel>
    </div>
  );
}

/* ════════════════════ 7. RETURNS ════════════════════ */
export function OrdersReturns() {
  const { items, loading, error, reload } = useOrders();
  const delivered = items.filter((o) => o.deliveryStatus === "delivered");

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Returns & refunds" />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <Panel title="Delivered" icon="box" tone="blue" count={delivered.length}>
        {loading ? <EmptyRow text="Loading…" tone="blue" /> : delivered.length === 0 ? <EmptyRow text="No delivered orders yet." tone="blue" /> : delivered.map((o) => (
          <OrderRow key={o.id} o={o} tone="blue" right={<>
            {amountEl(o.totalPaisa)}
            {/* (audit 11 Sep 2026) carry the order through, or the return screen opens empty */}
            <Link href={`/returns/new?orderId=${o.id}`} className="text-[12.5px] text-white px-3 py-1.5 rounded-[9px] font-medium" style={{ background: TONE.blue.solid }}>
              Start return
            </Link>
          </>} />
        ))}
      </Panel>
    </div>
  );
}

/* ════════════════════ 8. CANCELLED ════════════════════ */
export function OrdersCancelled() {
  const { items, loading, error, reload } = useOrders();
  const cancelled = items.filter((o) => o.salesStatus === "cancelled");
  const refunded = cancelled.reduce((n, o) => n + o.refundPaisa, 0);

  return (
    <div className={WRAP}>
      <PageHead eyebrow="Commerce · Sales" title="Cancelled orders" />
      {error && <ErrorBox error={error} onRetry={reload} />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Cancelled" value={loading ? "…" : String(cancelled.length)} tone="rose" icon="trash" />
        <Stat label="Refunded" value={loading ? "…" : formatTaka(refunded)} tone="gold" icon="cash" />
        <Stat label="Of all orders" value={loading ? "…" : items.length ? `${Math.round((cancelled.length / items.length) * 100)}%` : "0%"} tone="purple" icon="layers" />
      </div>

      <Panel title="Cancelled" icon="trash" tone="rose" count={cancelled.length}>
        {loading ? <EmptyRow text="Loading…" tone="rose" /> : cancelled.length === 0 ? <EmptyRow text="No cancelled orders — good sign." tone="green" /> : cancelled.map((o) => (
          <OrderRow key={o.id} o={o} tone="rose" right={<>
            {amountEl(o.totalPaisa)}
            {o.refundPaisa > 0 && <span className="text-[12px] font-medium" style={{ color: TONE.rose.text }}>refund {formatTaka(o.refundPaisa)}</span>}
            <Chip meta={DELIVERY_STATUS_META[o.deliveryStatus]} />
          </>} />
        ))}
      </Panel>
    </div>
  );
}

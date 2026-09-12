"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  formatTaka,
  getIntelDashboard, getIntelHistory,
  orderStats, financeAccounts, returnStats, posDay,
  getCatalogFunnel, deliveryPerformance, listCustomers,
  type IntelDashboard, type IntelHistory,
  type ApiOrderStats, type ApiFinanceAccount, type ReturnStats, type ApiPosDay,
  type ApiCatalogFunnel, type ApiDeliveryAnalytics,
} from "../_data/api";

/*  BUSINESS DASHBOARD — the whole shop on one page, approved 12 Sep 2026.

    THE PAGE IS FOR THE BUSINESS, NOT FOR THE WEBSITE. The counter till, the
    wallets, the bank, returns and what is owed to suppliers all sit here
    beside the online orders, because the owner does not run two shops.

    THREE DECISIONS WORTH KEEPING:

    1. THE RANGE FILTER DRIVES THE SERIES, NOT THE SNAPSHOT. 7 / 30 / 90 days
       re-cuts the day-by-day history and everything computed from it. Figures
       that are true only at this instant — cash in hand, money owed, what is
       in the till — are labelled "right now" and never move with the filter,
       because pretending a balance has a date range is how a dashboard starts
       lying.

    2. ONE CHART AT A TIME. Three charts stacked read as one confusing picture;
       the same three behind a switch read as three answers. The heading, the
       headline figure and the sentence under it all change with the tab, so
       the reader is never asked to remember which chart they are looking at.

    3. NOTHING IS INVENTED. Every figure comes from an endpoint. Where a
       number could not be loaded the card says so rather than printing a zero,
       because a zero is a claim about the business.                          */

/* ─────────────────────────── small helpers ─────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-02" -> "2 Sep" — the axis has no room for a year */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`;
}

/**
 * A paisa amount as an axis label.
 *
 * The gridlines are quarters of a round paisa step, so they are very often NOT
 * whole thousands of taka. Rounding them to "3k" put the label 20% away from
 * the line it sat on, and every value read off the chart was then wrong — so
 * one decimal is kept whenever the quarter is not clean.
 */
function axisTaka(paisa: number): string {
  const taka = paisa / 100;
  if (taka === 0) return "0";
  if (Math.abs(taka) >= 1000) {
    const k = taka / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(taka));
}

/** basis points -> "60 %", and null stays "—": no measurement is not 0% */
function bp(v: number | null): string {
  return v === null ? "—" : `${(v / 100).toFixed(1).replace(/\.0$/, "")} %`;
}

/** 554 minutes -> "9 h 14 m" — hours are how a delivery is actually discussed */
function hoursMins(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} m`;
}

function sum(rows: Row[], pick: (r: Row) => number): number {
  return rows.reduce((t, r) => t + pick(r), 0);
}

interface Row { date: string; revenue: number; orders: number; profit: number }

type RangeDays = 7 | 30 | 90;
type ChartKey = "sales" | "orders" | "profit";

/* ─────────────────────────── the "right now" bar ───────────────────── */

const NOW_TONE: Record<string, string> = {
  ok: "var(--t-faint)", info: "var(--t-main)", warn: "var(--t-warn)", danger: "var(--t-bad)",
};

function NowBar({ dash, pos }: { dash: IntelDashboard | null; pos: ApiPosDay | null }) {
  const lines = dash?.today.lines ?? [];
  /*  the quiet ones are dropped on purpose: a row reading 0 teaches the eye to
      skip the bar, and then the row that matters is skipped with it  */
  const live = lines.filter((l) => l.count > 0);

  return (
    <div
      className="flex flex-wrap items-center rounded-[14px] border overflow-hidden mb-4"
      style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}
    >
      <div
        className="px-[18px] py-[13px] text-[12.5px] font-bold"
        style={{ color: "var(--t-main)" }}
      >
        Right now
      </div>

      <div
        className="flex items-center gap-2.5 px-[18px] py-[13px] text-[12.5px] border-l"
        style={{ color: "var(--t-soft)", borderColor: "var(--l-soft)" }}
      >
        Orders today
        <b className="text-[15px] font-bold tabular-nums" style={{ color: (dash?.today.ordersToday ?? 0) > 0 ? "var(--t-main)" : "var(--t-faint)" }}>
          {dash ? dash.today.ordersToday : "—"}
        </b>
      </div>

      <div
        className="flex items-center gap-2.5 px-[18px] py-[13px] text-[12.5px] border-l"
        style={{ color: "var(--t-soft)", borderColor: "var(--l-soft)" }}
      >
        Taken at the counter today
        <b className="text-[15px] font-bold tabular-nums" style={{ color: (pos?.money.takenPaisa ?? 0) > 0 ? "var(--t-main)" : "var(--t-faint)" }}>
          {pos ? formatTaka(pos.money.takenPaisa) : "—"}
        </b>
      </div>

      {live.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className="flex items-center gap-2.5 px-[18px] py-[13px] text-[12.5px] border-l transition-colors hover:bg-[var(--s-raised)]"
          style={{ color: "var(--t-soft)", borderColor: "var(--l-soft)" }}
        >
          {l.label}
          <b className="text-[15px] font-bold tabular-nums" style={{ color: NOW_TONE[l.tone] ?? "var(--t-main)" }}>
            {l.count}
          </b>
        </Link>
      ))}

      {dash && live.length === 0 ? (
        <div className="px-[18px] py-[13px] text-[12.5px] border-l" style={{ color: "var(--t-faint)", borderColor: "var(--l-soft)" }}>
          Nothing is waiting.
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── the four headline cards ───────────────── */

function Delta({ now, before }: { now: number; before: number | null }) {
  let cls = "flat";
  let text = "no earlier period";
  if (before !== null) {
    if (now === before) { cls = "flat"; text = "no change"; }
    else if (before === 0) {
      /*  a percentage against nothing is infinite, and "new" is the honest word  */
      cls = now > 0 ? "up" : "down";
      text = now > 0 ? "nothing sold before" : "down from nothing";
    } else {
      const pc = Math.round(((now - before) / Math.abs(before)) * 100);
      cls = now > before ? "up" : "down";
      text = `${now > before ? "↑" : "↓"} ${Math.abs(pc)}% vs before`;
    }
  }
  const style =
    cls === "up" ? { background: "var(--s-ok)", color: "var(--t-ok)" }
    : cls === "down" ? { background: "var(--s-bad)", color: "var(--t-bad)" }
    : { background: "var(--s-sunken)", color: "var(--t-faint)" };
  return (
    <span className="ml-auto text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap" style={style}>
      {text}
    </span>
  );
}

/** the little chart along the foot of a card */
function Spark({ rows, pick, mode }: { rows: Row[]; pick: (r: Row) => number; mode: "area" | "bars" | "diverge" }) {
  const W = 200, H = 52;
  if (rows.length === 0) return <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-[52px]" />;
  const step = W / rows.length;
  const bw = Math.max(1.2, step * 0.64);

  if (mode === "diverge") {
    const mx = Math.max(...rows.map((r) => Math.abs(pick(r)))) || 1;
    const mid = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[52px]" aria-hidden>
        {rows.map((r, i) => {
          const v = pick(r);
          const bh = v ? Math.max(1.5, (Math.abs(v) / mx) * (H / 2 - 2)) : 1.2;
          return (
            <rect key={i} x={i * step + step * 0.18} y={v >= 0 ? mid - bh : mid} width={bw} height={bh} rx={0.8}
              fill={v > 0 ? "var(--t-ok)" : v < 0 ? "var(--t-bad)" : "var(--f-chart-dim)"} />
          );
        })}
      </svg>
    );
  }

  if (mode === "bars") {
    const mx = Math.max(...rows.map(pick)) || 1;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[52px]" aria-hidden>
        {rows.map((r, i) => {
          const v = pick(r);
          const bh = v ? Math.max(2, (v / mx) * (H - 6)) : 1.5;
          return (
            <rect key={i} x={i * step + step * 0.18} y={H - bh} width={bw} height={bh} rx={0.8}
              fill={v ? "var(--f-chart)" : "var(--f-chart-dim)"} opacity={v ? 0.72 : 1} />
          );
        })}
      </svg>
    );
  }

  const mx = Math.max(...rows.map(pick)) || 1;
  const pts = rows.map((r, i) => [step * (i + 0.5), H - 4 - (pick(r) / mx) * (H - 10)] as const);
  const d = smooth(pts);
  const id = `sp-${mode}-${rows.length}-${Math.round(mx)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[52px]" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--f-chart)" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({
  icon, iconBg, iconColor, label, value, negative, say, delta, children,
}: {
  icon: string; iconBg: string; iconColor: string; label: string;
  value: string; negative?: boolean; say: string;
  delta?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col rounded-[16px] border overflow-hidden"
      style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}
    >
      <div className="flex-1 px-[22px] pt-5 pb-4">
        <div className="flex items-center gap-[11px] min-h-[36px]">
          <span className="w-9 h-9 rounded-[11px] grid place-items-center shrink-0" style={{ background: iconBg }}>
            <Icon name={icon} size={18} style={{ color: iconColor }} />
          </span>
          <h3
            className="m-0 text-[13px] font-bold uppercase tracking-[0.07em]"
            style={{ color: "var(--t-soft)" }}
          >
            {label}
          </h3>
          {delta}
        </div>

        <div className="mt-[18px]">
          <b
            className="text-[36px] font-bold tabular-nums leading-none tracking-[-0.035em]"
            style={{ color: negative ? "var(--t-bad)" : "var(--t-main)" }}
          >
            {value}
          </b>
        </div>

        <span className="block text-[12px] mt-[11px] leading-[1.55] min-h-[3.1em]" style={{ color: "var(--t-faint)" }}>
          {say}
        </span>
      </div>
      {children ? <div className="mt-1.5">{children}</div> : null}
    </div>
  );
}

/* ─────────────────────────── the big chart ─────────────────────────── */

/** a smooth curve through the points — it never overshoots a peak */
function smooth(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length < 2) return `M${pts[0][0]} ${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2, k = 0.2;
    const c1x = p1[0] + (p2[0] - p0[0]) * k, c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k, c2y = p2[1] - (p3[1] - p1[1]) * k;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const CW = 760, CH = 250, CL = 56, CR = 10, CT = 16, CB = 30;
const PW = CW - CL - CR, PH = CH - CT - CB;

interface HoverAt { i: number; x: number }

function useHover(rows: Row[]) {
  const box = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<HoverAt | null>(null);
  const step = rows.length ? PW / rows.length : PW;

  /*  the charts stay mounted when the period changes, so an index picked on
      the 90 day view would draw a crosshair off the plot and an empty tooltip  */
  useEffect(() => { setAt(null); }, [rows]);

  function onMove(ev: React.MouseEvent) {
    const el = box.current;
    if (!el || rows.length === 0) return;
    const r = el.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * CW;
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor((vx - CL) / step)));
    setAt({ i, x: ((CL + step * (i + 0.5)) / CW) * r.width });
  }
  return { box, at, setAt, onMove, step };
}

function Tip({ at, lines }: { at: HoverAt | null; lines: React.ReactNode }) {
  if (!at) return null;
  return (
    <div
      className="absolute pointer-events-none rounded-[10px] px-3 py-[9px] text-[11.5px] leading-[1.55] whitespace-nowrap z-10"
      style={{
        left: at.x, top: (CT / CH) * 100 + "%", transform: "translate(-50%,-110%)",
        background: "var(--t-main)", color: "var(--s-card)", boxShadow: "var(--elev-lift)",
      }}
    >
      {lines}
    </div>
  );
}

function SalesChart({ rows }: { rows: Row[] }) {
  const { box, at, setAt, onMove, step } = useHover(rows);
  const max = Math.max(...rows.map((r) => r.revenue), 0);
  const nice = Math.ceil(max / 500000) * 500000 || 500000;
  const pts = rows.map((r, i) => [CL + step * (i + 0.5), CT + PH - (r.revenue / nice) * PH] as const);
  const line = smooth(pts);
  let best = 0;
  rows.forEach((r, i) => { if (r.revenue > rows[best].revenue) best = i; });

  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label="Sales each day">
        <defs>
          <linearGradient id="bd-sales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((g) => {
          const y = CT + PH - (PH * g) / 4;
          return (
            <g key={g}>
              <line x1={CL} x2={CW - CR} y1={y} y2={y} stroke={g ? "var(--l-soft)" : "var(--l-strong)"} strokeWidth={1} />
              <text x={CL - 10} y={y + 3.5} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">
                {axisTaka((nice * g) / 4)}
              </text>
            </g>
          );
        })}

        {rows.length > 0 && (
          <>
            <path d={`${line} L${pts[pts.length - 1][0].toFixed(1)} ${CT + PH} L${pts[0][0].toFixed(1)} ${CT + PH} Z`} fill="url(#bd-sales)" />
            <path d={line} fill="none" stroke="var(--f-chart)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            {rows.map((r, i) => r.revenue ? (
              <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={i === best ? 5 : 2.8}
                fill={i === best ? "var(--s-card)" : "var(--f-chart)"}
                stroke={i === best ? "var(--t-ok)" : "none"} strokeWidth={i === best ? 2.5 : 0} />
            ) : null)}
            {rows[best].revenue > 0 && (
              <text x={pts[best][0]} y={Math.max(CT + 9, pts[best][1] - 12)} textAnchor="middle"
                className="text-[11px] font-bold" fill="var(--t-ok)">
                best day {formatTaka(rows[best].revenue)}
              </text>
            )}
          </>
        )}

        <Axis rows={rows} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--f-chart)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>

      <Tip at={at} lines={at && rows[at.i] ? (
        <>
          <span style={{ opacity: 0.65 }}>{dayLabel(rows[at.i].date)}</span><br />
          <b className="tabular-nums">{formatTaka(rows[at.i].revenue)}</b> came in<br />
          <span style={{ opacity: 0.65 }}>{rows[at.i].orders} order{rows[at.i].orders === 1 ? "" : "s"} placed</span>
        </>
      ) : null} />

      <div className="flex gap-[18px] flex-wrap mt-4 text-[11.5px]" style={{ color: "var(--t-soft)" }}>
        <span className="inline-flex items-center gap-[7px]"><span className="w-[11px] h-[11px] rounded-[3px] block" style={{ background: "var(--f-chart)" }} />Sales that day</span>
        <span className="inline-flex items-center gap-[7px]"><span className="w-[11px] h-[11px] rounded-[3px] block" style={{ background: "var(--t-ok)" }} />The best day</span>
      </div>
    </div>
  );
}

function Axis({ rows, step }: { rows: Row[]; step: number }) {
  if (rows.length === 0) return null;
  const marks = Array.from(new Set([0, Math.floor(rows.length / 2), rows.length - 1]));
  return (
    <>
      {marks.map((i, k) => (
        <text key={i} x={CL + step * (i + 0.5)} y={CH - 8}
          textAnchor={k === 0 ? "start" : k === marks.length - 1 ? "end" : "middle"}
          className="text-[10.5px] font-semibold" fill="var(--t-faint)">
          {dayLabel(rows[i].date)}
        </text>
      ))}
    </>
  );
}

function OrdersChart({ rows }: { rows: Row[] }) {
  const { box, at, setAt, onMove, step } = useHover(rows);
  const max = Math.max(...rows.map((r) => r.orders), 0) || 1;
  const bw = Math.max(2.5, Math.min(15, step - 3));

  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label="Orders each day">
        <defs>
          <linearGradient id="bd-orders" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((g) => {
          const y = CT + PH - (PH * g) / 4;
          return (
            <g key={g}>
              <line x1={CL} x2={CW - CR} y1={y} y2={y} stroke={g ? "var(--l-soft)" : "var(--l-strong)"} strokeWidth={1} />
              <text x={CL - 10} y={y + 3.5} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">
                {Math.round((max * g) / 4)}
              </text>
            </g>
          );
        })}

        {rows.map((r, i) => {
          const bh = r.orders ? Math.max(4, (r.orders / max) * PH) : 3;
          return (
            <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={CT + PH - bh} width={bw} height={bh}
              rx={Math.min(3.5, bw / 2)} fill={r.orders ? "url(#bd-orders)" : "var(--f-chart-dim)"} />
          );
        })}

        <Axis rows={rows} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--f-chart)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>

      <Tip at={at} lines={at && rows[at.i] ? (
        <>
          <span style={{ opacity: 0.65 }}>{dayLabel(rows[at.i].date)}</span><br />
          <b className="tabular-nums">{rows[at.i].orders}</b> order{rows[at.i].orders === 1 ? "" : "s"} placed
        </>
      ) : null} />

      <div className="flex gap-[18px] flex-wrap mt-4 text-[11.5px]" style={{ color: "var(--t-soft)" }}>
        <span className="inline-flex items-center gap-[7px]"><span className="w-[11px] h-[11px] rounded-[3px] block" style={{ background: "var(--f-chart)" }} />Orders placed that day</span>
        <span className="inline-flex items-center gap-[7px]"><span className="w-[11px] h-[11px] rounded-[3px] block" style={{ background: "var(--f-chart-dim)" }} />No order that day</span>
      </div>
    </div>
  );
}

function ProfitChart({ rows }: { rows: Row[] }) {
  const { box, at, setAt, onMove, step } = useHover(rows);
  const max = Math.max(...rows.map((r) => Math.abs(r.profit)), 0) || 1;
  const bw = Math.max(2.5, Math.min(15, step - 3));
  const mid = CT + PH / 2;
  const up = rows.filter((r) => r.profit > 0).length;
  const down = rows.filter((r) => r.profit < 0).length;
  const none = rows.length - up - down;
  const k = (v: number) => axisTaka(v);

  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label="Profit on goods each day">
        <defs>
          <linearGradient id="bd-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-ok)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--t-ok)" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="bd-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-bad)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--t-bad)" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {[CT, mid, CT + PH].map((y, i) => (
          <line key={i} x1={CL} x2={CW - CR} y1={y} y2={y}
            stroke={i === 1 ? "var(--l-strong)" : "var(--l-soft)"} strokeWidth={1} />
        ))}
        <text x={CL - 10} y={CT + 4} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">{`+${k(max)}`}</text>
        <text x={CL - 10} y={mid + 3.5} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">0</text>
        <text x={CL - 10} y={CT + PH} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">{`−${k(max)}`}</text>

        {rows.map((r, i) => {
          const bh = r.profit ? Math.max(3.5, (Math.abs(r.profit) / max) * (PH / 2)) : 3;
          return (
            <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={r.profit >= 0 ? mid - bh : mid}
              width={bw} height={bh} rx={Math.min(3, bw / 2)}
              fill={r.profit > 0 ? "url(#bd-up)" : r.profit < 0 ? "url(#bd-down)" : "var(--f-chart-dim)"} />
          );
        })}

        <Axis rows={rows} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--t-ok)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>

      <Tip at={at} lines={at && rows[at.i] ? (
        <>
          <span style={{ opacity: 0.65 }}>{dayLabel(rows[at.i].date)}</span><br />
          <b className="tabular-nums">{formatTaka(rows[at.i].profit)}</b> left after cost
        </>
      ) : null} />

      <div className="flex gap-2.5 flex-wrap mt-4">
        <Chip tone="ok">{`made money - ${up} day${up === 1 ? "" : "s"}`}</Chip>
        <Chip tone="bad">{`sold below cost - ${down} day${down === 1 ? "" : "s"}`}</Chip>
        <Chip tone="mute">{`no profit recorded - ${none} day${none === 1 ? "" : "s"}`}</Chip>
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "ok" | "bad" | "warn" | "mute"; children: React.ReactNode }) {
  const s =
    tone === "ok" ? { background: "var(--s-ok)", color: "var(--t-ok)" }
    : tone === "bad" ? { background: "var(--s-bad)", color: "var(--t-bad)" }
    : tone === "warn" ? { background: "var(--s-warn)", color: "var(--t-warn)" }
    : { background: "var(--s-sunken)", color: "var(--t-faint)" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={s}>
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: "currentColor" }} />
      {children}
    </span>
  );
}

/* ─────────────────────────── switches ─────────────────────────────── */

function Seg<T extends string | number>({
  value, options, onPick, label,
}: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div
      className="inline-flex p-[3px] gap-[2px] rounded-full border"
      role="group" aria-label={label}
      style={{ background: "var(--s-raised)", borderColor: "var(--l-soft)" }}
    >
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.v)}
            className="text-[12.5px] font-semibold px-[15px] py-[7px] rounded-full transition-colors"
            style={on
              ? { background: "var(--t-main)", color: "var(--s-card)" }
              : { background: "transparent", color: "var(--t-soft)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── list rows with a track ────────────────── */

function TrackRow({ label, value, width, color }: { label: string; value: string; width: number; color: string }) {
  return (
    <div className="mb-[13px] last:mb-0">
      <div className="flex justify-between gap-3 items-baseline text-[12.5px]">
        <span className="truncate" style={{ color: "var(--t-main)" }}>{label}</span>
        <b className="font-semibold tabular-nums whitespace-nowrap" style={{ color }}>{value}</b>
      </div>
      <div className="h-[7px] rounded mt-[7px] overflow-hidden" style={{ background: "var(--s-sunken)" }}>
        <span className="block h-full rounded" style={{ width: `${Math.max(0, Math.min(100, width))}%`, background: color }} />
      </div>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border px-6 py-[22px]"
      style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}>
      <h2 className="text-[15.5px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{title}</h2>
      {note ? <p className="text-[12px] m-0 mt-1 leading-[1.5]" style={{ color: "var(--t-faint)" }}>{note}</p> : null}
      {children}
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "bad" }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--t-faint)" }}>{label}</div>
      <div className="text-[25px] font-bold tabular-nums mt-[9px]"
        style={{ color: tone === "bad" ? "var(--t-bad)" : tone === "warn" ? "var(--t-warn)" : "var(--t-main)" }}>
        {value}
      </div>
      {note ? (
        <div className="text-[12px] mt-[5px] leading-[1.5] whitespace-pre-line" style={{ color: "var(--t-faint)" }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── the page ──────────────────────────────── */

export function BusinessDashboard() {
  const [days, setDays] = useState<RangeDays>(30);
  const [chart, setChart] = useState<ChartKey>("sales");

  const [hist, setHist] = useState<IntelHistory | null>(null);
  const [dash, setDash] = useState<IntelDashboard | null>(null);
  const [ords, setOrds] = useState<ApiOrderStats | null>(null);
  const [accs, setAccs] = useState<ApiFinanceAccount[] | null>(null);
  const [rets, setRets] = useState<ReturnStats | null>(null);
  const [pos, setPos] = useState<ApiPosDay | null>(null);
  const [funnel, setFunnel] = useState<ApiCatalogFunnel | null>(null);
  const [deliv, setDeliv] = useState<ApiDeliveryAnalytics | null>(null);
  /*  these two reload on every period change, and `loading` above is only ever
      true once. Without their own state a period click printed "could not read"
      across four panels for as long as the fetch took.  */
  const [sideState, setSideState] = useState<"loading" | "ok" | "error">("loading");
  const [custTotal, setCustTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      /*  allSettled, not all: one endpoint the role cannot read must not blank
          the whole page. Whatever answered is shown; the rest says so.  */
      const [h, d, o, a, r, p] = await Promise.allSettled([
        getIntelHistory(90), getIntelDashboard(), orderStats(),
        financeAccounts(), returnStats(), posDay(),
      ]);
      if (!alive) return;
      const miss: string[] = [];
      if (h.status === "fulfilled") setHist(h.value); else miss.push("the day-by-day history");
      if (d.status === "fulfilled") setDash(d.value); else miss.push("today's work list");
      if (o.status === "fulfilled") setOrds(o.value); else miss.push("order totals");
      if (a.status === "fulfilled") setAccs(a.value); else miss.push("the money accounts");
      if (r.status === "fulfilled") setRets(r.value); else miss.push("returns");
      if (p.status === "fulfilled") setPos(p.value); else miss.push("the counter");
      setFailed(miss);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /*  the customer count is a page-1 total, not a list — it never changes with
      the period, so it is fetched once  */
  useEffect(() => {
    let alive = true;
    listCustomers()
      .then((r) => { if (alive) setCustTotal(r.total); })
      .catch(() => { if (alive) setCustTotal(null); });
    return () => { alive = false; };
  }, []);

  /*  these two are counted server-side over a window, so they are re-fetched
      when the period changes rather than sliced from something already held  */
  useEffect(() => {
    let alive = true;
    setFunnel(null); setDeliv(null); setSideState("loading");
    Promise.allSettled([getCatalogFunnel(days), deliveryPerformance(days)]).then(([f, d]) => {
      if (!alive) return;
      if (f.status === "fulfilled") setFunnel(f.value);
      if (d.status === "fulfilled") setDeliv(d.value);
      setSideState(f.status === "fulfilled" || d.status === "fulfilled" ? "ok" : "error");
    });
    return () => { alive = false; };
  }, [days]);

  const all: Row[] = useMemo(
    () => (hist?.days ?? []).map((d) => ({
      date: d.onDate, revenue: d.revenuePaisa, orders: d.ordersCount, profit: d.grossProfitPaisa,
    })),
    [hist],
  );
  const rows = useMemo(() => all.slice(-days), [all, days]);
  const before = useMemo(() => {
    /*  a short tail is not a comparable period: 15 days against 30 reads as a
        50% collapse on a business that did not move at all  */
    const cut = all.slice(-days * 2, -days);
    return cut.length === days ? cut : null;
  }, [all, days]);

  const revenue = sum(rows, (r) => r.revenue);
  const orders = sum(rows, (r) => r.orders);
  const profit = sum(rows, (r) => r.profit);
  const traded = rows.filter((r) => r.revenue > 0).length;

  const money = dash?.money?.figures ?? [];
  const fig = (key: string) => money.find((m) => m.key === key)?.value;
  const cash = fig("cash"), spendable = fig("spendable"), payable = fig("payable"), stock = fig("inventory");

  const due = ords?.duePaisa ?? null;
  const collected = ords?.collectedPaisa ?? null;
  const paidShare = due !== null && collected !== null && due + collected > 0
    ? (collected / (due + collected)) * 100
    : null;

  /*  isActive matters: a closed wallet with a residual balance is not money
      the shop can reach, and summing it overstates the till  */
  const moneyAccounts = (accs ?? []).filter((a) => a.isMoneyAccount && a.isActive);
  const accMax = Math.max(1, ...moneyAccounts.map((a) => Math.abs(a.balancePaisa)));
  const accTotal = moneyAccounts.reduce((t, a) => t + a.balancePaisa, 0);

  const firstTrade = all.find((r) => r.revenue > 0 || r.orders > 0);

  /*  `funnel.items` is the WHOLE catalogue, sold or not — an unfiltered list
      would head the card "400 products" on a week that sold twelve, and would
      fill the table with rows of zero under the word "best selling".  */
  const sold = useMemo(
    () => (funnel?.items ?? []).filter((it) => it.units > 0 || it.revenuePaisa > 0),
    [funnel],
  );
  const products = useMemo(
    () => [...sold].sort((a, b) => b.revenuePaisa - a.revenuePaisa).slice(0, 8),
    [sold],
  );
  const prodMax = Math.max(1, ...products.map((x) => x.revenuePaisa));
  const soldRevenue = sold.reduce((t, it) => t + it.revenuePaisa, 0);

  const categories = useMemo(() => {
    const by = new Map<string, number>();
    for (const it of sold) {
      const key = it.categoryName ?? "No category";
      by.set(key, (by.get(key) ?? 0) + it.revenuePaisa);
    }
    return [...by.entries()]
      .map(([name, paisa]) => ({ name, paisa }))
      .filter((c) => c.paisa > 0)
      .sort((a, b) => b.paisa - a.paisa)
      .slice(0, 6);
  }, [sold]);
  const catMax = Math.max(1, ...categories.map((c) => c.paisa));

  const dotMax = Math.max(1, ...rows.map((r) => r.revenue));
  const soldDays = rows.filter((r) => r.revenue > 0).length;

  const newCustFig = dash?.business.supporting.find((sp) => sp.key === "newCustomers")?.value;
  const newCustomers = newCustFig && !newCustFig.unavailable ? newCustFig.value : null;

  const meta =
    chart === "sales"
      ? {
          title: "Sales, day by day",
          note: rows.length ? `${dayLabel(rows[0].date)} to ${dayLabel(rows[rows.length - 1].date)} - counted on the day the sale happened` : "",
          big: formatTaka(revenue),
          say: `came in over ${days} days, on ${traded} day${traded === 1 ? "" : "s"} that sold`,
        }
      : chart === "orders"
        ? {
            title: "Orders, day by day",
            note: "every order the shop took, however it came in",
            big: `${orders} orders`,
            say: orders ? `placed over ${days} days, ${formatTaka(Math.round(revenue / orders))} each on average` : `placed over ${days} days`,
          }
        : {
            title: "Profit on goods, day by day",
            note: "above the middle line the goods made money, below it they sold under cost",
            big: formatTaka(profit),
            say: `left after the cost of everything sold in these ${days} days`,
          };

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Radian"
        title="Business dashboard"
        desc="The whole shop on one page - the website, the counter, the money and what is still waiting to be done."
      />

      <div className="flex items-center justify-between gap-3.5 flex-wrap mb-4">
        <Seg<RangeDays>
          label="Period"
          value={days}
          onPick={setDays}
          options={[{ v: 7, label: "7 days" }, { v: 30, label: "30 days" }, { v: 90, label: "90 days" }]}
        />
        <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
          {rows.length
            ? `Showing ${dayLabel(rows[0].date)} to ${dayLabel(rows[rows.length - 1].date)}${
                firstTrade ? ` - the history on file starts trading on ${dayLabel(firstTrade.date)}` : ""
              }`
            : loading ? "Loading the shop's history…" : "No history to show yet"}
        </div>
      </div>

      {failed.length > 0 && (
        <div className="rounded-[14px] border px-5 py-3.5 mb-4 text-[12.5px]"
          style={{ background: "var(--s-warn)", borderColor: "var(--l-warn)", color: "var(--t-warn)" }}>
          Could not load {failed.join(", ")}. Everything else on this page is current.
        </div>
      )}

      <NowBar dash={dash} pos={pos} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-[18px]">
        <KpiCard
          icon="chart" iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Sales" value={formatTaka(revenue)}
          say={`What customers paid in these ${days} days. Money came in on ${traded} day${traded === 1 ? "" : "s"}.`}
          delta={<Delta now={revenue} before={before ? sum(before, (r) => r.revenue) : null} />}
        >
          <Spark rows={rows} pick={(r) => r.revenue} mode="area" />
        </KpiCard>

        <KpiCard
          icon="bag" iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Orders" value={String(orders)}
          say={orders
            ? `Orders placed in these ${days} days. Each one was ${formatTaka(Math.round(revenue / orders))} on average.`
            : `No orders were placed in these ${days} days.`}
          delta={<Delta now={orders} before={before ? sum(before, (r) => r.orders) : null} />}
        >
          <Spark rows={rows} pick={(r) => r.orders} mode="bars" />
        </KpiCard>

        <KpiCard
          icon="cash" iconBg="var(--s-bad)" iconColor="var(--t-bad)"
          label="Profit" value={formatTaka(profit)} negative={profit < 0}
          say={profit < 0
            ? "What is left after the cost of the goods. It is below zero, which means a cost price sits above a selling price."
            : "What is left after the cost of the goods sold."}
          delta={<Delta now={profit} before={before ? sum(before, (r) => r.profit) : null} />}
        >
          <Spark rows={rows} pick={(r) => r.profit} mode="diverge" />
        </KpiCard>

        <KpiCard
          icon="clock" iconBg="var(--s-warn)" iconColor="var(--t-warn)"
          label="Unpaid" value={due === null ? "—" : formatTaka(due)}
          say={ords
            ? `${ords.dueOrders} order${ords.dueOrders === 1 ? "" : "s"} still carry money. ${formatTaka(ords.collectedPaisa)} has already been collected.`
            : "Could not read what is still owed."}
          delta={<span className="ml-auto text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap"
            style={{ background: "var(--s-sunken)", color: "var(--t-faint)" }}>right now</span>}
        >
          <div className="px-[22px] pb-4">
            {paidShare === null ? null : (
              <>
                <div className="h-2.5 rounded-md flex overflow-hidden gap-[2px]" style={{ background: "var(--s-sunken)" }}>
                  <span style={{ flex: `0 1 ${paidShare}%`, background: "var(--t-ok)" }} />
                  <span style={{ flex: `0 1 ${100 - paidShare}%`, background: "var(--t-warn)" }} />
                </div>
                <div className="flex justify-between text-[10.5px] mt-[7px]" style={{ color: "var(--t-faint)" }}>
                  <span>paid {formatTaka(collected ?? 0)}</span>
                  <span>unpaid {formatTaka(due ?? 0)}</span>
                </div>
              </>
            )}
          </div>
        </KpiCard>
      </div>

      {/* the one chart, three answers */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-[18px] mb-[18px]">
        <div className="rounded-[16px] border px-6 py-[22px]"
          style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}>
          <div className="flex items-start justify-between gap-3.5 flex-wrap">
            <div>
              <h2 className="text-[15.5px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{meta.title}</h2>
              <p className="text-[12px] m-0 mt-1 leading-[1.5]" style={{ color: "var(--t-faint)" }}>{meta.note}</p>
            </div>
            <Seg<ChartKey>
              label="Which chart"
              value={chart}
              onPick={setChart}
              options={[{ v: "sales", label: "Sales" }, { v: "orders", label: "Orders" }, { v: "profit", label: "Profit" }]}
            />
          </div>

          <div className="flex items-baseline gap-3.5 flex-wrap mt-4">
            <div className="text-[27px] font-bold tabular-nums tracking-[-0.03em]"
              style={{ color: chart === "profit" && profit < 0 ? "var(--t-bad)" : "var(--t-main)" }}>
              {meta.big}
            </div>
            <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>{meta.say}</div>
          </div>

          {chart === "sales" ? <SalesChart rows={rows} />
            : chart === "orders" ? <OrdersChart rows={rows} />
            : <ProfitChart rows={rows} />}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card title="Jobs waiting to be done" note="Each of these stops an order from finishing">
            <div className="mt-4">
              {(dash?.today.lines ?? []).filter((l) => l.count > 0).length === 0 ? (
                <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                  {loading ? "Loading…" : "Nothing is waiting."}
                </p>
              ) : (
                (() => {
                  const live = (dash?.today.lines ?? []).filter((l) => l.count > 0);
                  const mx = Math.max(...live.map((l) => l.count));
                  return live.map((l) => (
                    <Link key={l.key} href={l.href} className="block">
                      <TrackRow
                        label={l.label}
                        value={String(l.count)}
                        width={(l.count / mx) * 100}
                        color={l.tone === "danger" ? "var(--t-bad)" : l.tone === "warn" ? "var(--t-warn)" : "var(--f-chart)"}
                      />
                    </Link>
                  ));
                })()
              )}
            </div>
          </Card>

          <Card title={ords ? `All ${ords.counts.all} orders` : "All orders"} note="What stage each order has reached">
            <div className="mt-4">
              {ords ? (() => {
                const bands: { label: string; n: number; color: string }[] = [
                  { label: "Placed, not moving", n: ords.counts.placed, color: "var(--f-chart)" },
                  { label: "Cancelled", n: ords.counts.cancelled, color: "var(--t-bad)" },
                  { label: "Delivered", n: ords.counts.delivered, color: "var(--t-ok)" },
                  { label: "Being fulfilled", n: ords.counts.fulfilling, color: "var(--f-chart)" },
                  { label: "Confirmed", n: ords.counts.confirmed, color: "var(--f-chart)" },
                ].filter((b) => b.n > 0);
                const mx = Math.max(1, ...bands.map((b) => b.n));
                return bands.map((b) => (
                  <TrackRow key={b.label} label={b.label} value={String(b.n)} width={(b.n / mx) * 100} color={b.color} />
                ));
              })() : (
                <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>{loading ? "Loading…" : "Could not read the order totals."}</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* what actually sold */}
      <div className="rounded-[16px] border px-6 py-[22px] mb-[18px]"
        style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[15.5px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>
              Best selling products, last {days} days
            </h2>
            <p className="text-[12px] m-0 mt-1 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
              {funnel
                ? sold.length === 0
                  ? "Nothing sold in this period."
                  : `${sold.length} product${sold.length === 1 ? "" : "s"} sold \u00b7 ${funnel.totals.units} units${sold.length > 8 ? " \u00b7 the top 8 are listed" : ""}`
                : sideState === "loading" ? "Loading\u2026" : "Could not read the product figures."}
            </p>
          </div>
          {funnel && sold.length > 0 ? (
            <div className="text-right">
              <div className="text-[20px] font-bold tabular-nums" style={{ color: "var(--t-main)" }}>
                {formatTaka(soldRevenue)}
              </div>
              {/*  deliberately NOT the same number as Sales above: this counts
                   lines on orders PLACED in the window and skips counter sales,
                   while Sales recognises money on the day it was earned.  */}
              <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                on orders placed in this period
              </div>
            </div>
          ) : null}
        </div>

        {products.length > 0 ? (
          <div className="overflow-x-auto mt-3.5">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr>
                  {["Product", "Units", "Orders", "Revenue", "Margin", "Share"].map((h, i) => (
                    <th key={h}
                      className={`text-[10px] uppercase tracking-[0.1em] font-bold py-[9px] px-2.5 border-b ${i === 0 || i === 5 ? "text-left" : "text-right"}`}
                      style={{ color: "var(--t-faint)", borderColor: "var(--l-soft)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((it) => (
                  <tr key={it.productId}>
                    <td className="py-[11px] px-2.5 border-b text-[12.5px]" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>
                      {it.name}
                    </td>
                    <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{it.units}</td>
                    <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{it.orders}</td>
                    <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{formatTaka(it.revenuePaisa)}</td>
                    <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums font-semibold"
                      style={{ borderColor: "var(--l-soft)", color: it.marginPaisa < 0 ? "var(--t-bad)" : "var(--t-ok)" }}>
                      {formatTaka(it.marginPaisa)}
                    </td>
                    <td className="py-[11px] px-2.5 border-b" style={{ borderColor: "var(--l-soft)" }}>
                      <span className="block h-[7px] rounded overflow-hidden" style={{ background: "var(--s-sunken)" }}>
                        <span className="block h-full rounded" style={{ width: `${(it.revenuePaisa / prodMax) * 100}%`, background: "var(--f-chart)" }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12.5px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
            {sideState === "loading" ? "Loading\u2026" : funnel ? "No product sold in this period." : "Could not read the product figures."}
          </p>
        )}
        {funnel && sold.length > 0 ? (
          <p className="text-[11.5px] mt-3.5 m-0 leading-[1.6]" style={{ color: "var(--t-faint)" }}>
            Counted on the day the order was placed, and website orders only \u2014 a counter bill carries no product line,
            so this total is not meant to match the Sales figure at the top.
          </p>
        ) : null}
      </div>

      {/* the whole business, not only the website */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.35fr] gap-[18px]">
        <Card title="Where the money sits" note="Every account the shop keeps money in - counter till, wallets, bank, gateway">
          <div className="mt-[18px]">
            {moneyAccounts.length === 0 ? (
              <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                {loading ? "Loading…" : "No money account is set up yet."}
              </p>
            ) : (
              [...moneyAccounts]
                .sort((a, b) => b.balancePaisa - a.balancePaisa)
                .map((a) => (
                  <TrackRow
                    key={a.id}
                    label={a.name}
                    value={formatTaka(a.balancePaisa)}
                    width={(Math.abs(a.balancePaisa) / accMax) * 100}
                    color={a.balancePaisa < 0 ? "var(--t-bad)" : a.balancePaisa ? "var(--f-chart)" : "var(--f-chart-dim)"}
                  />
                ))
            )}
          </div>

          <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-[13px] font-semibold" style={{ color: "var(--t-main)" }}>All accounts together</span>
            <b className="text-[21px] font-bold tabular-nums" style={{ color: "var(--t-main)" }}>
              {/*  a total is printed only when something really answered. A zero
                   here would be a claim that the shop holds no money.  */}
              {cash && !cash.unavailable
                ? formatTaka(cash.value)
                : moneyAccounts.length > 0 ? formatTaka(accTotal) : "—"}
            </b>
          </div>
          {spendable && !spendable.unavailable ? (
            <p className="text-[12px] mt-1.5 m-0 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
              Only {formatTaka(spendable.value)} of it is free to spend. The rest is held against orders that are not finished.
            </p>
          ) : null}
        </Card>

        <Card
          title="What the shop owns and is owed"
          note="The parts a website report never shows - the shelves, the till, and money in both directions"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-[18px]">
            <Stat
              label="Money still to collect"
              value={due === null ? "\u2014" : formatTaka(due)}
              tone={due !== null && due > 0 ? "warn" : undefined}
              note={ords ? `spread across ${ords.dueOrders} orders \u00b7 right now` : undefined}
            />
            <Stat
              label="Stock value"
              value={stock && !stock.unavailable ? formatTaka(stock.value) : "\u2014"}
              tone={stock && stock.value < 0 ? "bad" : undefined}
              note={stock && stock.value < 0 ? "below zero, so a cost price needs fixing" : "what the shelves are worth at cost"}
            />
            <Stat
              label="Goods that came back"
              value={rets ? formatTaka(rets.returnValuePaisa) : "\u2014"}
              note={rets
                ? `${rets.counts.all ?? 0} returns all time \u00b7 ${formatTaka(rets.refundPaisa)} refunded`
                : "could not read returns"}
            />
          </div>

          <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat
              label="At the counter today"
              value={pos ? String(pos.bills.count) : "\u2014"}
              note={pos
                ? `bills rung up \u00b7 ${formatTaka(pos.money.takenPaisa)} actually taken\n${pos.drawer.isOpen ? "the till is open" : "the till is closed"}`
                : "could not read the counter"}
            />
            <Stat
              label="Billed at the counter today"
              value={pos ? formatTaka(pos.bills.salesPaisa) : "\u2014"}
              note={pos && pos.bills.duePaisa > 0 ? `${formatTaka(pos.bills.duePaisa)} of it not collected` : "all of it collected"}
            />
            <Stat
              label="Owed to suppliers"
              value={payable && !payable.unavailable ? formatTaka(payable.value) : "\u2014"}
              tone={payable && !payable.unavailable && payable.value > 0 ? "warn" : undefined}
              note="right now, what the shop owes out"
            />
          </div>
        </Card>
      </div>

      {/* money, shelves, people */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-[18px] mt-[18px]">
        <Card title="Money on orders" note="What was billed, and what has actually moved">
          <div className="mt-4">
            {ords ? (() => {
              /*  the first three count DELIVERED orders only - the books post
                  revenue at delivery - while "unpaid" counts every order that is
                  not cancelled. Two populations, so each row names its own.  */
              const lines: { label: string; paisa: number; color: string }[] = [
                { label: "Billed on delivered orders", paisa: ords.revenuePaisa, color: "var(--f-chart)" },
                { label: "Collected on them", paisa: ords.collectedPaisa, color: "var(--t-ok)" },
                { label: "Refunded back out", paisa: ords.refundedPaisa, color: "var(--t-bad)" },
                { label: "Unpaid, across every open order", paisa: ords.duePaisa, color: "var(--t-warn)" },
              ];
              const mx = Math.max(1, ...lines.map((l) => l.paisa));
              return lines.map((l) => (
                <TrackRow key={l.label} label={l.label} value={formatTaka(l.paisa)} width={(l.paisa / mx) * 100} color={l.color} />
              ));
            })() : (
              <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>{loading ? "Loading\u2026" : "Could not read the order totals."}</p>
            )}
          </div>
          <p className="text-[11.5px] mt-4 m-0 leading-[1.6]" style={{ color: "var(--t-faint)" }}>
            The first three count delivered orders only; the last counts every order still open.
            They are different sets, so they are not meant to add up.
          </p>
        </Card>

        <Card title="Which category sells most" note={`Revenue by category, ${days} days`}>
          <div className="mt-4">
            {categories.length > 0 ? categories.map((c) => (
              <TrackRow key={c.name} label={c.name} value={formatTaka(c.paisa)} width={(c.paisa / catMax) * 100} color="var(--f-chart)" />
            )) : (
              <p className="text-[12.5px] m-0" style={{ color: "var(--t-faint)" }}>
                {funnel ? "Nothing sold in this period."
                  : sideState === "loading" ? "Loading\u2026"
                  : "Could not read the category figures."}
              </p>
            )}
          </div>

          <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
          <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--t-faint)" }}>
            Days the shop took money
          </div>
          <div className="grid gap-1.5 mt-3" style={{ gridTemplateColumns: `repeat(${Math.min(10, Math.max(1, rows.length))}, 1fr)` }}>
            {rows.map((r) => (
              <i key={r.date} title={`${dayLabel(r.date)} \u00b7 ${r.revenue ? formatTaka(r.revenue) : "nothing"}`}
                className="block rounded-[5px]"
                style={{
                  aspectRatio: "1",
                  background: r.revenue > 0 ? "var(--f-chart)" : "var(--f-chart-dim)",
                  opacity: r.revenue > 0 ? 0.3 + (r.revenue / dotMax) * 0.7 : 1,
                }} />
            ))}
          </div>
          <p className="text-[12px] mt-3 m-0 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            {rows.length === 0
              ? "The day-by-day history has not been read."
              : `${soldDays} of ${rows.length} days took money - counted on the day it was earned, so it does not match the category bars above.`}
          </p>
        </Card>

        <Card title="Customers and the counter" note="Customers, returns, and today at the till">
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Stat label="On the books" value={custTotal === null ? "\u2014" : String(custTotal)} note="customers in total" />
            <Stat label="New" value={newCustomers === null ? "\u2014" : String(newCustomers)} note="bought for the first time" />
            <Stat label="Returns" value={rets ? String(rets.counts.all ?? 0) : "\u2014"} note="all time" />
            <Stat label="Counter bills" value={pos ? String(pos.bills.count) : "\u2014"} note="rung up today" />
          </div>
          <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
          <Stat
            label="Owed to suppliers"
            value={payable && !payable.unavailable ? formatTaka(payable.value) : "\u2014"}
            tone={payable && !payable.unavailable && payable.value > 0 ? "warn" : undefined}
            note={payable && !payable.unavailable && due !== null
              ? `customers owe the shop ${formatTaka(due)} the other way`
              : undefined}
          />
        </Card>
      </div>

      {/* delivery */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.35fr] gap-[18px] mt-[18px]">
        <Card title="How delivery is going" note={`Deliveries in the last ${days} days`}>
          {deliv && (deliv.delivered + deliv.failed + deliv.inFlight) > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 mt-[18px]">
                <Stat
                  label="Arrived on time"
                  value={bp(deliv.onTimeBp)}
                  tone={deliv.onTimeBp !== null && deliv.onTimeBp < 8000 ? "warn" : undefined}
                  /*  an on-time rate without its denominator is the easiest lie on
                      the page: 2 of 2 reads as 100% beside 800 deliveries  */
                  note={deliv.measurable > 0
                    ? `of the ${deliv.measurable} deliver${deliv.measurable === 1 ? "y" : "ies"} that carried a promised time${
                        deliv.unmeasurable > 0 ? ` \u00b7 ${deliv.unmeasurable} had none` : ""}`
                    : "no delivery carried a promised time"}
                />
                <Stat label="Failed" value={bp(deliv.failedBp)} tone={deliv.failedBp !== null && deliv.failedBp > 0 ? "bad" : undefined} note={`${deliv.failed} of ${deliv.delivered + deliv.failed} that finished`} />
                <Stat label="Average door to door" value={hoursMins(deliv.avgMinutesToDeliver)} note="from leaving the shop" />
                <Stat label="On the road" value={String(deliv.inFlight)} note="right now - not this period" />
              </div>

              <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
              <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--t-faint)" }}>
                What delivery earned
              </div>
              {(() => {
                /*  the bar is ONE whole: what was charged. The amber part is what
                    the riders took out of it, the green part is what stayed.
                    Drawing cost under the word "charged" had it exactly backwards.  */
                const charged = deliv.chargedPaisa, cost = deliv.costPaisa;
                const over = cost > charged;
                const costShare = charged > 0 ? Math.min(100, (cost / charged) * 100) : cost > 0 ? 100 : 0;
                return (
                  <>
                    <div className="flex justify-between text-[12.5px] mt-2.5" style={{ color: "var(--t-main)" }}>
                      <span>Charged to customers <b className="tabular-nums">{formatTaka(charged)}</b></span>
                      <span>Paid to riders <b className="tabular-nums">{formatTaka(cost)}</b></span>
                    </div>
                    <div className="h-2.5 rounded-md flex overflow-hidden mt-2.5 gap-[2px]" style={{ background: "var(--s-sunken)" }}>
                      <span style={{ flex: `0 1 ${costShare}%`, background: over ? "var(--t-bad)" : "var(--t-warn)" }} />
                      <span style={{ flex: `0 1 ${100 - costShare}%`, background: "var(--t-ok)" }} />
                    </div>
                    <div className="flex gap-4 flex-wrap mt-2 text-[11px]" style={{ color: "var(--t-faint)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: over ? "var(--t-bad)" : "var(--t-warn)" }} />
                        paid to riders
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: "var(--t-ok)" }} />
                        left over
                      </span>
                    </div>
                    <p className="text-[12px] mt-2.5 m-0 leading-[1.5]" style={{ color: "var(--t-faint)" }}>
                      {charged === 0 && cost === 0
                        ? "No delivery charge was taken or paid in this period."
                        : over
                          ? `${formatTaka(Math.abs(deliv.marginPaisa))} short - delivery costs more than it charges.`
                          : `${formatTaka(deliv.marginPaisa)} left over - delivery pays for itself.`}
                    </p>
                  </>
                );
              })()}
            </>
          ) : (
            <p className="text-[12.5px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
              {sideState === "loading" ? "Loading\u2026"
                : deliv ? "No delivery in this period."
                : "Could not read the delivery figures."}
            </p>
          )}
        </Card>

        <Card title="Riders" note="Who delivers, and who delivers on time">
          {deliv && deliv.byCarrier.length > 0 ? (
            <div className="overflow-x-auto mt-3.5">
              <table className="w-full border-collapse min-w-[520px]">
                <thead>
                  <tr>
                    {["Rider", "Delivered", "Measured", "On time", "Paid"].map((h, i) => (
                      <th key={h}
                        className={`text-[10px] uppercase tracking-[0.1em] font-bold py-[9px] px-2.5 border-b ${i === 0 ? "text-left" : "text-right"}`}
                        style={{ color: "var(--t-faint)", borderColor: "var(--l-soft)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...deliv.byCarrier].sort((a, b) => b.delivered - a.delivered).map((c) => {
                    const pct = c.onTimeBp === null || c.measurable === 0 ? null : c.onTimeBp / 100;
                    const col = pct === null ? "var(--t-faint)" : pct >= 80 ? "var(--t-ok)" : pct >= 50 ? "var(--t-warn)" : "var(--t-bad)";
                    return (
                      <tr key={c.name}>
                        <td className="py-[11px] px-2.5 border-b text-[12.5px]" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{c.name}</td>
                        <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{c.delivered}</td>
                        {/*  how many of those deliveries could be judged at all - a
                            rate off 1 delivery is not the same claim as off 50  */}
                        <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-faint)" }}>{c.measurable}</td>
                        <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums font-semibold" style={{ borderColor: "var(--l-soft)", color: col }}>
                          {c.measurable > 0 ? bp(c.onTimeBp) : "not measured"}
                        </td>
                        <td className="py-[11px] px-2.5 border-b text-[12.5px] text-right tabular-nums" style={{ borderColor: "var(--l-soft)", color: "var(--t-main)" }}>{formatTaka(c.costPaisa)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12.5px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
              {sideState === "loading" ? "Loading\u2026"
                : deliv ? "No rider has carried a delivery in this period."
                : "Could not read the rider figures."}
            </p>
          )}
        </Card>
      </div>

      <p className="text-[11.5px] leading-[1.65] mt-5 m-0" style={{ color: "var(--t-faint)" }}>
        {dash?.meta.generatedAt
          ? `Read from the shop at ${new Date(dash.meta.generatedAt).toLocaleString("en-GB", { hour12: false })}. `
          : ""}
        Sales by day come from the nightly business history, so the last day or two can still be filling in. Cash,
        what is owed and what is in the till are read live and do not move with the period filter.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP } from "./DeliveryUI";
import {
  formatTaka,
  getIntelDashboard, getIntelHistory,
  orderStats, financeAccounts, returnStats, posDay,
  getCatalogFunnel, deliveryPerformance, listCustomers, posItemsSold, attendanceSheet,
  type IntelDashboard, type IntelHistory,
  type ApiOrderStats, type ApiFinanceAccount, type ReturnStats, type ApiPosDay,
  type ApiCatalogFunnel, type ApiDeliveryAnalytics, type ApiItemsSold,
  type ApiAttendanceSheet, type ReportWindow,
} from "../_data/api";

/*  BUSINESS DASHBOARD — the whole shop on one page.

    FOUR RULES THIS PAGE KEEPS. They were all learned by getting them wrong.

    1. EVERY FIGURE SAYS WHICH SHOP IT COUNTS. A counter bill is an Order with
       `fulfillmentType = COUNTER`, and `/orders/stats` filters those out unless
       asked. So the page asked twice - once with the counter and once without -
       and every card that can be split prints the two halves under its number.
       One page quietly mixing "website only" with "the whole business" is how
       an owner plans against a number that was never true.

    2. A LABEL IS BETTER THAN A SENTENCE. There is no explanatory paragraph
       under a figure. If a number needs a paragraph, the number is wrong or the
       card is. Names carry the meaning; the eye reads a name, not prose.

    3. THE PERIOD IS THE READER'S, NOT THE SERVER'S. Today, yesterday, 7 / 30 /
       90 days, or any two dates. Every windowed endpoint here takes the exact
       dates, so a card headed "4 Sep to 10 Sep" is measured on those days -
       never a day count that lands somewhere near them. Figures that are only
       true at this instant - cash, what is owed, what is in the till - carry a
       "now" mark and do not move with the filter.

    4. NOTHING IS INVENTED. Every number comes from an endpoint. Where one could
       not be read the card says so, because a zero is a claim about the shop.  */

/* ─────────────────────────── dates ─────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dhaka is UTC+6 and the shop's day is Dhaka's day, not the browser's. */
const BD_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;

/** YYYY-MM-DD for the Dhaka day `back` days before today */
function bdDay(back = 0): string {
  return new Date(Date.now() + BD_OFFSET_MS - back * DAY_MS).toISOString().slice(0, 10);
}
/** "2026-09-02" -> "2 Sep" */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`;
}
function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1);
}

type RangeKey = "today" | "yesterday" | "d7" | "d30" | "d90" | "custom";
interface Range { key: RangeKey; from: string; to: string }

function presetRange(key: Exclude<RangeKey, "custom">): Range {
  if (key === "today") return { key, from: bdDay(0), to: bdDay(0) };
  if (key === "yesterday") return { key, from: bdDay(1), to: bdDay(1) };
  const back = key === "d7" ? 6 : key === "d30" ? 29 : 89;
  return { key, from: bdDay(back), to: bdDay(0) };
}

/* ─────────────────────────── numbers ─────────────────────────── */

/** basis points -> "60 %". null stays "—": not measured is not zero. */
function bp(v: number | null): string {
  return v === null ? "—" : `${(v / 100).toFixed(1).replace(/\.0$/, "")} %`;
}
/** 554 minutes -> "9 h 14 m" */
function hoursMins(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} m`;
}
/**
 * A paisa amount as an axis label.
 *
 * The gridlines are quarters of a round paisa step, so they are very often NOT
 * whole thousands of taka. Rounding them to "3k" put the label 20% away from
 * the line it sat on, and every value read off the chart was then wrong.
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

interface Row { date: string; revenue: number; orders: number; profit: number }
function sum(rows: Row[], pick: (r: Row) => number): number {
  return rows.reduce((t, r) => t + pick(r), 0);
}

/* ─────────────────────────── small pieces ─────────────────────────── */

/*  A TONE IS A PAIR, NEVER A COLOUR. Every icon tile takes its fill and its
    ink from one of these, so a tile can never end up with ink the same shade
    as the fill it sits on - which is what happens the moment somebody writes a
    hex value into a card.  */
const TONES = {
  accent: { bg: "var(--s-accent)", fg: "var(--t-accent)" },
  orchid: { bg: "var(--s-orchid)", fg: "var(--t-orchid)" },
  ok:     { bg: "var(--s-ok)",     fg: "var(--t-ok)" },
  warn:   { bg: "var(--s-warn)",   fg: "var(--t-warn)" },
  bad:    { bg: "var(--s-bad)",    fg: "var(--t-bad)" },
  info:   { bg: "var(--s-info)",   fg: "var(--t-info)" },
} as const;
type Tone = keyof typeof TONES;

function Tile({ icon, tone }: { icon: string; tone: Tone }) {
  const t = TONES[tone];
  return (
    <span className="biz-tile"
      style={{ background: `color-mix(in srgb, ${t.fg} 16%, transparent)` }}>
      <Icon name={icon} size={18} style={{ color: t.fg }} />
    </span>
  );
}

function Card({ title, icon, tone = "accent", right, children }: {
  title: string; icon?: string; tone?: Tone; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="biz-panel px-6 py-[22px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {icon ? <Tile icon={icon} tone={tone} /> : null}
          <h2 className="text-[16px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** a scope mark: which shop a figure counts. Two words, never a sentence. */
function Scope({ text, tone = "quiet" }: { text: string; tone?: "quiet" | "now" }) {
  if (tone === "now") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-[4px] rounded-full whitespace-nowrap"
        style={{ background: "var(--s-info)", color: "var(--t-info)" }}>
        {text}
      </span>
    );
  }
  /*  a quiet scope is a caption, not a badge: four pills in a row of four
      cards read as buttons and pulled the eye off the figures  */
  return (
    <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--t-faint)" }}>{text}</span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "bad" | "ok" }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--t-faint)" }}>{label}</div>
      <div className="text-[24px] font-bold tabular-nums mt-2"
        style={{ color: tone === "bad" ? "var(--t-bad)" : tone === "warn" ? "var(--t-warn)" : tone === "ok" ? "var(--t-ok)" : "var(--t-main)" }}>
        {value}
      </div>
      {sub ? <div className="text-[11.5px] mt-1 leading-[1.45]" style={{ color: "var(--t-faint)" }}>{sub}</div> : null}
    </div>
  );
}

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

function Chip({ tone, children }: { tone: "ok" | "bad" | "warn" | "mute"; children: React.ReactNode }) {
  const st =
    tone === "ok" ? { background: "var(--s-ok)", color: "var(--t-ok)" }
    : tone === "bad" ? { background: "var(--s-bad)", color: "var(--t-bad)" }
    : tone === "warn" ? { background: "var(--s-warn)", color: "var(--t-warn)" }
    : { background: "var(--s-sunken)", color: "var(--t-faint)" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={st}>
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: "currentColor" }} />
      {children}
    </span>
  );
}

function Seg<T extends string>({ value, options, onPick, label }:
  { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex p-[3px] gap-[2px] rounded-full border" role="group" aria-label={label}
      style={{ background: "var(--s-raised)", borderColor: "var(--l-soft)" }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" aria-pressed={on} onClick={() => onPick(o.v)}
            className="text-[12.5px] font-semibold px-[15px] py-[7px] rounded-full transition-colors"
            style={on
              ? { background: "var(--s-pill-on)", color: "var(--t-pill-on)" }
              : { background: "transparent", color: "var(--t-soft)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Table({ head, children, min = 560 }: { head: { label: string; right?: boolean }[]; children: React.ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto mt-3.5">
      <table className="w-full border-collapse" style={{ minWidth: min }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label}
                className={`text-[10px] uppercase tracking-[0.1em] font-bold py-[9px] px-2.5 border-b ${h.right ? "text-right" : "text-left"}`}
                style={{ color: "var(--t-faint)", borderColor: "var(--l-soft)" }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, right, color, bold }: { children: React.ReactNode; right?: boolean; color?: string; bold?: boolean }) {
  return (
    <td className={`py-[11px] px-2.5 border-b text-[12.5px] ${right ? "text-right tabular-nums" : ""} ${bold ? "font-semibold" : ""}`}
      style={{ borderColor: "var(--l-soft)", color: color ?? "var(--t-main)" }}>
      {children}
    </td>
  );
}

function Empty({ state, empty, error }: { state: "loading" | "ok" | "error"; empty: string; error: string }) {
  return (
    <p className="text-[12.5px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
      {state === "loading" ? "Loading…" : state === "error" ? error : empty}
    </p>
  );
}

/* ─────────────────────────── the charts ─────────────────────────── */

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

/** the small chart at the foot of a card */
function Spark({ rows, pick, mode }: { rows: Row[]; pick: (r: Row) => number; mode: "area" | "bars" | "diverge" }) {
  const W = 200, H = 44;
  if (rows.length === 0) return <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-[44px]" />;
  const step = W / rows.length;
  const bw = Math.max(1.2, step * 0.64);

  if (mode === "diverge") {
    const mx = Math.max(...rows.map((r) => Math.abs(pick(r)))) || 1, mid = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
        {rows.map((r, i) => {
          const v = pick(r), bh = v ? Math.max(1.5, (Math.abs(v) / mx) * (H / 2 - 2)) : 1.2;
          return <rect key={i} x={i * step + step * 0.18} y={v >= 0 ? mid - bh : mid} width={bw} height={bh} rx={0.8}
            fill={v > 0 ? "var(--t-ok)" : v < 0 ? "var(--t-bad)" : "var(--f-chart-dim)"} />;
        })}
      </svg>
    );
  }
  if (mode === "bars") {
    const mx = Math.max(...rows.map(pick)) || 1;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
        {rows.map((r, i) => {
          const v = pick(r), bh = v ? Math.max(2, (v / mx) * (H - 5)) : 1.5;
          return <rect key={i} x={i * step + step * 0.18} y={H - bh} width={bw} height={bh} rx={0.8}
            fill={v ? "var(--f-chart)" : "var(--f-chart-dim)"} opacity={v ? 0.72 : 1} />;
        })}
      </svg>
    );
  }
  const mx = Math.max(...rows.map(pick)) || 1;
  const pts = rows.map((r, i) => [step * (i + 0.5), H - 3 - (pick(r) / mx) * (H - 9)] as const);
  const d = smooth(pts);
  const id = `sp-${rows.length}-${Math.round(mx)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
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

const CW = 760, CH = 250, CL = 56, CR = 10, CT = 16, CB = 30;
const PW = CW - CL - CR, PH = CH - CT - CB;

interface HoverAt { i: number; x: number }

function useHover(rows: Row[]) {
  const box = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<HoverAt | null>(null);
  const step = rows.length ? PW / rows.length : PW;

  /*  the charts stay mounted when the period changes, so an index picked on a
      longer window would draw a crosshair off the plot and an empty tooltip  */
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
    <div className="absolute pointer-events-none rounded-[10px] px-3 py-[9px] text-[11.5px] leading-[1.55] whitespace-nowrap z-10"
      style={{ left: at.x, top: (CT / CH) * 100 + "%", transform: "translate(-50%,-110%)",
        background: "var(--t-main)", color: "var(--s-card)", boxShadow: "var(--elev-lift)" }}>
      {lines}
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

function Grid({ steps, label }: { steps: number; label: (g: number) => string }) {
  return (
    <>
      {Array.from({ length: steps + 1 }, (_, g) => {
        const y = CT + PH - (PH * g) / steps;
        return (
          <g key={g}>
            <line x1={CL} x2={CW - CR} y1={y} y2={y} stroke={g ? "var(--l-soft)" : "var(--l-strong)"} strokeWidth={1} />
            <text x={CL - 10} y={y + 3.5} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">
              {label(g)}
            </text>
          </g>
        );
      })}
    </>
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
        <Grid steps={4} label={(g) => axisTaka((nice * g) / 4)} />
        {rows.length > 0 && (
          <>
            <path d={`${line} L${pts[pts.length - 1][0].toFixed(1)} ${CT + PH} L${pts[0][0].toFixed(1)} ${CT + PH} Z`} fill="url(#bd-sales)" />
            <path d={line} fill="none" stroke="var(--f-chart)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            {rows.map((r, i) => r.revenue ? (
              <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={i === best ? 5 : 2.8}
                fill={i === best ? "var(--s-card)" : "var(--f-chart)"}
                stroke={i === best ? "var(--t-ok)" : "none"} strokeWidth={i === best ? 2.5 : 0} />
            ) : null)}
            {rows[best].revenue > 0 && rows.length > 1 && (
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
          <b className="tabular-nums">{formatTaka(rows[at.i].revenue)}</b><br />
          <span style={{ opacity: 0.65 }}>{rows[at.i].orders} order{rows[at.i].orders === 1 ? "" : "s"}</span>
        </>
      ) : null} />
    </div>
  );
}

function OrdersChart({ rows }: { rows: Row[] }) {
  const { box, at, setAt, onMove, step } = useHover(rows);
  const max = Math.max(...rows.map((r) => r.orders), 0) || 1;
  const bw = Math.max(2.5, Math.min(22, step - 3));
  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label="Orders each day">
        <defs>
          <linearGradient id="bd-orders" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <Grid steps={4} label={(g) => String(Math.round((max * g) / 4))} />
        {rows.map((r, i) => {
          const bh = r.orders ? Math.max(4, (r.orders / max) * PH) : 3;
          return <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={CT + PH - bh} width={bw} height={bh}
            rx={Math.min(3.5, bw / 2)} fill={r.orders ? "url(#bd-orders)" : "var(--f-chart-dim)"} />;
        })}
        <Axis rows={rows} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--f-chart)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>
      <Tip at={at} lines={at && rows[at.i] ? (
        <>
          <span style={{ opacity: 0.65 }}>{dayLabel(rows[at.i].date)}</span><br />
          <b className="tabular-nums">{rows[at.i].orders}</b> order{rows[at.i].orders === 1 ? "" : "s"}
        </>
      ) : null} />
    </div>
  );
}

function ProfitChart({ rows }: { rows: Row[] }) {
  const { box, at, setAt, onMove, step } = useHover(rows);
  const max = Math.max(...rows.map((r) => Math.abs(r.profit)), 0) || 1;
  const bw = Math.max(2.5, Math.min(22, step - 3));
  const mid = CT + PH / 2;
  const up = rows.filter((r) => r.profit > 0).length;
  const down = rows.filter((r) => r.profit < 0).length;
  const flat = rows.length - up - down;
  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label="Profit each day">
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
          <line key={i} x1={CL} x2={CW - CR} y1={y} y2={y} stroke={i === 1 ? "var(--l-strong)" : "var(--l-soft)"} strokeWidth={1} />
        ))}
        <text x={CL - 10} y={CT + 4} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">{`+${axisTaka(max)}`}</text>
        <text x={CL - 10} y={mid + 3.5} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">0</text>
        <text x={CL - 10} y={CT + PH} textAnchor="end" className="text-[10.5px] font-semibold" fill="var(--t-faint)">{`-${axisTaka(max)}`}</text>
        {rows.map((r, i) => {
          const bh = r.profit ? Math.max(3.5, (Math.abs(r.profit) / max) * (PH / 2)) : 3;
          return <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={r.profit >= 0 ? mid - bh : mid}
            width={bw} height={bh} rx={Math.min(3, bw / 2)}
            fill={r.profit > 0 ? "url(#bd-up)" : r.profit < 0 ? "url(#bd-down)" : "var(--f-chart-dim)"} />;
        })}
        <Axis rows={rows} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--t-ok)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>
      <Tip at={at} lines={at && rows[at.i] ? (
        <>
          <span style={{ opacity: 0.65 }}>{dayLabel(rows[at.i].date)}</span><br />
          <b className="tabular-nums">{formatTaka(rows[at.i].profit)}</b>
        </>
      ) : null} />
      <div className="flex gap-2.5 flex-wrap mt-4">
        <Chip tone="ok">{`earned · ${up} day${up === 1 ? "" : "s"}`}</Chip>
        <Chip tone="bad">{`sold under cost · ${down} day${down === 1 ? "" : "s"}`}</Chip>
        <Chip tone="mute">{`nothing recorded · ${flat} day${flat === 1 ? "" : "s"}`}</Chip>
      </div>
    </div>
  );
}

/* ─────────────────────────── the "today" strip ─────────────────────────── */

const JOB_TONE: Record<string, "bad" | "warn" | "mute"> = { danger: "bad", warn: "warn", info: "mute", ok: "mute" };

/*  THE CHIP WORDING THE OWNER ASKED FOR, over the server's own label.
    The server names each job in its own words; the owner's design names the
    same five jobs slightly differently. Only the WORDING is changed here -
    the key, the count and the link are the server's, and a job this map has
    never heard of keeps the label it arrived with, so a new job added on the
    API side still reads correctly the day it appears.  */
const JOB_NAME: Record<string, string> = {
  "Orders being prepared": "Orders waiting to prepare",
  "Deliveries with no rider": "Deliveries without rider",
  "Items running low": "Low stock items",
  "Items showing negative stock": "Negative stock items",
};
const jobName = (label: string) => JOB_NAME[label] ?? label;

/*  Today is not a row of numbers among other numbers: it is the only part of
    the page that can still be changed by walking across the shop. So it gets
    its own band - dark, above the fold, the live figures large on the left and
    every job that is actually waiting as a clickable pill on the right. A job
    reading zero is not shown at all; a bar of zeros teaches the eye to skip
    the bar, and the one row that mattered is skipped with it.  */
function TodayBand({ dash, pos, counter }: {
  dash: IntelDashboard | null;
  pos: ApiPosDay | null;
  counter: { orders: number } | null;
}) {
  const jobs = (dash?.today.lines ?? []).filter((l) => l.count > 0);
  /*  the live work list, never `/orders/stats` - that one filters on placedAt,
      so a parcel out on the road since yesterday disappeared the moment the
      reader picked "Today" on a band headed "live"  */
  const onRoad = (dash?.today.lines ?? []).find((l) => l.key === "outForDelivery")?.count ?? null;
  const web = dash?.today.ordersToday ?? null;
  const till = pos?.money.takenPaisa ?? null;

  /*  NO COMPARISON ON A LIVE FIGURE. The design this was drawn from put
      "vs previous 30 days" under today's order count, and that is two
      populations in one sentence: today against a month. A live number gets a
      live mark and nothing else - the period figures below are where a
      comparison belongs.  */
  return (
    <div className="biz-panel overflow-hidden mb-[18px]"
      style={{ background: "var(--s-accent)", borderColor: "var(--l-accent)" }}>
      <div className="flex flex-wrap items-stretch">

        {/* the three live figures */}
        <div className="flex flex-wrap items-start gap-y-6 px-5 py-5 flex-1" style={{ minWidth: 280 }}>
          <div className="pr-5">
            <div className="flex items-center gap-3">
              <Tile icon="sparkle" tone="accent" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold" style={{ color: "var(--t-main)" }}>Live today</span>
                  <span className="w-[8px] h-[8px] rounded-full" style={{ background: "var(--t-live)", boxShadow: "0 0 0 3px var(--s-ok)" }} />
                </div>
                <div className="text-[12.5px] mt-[5px]" style={{ color: "var(--t-soft)" }}>
                  {new Date(`${bdDay(0)}T00:00:00Z`).toLocaleDateString("en-GB",
                    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                </div>
              </div>
            </div>
            <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>Live from your shop</div>
          </div>

          <div className="pl-5 pr-5 border-l flex items-start gap-2.5" style={{ borderColor: "var(--l-accent)" }}>
            <Tile icon="cart" tone="orchid" />
            <div>
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--t-soft)" }}>Online orders</div>
              <div className="text-[30px] font-bold tabular-nums leading-none mt-[9px] tracking-[-0.03em]"
                style={{ color: (web ?? 0) > 0 ? "var(--t-main)" : "var(--t-faint)" }}>
                {web === null ? "—" : web}
              </div>
              <div className="text-[11.5px] mt-2" style={{ color: "var(--t-faint)" }}>so far today</div>
            </div>
          </div>

          <div className="pl-5 pr-5 border-l flex items-start gap-2.5" style={{ borderColor: "var(--l-accent)" }}>
            <Tile icon="register" tone="info" />
            <div>
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--t-soft)" }}>Counter sales</div>
              <div className="text-[30px] font-bold tabular-nums leading-none mt-[9px] tracking-[-0.03em]"
                style={{ color: (pos?.bills.count ?? 0) > 0 ? "var(--t-main)" : "var(--t-faint)" }}>
                {pos === null ? "—" : pos.bills.count}
              </div>
              <div className="text-[11.5px] mt-2 tabular-nums" style={{ color: "var(--t-faint)" }}>
                {till === null ? "so far today" : `${formatTaka(till)} taken`}
              </div>
            </div>
          </div>

          <div className="pl-5 border-l flex items-start gap-2.5" style={{ borderColor: "var(--l-accent)" }}>
            <Tile icon="truck" tone="ok" />
            <div>
              <div className="text-[12.5px] font-semibold" style={{ color: "var(--t-soft)" }}>Out for delivery</div>
              <div className="text-[30px] font-bold tabular-nums leading-none mt-[9px] tracking-[-0.03em]"
                style={{ color: (onRoad ?? 0) > 0 ? "var(--t-main)" : "var(--t-faint)" }}>
                {onRoad === null ? "—" : onRoad}
              </div>
              <div className="text-[11.5px] mt-2" style={{ color: "var(--t-faint)" }}>on the road right now</div>
            </div>
          </div>
        </div>

        {/* what is waiting */}
        <div className="px-6 py-5 border-t xl:border-t-0 xl:border-l w-full xl:w-auto xl:max-w-[44%]"
          style={{ borderColor: "var(--l-accent)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Tile icon="alert" tone={jobs.length > 0 ? "bad" : "ok"} />
              <div>
                <div className="text-[15px] font-semibold" style={{ color: "var(--t-main)" }}>Needs your attention</div>
                <div className="text-[11.5px] mt-[5px]" style={{ color: "var(--t-faint)" }}>
                  {dash ? (jobs.length === 0 ? "nothing is waiting" : "tap one to open it") : "reading your shop…"}
                </div>
              </div>
            </div>
            {jobs.length > 0 ? (
              <Link href="/orders/list" className="text-[12.5px] font-semibold whitespace-nowrap hover:underline"
                style={{ color: "var(--t-accent)" }}>
                View all →
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 mt-3.5">
            {jobs.length === 0 ? (
              <span className="text-[12.5px]" style={{ color: "var(--t-faint)" }}>
                {dash ? "Nothing is waiting." : "Loading…"}
              </span>
            ) : jobs.map((l) => {
              const tone = JOB_TONE[l.tone] ?? "mute";
              const st = tone === "bad" ? { background: "var(--s-bad)", color: "var(--t-bad)", borderColor: "var(--l-bad)" }
                : tone === "warn" ? { background: "var(--s-warn)", color: "var(--t-warn)", borderColor: "var(--l-warn)" }
                : { background: "var(--s-card)", color: "var(--t-soft)", borderColor: "var(--l-soft)" };
              return (
                <Link key={l.key} href={l.href}
                  className="inline-flex items-center gap-2 rounded-full border pl-3 pr-2 py-[6px] text-[12px] font-medium transition-transform hover:-translate-y-[1px]"
                  style={st}>
                  {jobName(l.label)}
                  <b className="tabular-nums text-[13px] font-bold px-[7px] py-[1px] rounded-full"
                    style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }}>
                    {l.count}
                  </b>
                </Link>
              );
            })}
          </div>
          {counter && counter.orders > 0 ? (
            <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>
              {counter.orders} counter bill{counter.orders === 1 ? "" : "s"} are not in the website order list.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── the date filter ─────────────────────────── */

/** what the chosen period is CALLED, under the dates it resolves to */
const PERIOD_NAME: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  d7: "Last 7 days",
  d30: "Last 30 days",
  d90: "Last 90 days",
  custom: "Dates you chose",
};

/** dd Mmm yyyy, read as a Dhaka day rather than in the reader's own zone */
function longDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/**
 * THE CLOCK IS SET AFTER MOUNT, NOT DURING RENDER.
 *
 * `new Date()` in a render body is a different value on the server than in the
 * browser, which React reports as a hydration mismatch and then quietly
 * replaces - so the first paint carries no time at all and the tick fills it
 * in. It re-reads every fifteen seconds, which is as often as a minute clock
 * can matter.
 */
function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ClockPill() {
  const now = useClock();
  return (
    <div className="flex items-center gap-3 pl-1 pr-2">
      <Tile icon="clock" tone="accent" />
      <div>
        <div className="text-[16px] font-bold tabular-nums leading-none" style={{ color: "var(--t-main)" }}>
          {now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase() : "—"}
        </div>
        <div className="text-[11.5px] mt-[5px]" style={{ color: "var(--t-faint)" }}>
          {now
            ? new Date(`${bdDay(0)}T00:00:00Z`).toLocaleDateString("en-GB",
              { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
            : ""}
        </div>
      </div>
    </div>
  );
}

function RangeBar({ range, onPick }: { range: Range; onPick: (r: Range) => void }) {
  const [openCustom, setOpenCustom] = useState(range.key === "custom");
  const presets: { v: RangeKey; label: string }[] = [
    { v: "today", label: "Today" },
    { v: "yesterday", label: "Yesterday" },
    { v: "d7", label: "7 days" },
    { v: "d30", label: "30 days" },
    { v: "d90", label: "90 days" },
    { v: "custom", label: "Pick dates" },
  ];
  return (
    <div className="flex items-start justify-end gap-3 flex-wrap">
      {/*  THE PERIOD, SPELLED OUT. The presets say which button is pressed;
           this says what that button actually resolved to, which is the thing
           every figure below is measured over. The width is PINNED so the row
           does not jump when "Today" gives way to a two-date span.  */}
      <button type="button" onClick={() => setOpenCustom((o) => !o)}
        aria-expanded={openCustom}
        className="biz-panel flex items-center gap-3 px-4 py-[10px] text-left transition-colors"
        style={{ minWidth: 268 }}
        title="Pick your own dates">
        <Tile icon="grid" tone="orchid" />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold tabular-nums" style={{ color: "var(--t-main)" }}>
            {range.from === range.to ? longDay(range.from) : `${longDay(range.from)} — ${longDay(range.to)}`}
          </span>
          <span className="block text-[11.5px] mt-[3px]" style={{ color: "var(--t-faint)" }}>
            {PERIOD_NAME[range.key]}
            {range.from !== range.to ? ` · ${daysBetween(range.from, range.to)} days` : ""}
          </span>
        </span>
        <Icon name="chevronDown" size={16}
          style={{ color: "var(--t-faint)", flex: "none",
            transform: openCustom ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>

      {/*  the clock and the presets share ONE panel, so the strip reads as two
           blocks rather than three loose pieces  */}
      <div className="biz-panel flex items-center gap-3 px-3 py-[7px] flex-wrap">
        <ClockPill />
        <span className="w-px self-stretch" style={{ background: "var(--l-soft)" }} />
        <Seg<RangeKey>
          label="Period"
          value={range.key}
          options={presets}
          onPick={(v) => {
            if (v === "custom") { setOpenCustom(true); onPick({ ...range, key: "custom" }); return; }
            setOpenCustom(false);
            onPick(presetRange(v));
          }}
        />
        {openCustom || range.key === "custom" ? (
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-[5px]"
            style={{ background: "var(--s-card)", borderColor: "var(--l-soft)" }}>
            {/*  a typed out-of-range date still fires onChange in Chrome, so
                  the order is fixed here rather than trusted to min/max: only
                  365 days of history are held, and from never passes to  */}
            <input type="date" value={range.from} min={bdDay(364)} max={range.to}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const from = v < bdDay(364) ? bdDay(364) : v > range.to ? range.to : v;
                onPick({ key: "custom", from, to: range.to });
              }}
              className="bg-transparent border-0 outline-none text-[12.5px] font-semibold tabular-nums"
              style={{ color: "var(--t-main)" }} aria-label="From" />
            <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>to</span>
            <input type="date" value={range.to} min={range.from} max={bdDay(0)}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const to = v > bdDay(0) ? bdDay(0) : v < range.from ? range.from : v;
                onPick({ key: "custom", from: range.from, to });
              }}
              className="bg-transparent border-0 outline-none text-[12.5px] font-semibold tabular-nums"
              style={{ color: "var(--t-main)" }} aria-label="To" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────── a headline card ─────────────────────────── */

function Delta({ now, before }: { now: number | null; before: number | null }) {
  let cls = "flat", text = "no earlier period";
  /*  a null `now` is "not read yet", not zero - it used to render a red
      "down 100%" beside a value of "-"  */
  if (now !== null && before !== null) {
    if (now === before) { text = "no change"; }
    else if (before === 0) { cls = now > 0 ? "up" : "down"; text = now > 0 ? "nothing before" : "down from nothing"; }
    else {
      const pc = Math.round(((now - before) / Math.abs(before)) * 100);
      cls = now > before ? "up" : "down";
      text = `${now > before ? "↑" : "↓"} ${Math.abs(pc)}%`;
    }
  }
  /*  nothing read yet means NO badge - an empty pill still draws a box the
      eye stops on  */
  if (now === null) return null;
  const st = cls === "up" ? { background: "var(--s-ok)", color: "var(--t-ok)" }
    : cls === "down" ? { background: "var(--s-bad)", color: "var(--t-bad)" }
    : { background: "var(--s-sunken)", color: "var(--t-faint)" };
  return (
    <span className="ml-auto text-[11px] font-bold px-2.5 py-[4px] rounded-full whitespace-nowrap" style={st}>{text}</span>
  );
}

/*  The split line is the answer to the owner's own question - "is this the
    website only, or the shop too?" - given as data rather than a sentence.
    It is only drawn where the two halves come from ONE definition, counted the
    same way on both sides; a split whose halves mean different things would be
    worse than no split at all.  */
function SplitLine({ web, counter, fmt }: { web: number | null; counter: number | null; fmt: (n: number) => string }) {
  if (web === null || counter === null) return null;
  const total = web + counter;
  if (total === 0) {
    return (
      <div className="mt-3.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
        Nothing from either shop in this period.
      </div>
    );
  }
  const webPc = (web / total) * 100;
  return (
    <div className="mt-3.5">
      <div className="h-[6px] rounded flex overflow-hidden gap-[2px]" style={{ background: "var(--s-sunken)" }}>
        <span style={{ flex: `0 1 ${webPc}%`, background: "var(--f-chart)" }} />
        <span style={{ flex: `0 1 ${100 - webPc}%`, background: "var(--t-gold)" }} />
      </div>
      <div className="flex justify-between text-[11px] mt-[7px] tabular-nums">
        <span style={{ color: "var(--t-faint)" }}>
          <b style={{ color: "var(--f-chart)" }}>Website</b> {fmt(web)}
        </span>
        <span style={{ color: "var(--t-faint)" }}>
          <b style={{ color: "var(--t-gold)" }}>Counter</b> {fmt(counter)}
        </span>
      </div>
    </div>
  );
}

function Kpi({ icon, tone = "accent", label, value, negative, scope, delta, children }: {
  icon: string; tone?: Tone; label: string; value: string;
  negative?: boolean; scope?: React.ReactNode; delta?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="biz-panel flex flex-col overflow-hidden">
      <div className="flex-1 px-[22px] pt-[20px] pb-4">
        <div className="flex items-center gap-3 min-h-[38px]">
          <Tile icon={icon} tone={tone} />
          {/*  Title Case, not shouted: the owner reads these as names, and an
               all-caps row of four competes with the figures under it.  */}
          <h3 className="m-0 text-[14.5px] font-semibold tracking-[-0.005em]" style={{ color: "var(--t-main)" }}>{label}</h3>
          {delta}
        </div>
        <div className="flex items-baseline gap-2.5 flex-wrap mt-[16px]">
          <b className="text-[33px] font-bold tabular-nums leading-none tracking-[-0.035em]"
            style={{ color: negative ? "var(--t-bad)" : "var(--t-main)" }}>{value}</b>
        </div>
        {scope ? <div className="mt-2.5">{scope}</div> : null}
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

type ChartKey = "sales" | "orders" | "profit";
type SoldTab = "web" | "counter";
type Loaded = "loading" | "ok" | "error";

export function BusinessDashboard() {
  const [range, setRange] = useState<Range>(() => presetRange("d30"));
  const [chart, setChart] = useState<ChartKey>("sales");
  const [soldTab, setSoldTab] = useState<SoldTab>("web");

  /* read once — they do not move with the period */
  const [dash, setDash] = useState<IntelDashboard | null>(null);
  const [accs, setAccs] = useState<ApiFinanceAccount[] | null>(null);
  const [rets, setRets] = useState<ReturnStats | null>(null);
  const [pos, setPos] = useState<ApiPosDay | null>(null);
  const [att, setAtt] = useState<ApiAttendanceSheet | null>(null);
  const [custTotal, setCustTotal] = useState<number | null>(null);
  /*  "what customers owe" is a balance, not a period. Read with no dates at
      all, because `/orders/stats` filters on placedAt and a windowed call made
      total debt collapse to whatever was billed inside the window - under a
      badge that said "now".  */
  const [dueAll, setDueAll] = useState<ApiOrderStats | null>(null);
  const [dueWeb, setDueWeb] = useState<ApiOrderStats | null>(null);
  const [hist, setHist] = useState<IntelHistory | null>(null);
  /*  A SINGLE FLAG ACROSS MANY CALLS IS A LIE MACHINE. With one "ok" for the
      whole batch, a 500 from the counter report printed "Nothing sold at the
      counter" - a claim about the shop invented out of a failed request. Each
      panel now reads its own call's state.  */
  const [st, setSt] = useState<Record<string, Loaded>>({});
  const mark = (k: string, r: PromiseSettledResult<unknown>) =>
    ({ [k]: (r.status === "fulfilled" ? "ok" : "error") as Loaded });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, w] = await Promise.allSettled([
        orderStats({ includeCounter: true }), orderStats({}),
      ]);
      if (!alive) return;
      if (a.status === "fulfilled") setDueAll(a.value);
      if (w.status === "fulfilled") setDueWeb(w.value);
      setSt((o) => ({ ...o, ...mark("due", a) }));
    })();
    return () => { alive = false; };
  }, []);

  /* re-read when the period changes */
  const [ordsAll, setOrdsAll] = useState<ApiOrderStats | null>(null);
  const [ordsWeb, setOrdsWeb] = useState<ApiOrderStats | null>(null);
  /*  the same call over the period before. A delta must compare like with
      like: the headline read from the order list and the change read from the
      books was two definitions in one card.  */
  const [ordsPrev, setOrdsPrev] = useState<ApiOrderStats | null>(null);
  const [funnel, setFunnel] = useState<ApiCatalogFunnel | null>(null);
  const [items, setItems] = useState<ApiItemsSold | null>(null);
  const [deliv, setDeliv] = useState<ApiDeliveryAnalytics | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      /*  allSettled, not all: an endpoint this role cannot read must not blank
          the whole page. Whatever answered is shown; the rest says so.  */
      const [h, d, a, r, p, sh, c] = await Promise.allSettled([
        /*  a full year, sliced in the browser, so any two dates the owner picks
            are answered without another round trip  */
        getIntelHistory(365), getIntelDashboard(), financeAccounts(),
        returnStats(), posDay(), attendanceSheet(), listCustomers(),
      ]);
      if (!alive) return;
      if (h.status === "fulfilled") setHist(h.value);
      if (d.status === "fulfilled") setDash(d.value);
      if (a.status === "fulfilled") setAccs(a.value);
      if (r.status === "fulfilled") setRets(r.value);
      if (p.status === "fulfilled") setPos(p.value);
      if (sh.status === "fulfilled") setAtt(sh.value);
      if (c.status === "fulfilled") setCustTotal(c.value.total);
      setSt((o) => ({ ...o, ...mark("hist", h), ...mark("dash", d), ...mark("accs", a),
        ...mark("rets", r), ...mark("pos", p), ...mark("att", sh), ...mark("cust", c) }));
    })();
    return () => { alive = false; };
  }, []);

  const window_: ReportWindow = useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);

  useEffect(() => {
    let alive = true;
    setSt((o) => ({ ...o, ords: "loading", funnel: "loading", items: "loading", deliv: "loading" }));
    setOrdsAll(null); setOrdsWeb(null); setOrdsPrev(null); setFunnel(null); setItems(null); setDeliv(null);
    const span = daysBetween(range.from, range.to);
    const prevTo = new Date(Date.parse(range.from) - DAY_MS).toISOString().slice(0, 10);
    const prevFrom = new Date(Date.parse(range.from) - span * DAY_MS).toISOString().slice(0, 10);
    (async () => {
      const [oa, ow, op, f, it, dv] = await Promise.allSettled([
        /*  the same question asked twice: with the counter and without. The
            difference IS the counter, counted the same way on both sides.  */
        orderStats({ from: range.from, to: range.to, includeCounter: true }),
        orderStats({ from: range.from, to: range.to }),
        orderStats({ from: prevFrom, to: prevTo, includeCounter: true }),
        getCatalogFunnel(window_, "web"),
        posItemsSold(window_),
        deliveryPerformance(window_),
      ]);
      if (!alive) return;
      if (oa.status === "fulfilled") setOrdsAll(oa.value);
      if (ow.status === "fulfilled") setOrdsWeb(ow.value);
      if (op.status === "fulfilled") setOrdsPrev(op.value);
      if (f.status === "fulfilled") setFunnel(f.value);
      if (it.status === "fulfilled") setItems(it.value);
      if (dv.status === "fulfilled") setDeliv(dv.value);
      setSt((o) => ({ ...o, ...mark("ords", oa), ...mark("funnel", f), ...mark("items", it), ...mark("deliv", dv) }));
    })();
    return () => { alive = false; };
  }, [range.from, range.to, window_]);

  /* ── the day series, cut to the chosen dates ── */
  const all: Row[] = useMemo(
    () => (hist?.days ?? []).map((d) => ({
      date: d.onDate.slice(0, 10), revenue: d.revenuePaisa, orders: d.ordersCount, profit: d.grossProfitPaisa,
    })),
    [hist],
  );
  const rows = useMemo(
    () => all.filter((r) => r.date >= range.from && r.date <= range.to),
    [all, range.from, range.to],
  );
  /*  the period immediately before, of the SAME length - a short tail compared
      against a full window reads as a collapse on a business that did not move  */
  const before = useMemo(() => {
    const n = daysBetween(range.from, range.to);
    const end = new Date(Date.parse(range.from) - DAY_MS).toISOString().slice(0, 10);
    const start = new Date(Date.parse(range.from) - n * DAY_MS).toISOString().slice(0, 10);
    const cut = all.filter((r) => r.date >= start && r.date <= end);
    return cut.length === n ? cut : null;
  }, [all, range.from, range.to]);

  /*  the books are a cache of CLOSED days, so today usually has no row yet.
      Comparing a short current window against a complete earlier one reported
      a fall on a business that had not moved.  */
  const rowsComplete = rows.length === daysBetween(range.from, range.to);
  const revenue = sum(rows, (r) => r.revenue);
  const orders = sum(rows, (r) => r.orders);
  const profit = sum(rows, (r) => r.profit);

  /* ── the website / counter split, one definition on both sides ── */
  const counterOrders = ordsAll && ordsWeb ? ordsAll.counts.all - ordsWeb.counts.all : null;
  const counterBilled = ordsAll && ordsWeb ? ordsAll.revenuePaisa - ordsWeb.revenuePaisa : null;
  const counterDue = dueAll && dueWeb ? dueAll.duePaisa - dueWeb.duePaisa : null;

  /* ── the money snapshot ── */
  const money = dash?.money?.figures ?? [];
  const fig = (key: string) => money.find((m) => m.key === key)?.value;
  const cash = fig("cash"), spendable = fig("spendable"), payable = fig("payable"), stock = fig("inventory");
  const newCustFig = dash?.business.supporting.find((sp) => sp.key === "newCustomers")?.value;
  const newCustomers = newCustFig && !newCustFig.unavailable ? newCustFig.value : null;

  const moneyAccounts = useMemo(
    /*  isActive matters: a closed wallet with a residual balance is not money
        the shop can reach, and summing it overstates the till  */
    () => (accs ?? []).filter((a) => a.isMoneyAccount && a.isActive).sort((a, b) => b.balancePaisa - a.balancePaisa),
    [accs],
  );
  const accMax = Math.max(1, ...moneyAccounts.map((a) => Math.abs(a.balancePaisa)));
  const accTotal = moneyAccounts.reduce((t, a) => t + a.balancePaisa, 0);

  /* ── what sold ── */
  /*  `funnel.items` is the WHOLE catalogue, sold or not: unfiltered it would
      head the card "400 products" on a week that sold twelve  */
  const soldProducts = useMemo(
    () => (funnel?.items ?? [])
      .filter((it) => it.units > 0 || it.revenuePaisa > 0)
      .sort((a, b) => b.revenuePaisa - a.revenuePaisa),
    [funnel],
  );
  const topProducts = soldProducts.slice(0, 8);
  const prodMax = Math.max(1, ...topProducts.map((x) => x.revenuePaisa));
  const topItems = (items?.rows ?? []).slice(0, 8);
  const itemMax = Math.max(1, ...topItems.map((x) => x.revenuePaisa));

  const categories = useMemo(() => {
    const by = new Map<string, number>();
    for (const it of soldProducts) {
      const key = it.categoryName ?? "No category";
      by.set(key, (by.get(key) ?? 0) + it.revenuePaisa);
    }
    return [...by.entries()].map(([name, paisa]) => ({ name, paisa }))
      .filter((c) => c.paisa > 0).sort((a, b) => b.paisa - a.paisa).slice(0, 8);
  }, [soldProducts]);
  const catMax = Math.max(1, ...categories.map((c) => c.paisa));

  const dotMax = Math.max(1, ...rows.map((r) => r.revenue));
  const soldDays = rows.filter((r) => r.revenue > 0).length;

  /* ── staff ── */
  const staff = att?.rows ?? [];
  const present = staff.filter((r) => r.status === "PRESENT").length;
  const half = staff.filter((r) => r.status === "HALF_DAY").length;
  const leave = staff.filter((r) => r.status === "LEAVE").length;
  const absent = staff.filter((r) => r.status === "ABSENT").length;
  const late = staff.filter((r) => r.status === "PRESENT" && r.inTime && r.shiftStart && r.inTime > r.shiftStart);
  const notMarked = !!att && !att.everMarked;
  /*  ⚠️ AN UNMARKED SHEET IS NOT AN ATTENDANCE RECORD. The endpoint answers
      with a row per employee whether or not anyone took the register, each
      pre-filled PRESENT from the shift and flagged `saved: false`. Read as a
      fact that printed "5 came in" on a morning nobody had been counted -
      and the same five would have read PRESENT if the shop never opened. So
      until the register is taken, the counts are withheld.  */
  const marked = !!att && att.everMarked;

  const meta = chart === "sales"
    ? { title: "Revenue trend (day by day)", big: formatTaka(revenue) }
    : chart === "orders"
      ? { title: "Orders trend (day by day)", big: `${orders} orders` }
      : { title: "Profit trend (day by day)", big: formatTaka(profit) };

  const oneDay = range.from === range.to;

  return (
    <div className={`${WRAP} biz-glow`}>
      {/*  THE NAME AND THE PERIOD ON ONE ROW. The reader's first question is
           "what am I looking at, and over what dates?", and the answer should
           not need a scroll.  */}
      <div className="flex items-start justify-between gap-6 mb-[20px] flex-wrap xl:flex-nowrap">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold m-0 leading-[1.15] tracking-[-0.025em]" style={{ color: "var(--t-main)" }}>
            Business dashboard
          </h1>
          <p className="text-[13.5px] m-0 mt-2 max-w-[520px] leading-[1.5]" style={{ color: "var(--t-faint)" }}>
            The website and the shop floor on one page — what sold, what is owed, and who is in today.
          </p>
        </div>
        <div className="shrink-0">
          <RangeBar range={range} onPick={setRange} />
        </div>
      </div>
      <TodayBand dash={dash} pos={pos} counter={counterOrders === null ? null : { orders: counterOrders }} />

      {/* ── the four figures ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-[18px]">
        {/*  headline, split and delta all read from the order list on the same
             delivered-orders basis. The chart below reads the books instead and
             says so - two sources, never presented as one number.  */}
        <Kpi icon="chart" tone="accent"
          label="Total revenue" value={ordsAll ? formatTaka(ordsAll.revenuePaisa) : "—"}
          scope={<Scope text="from delivered orders (both shops)" />}
          delta={<Delta now={ordsAll?.revenuePaisa ?? null} before={ordsPrev?.revenuePaisa ?? null} />}>
          <SplitLine web={ordsWeb?.revenuePaisa ?? null} counter={counterBilled} fmt={formatTaka} />
          <div className="mt-3.5 -mx-[22px] -mb-4"><Spark rows={rows} pick={(r) => r.revenue} mode="area" /></div>
        </Kpi>

        <Kpi icon="bag" tone="orchid"
          label="Total orders" value={ordsAll ? String(ordsAll.counts.all) : "—"}
          scope={<Scope text="both shops" />}
          delta={<Delta now={ordsAll?.counts.all ?? null} before={ordsPrev?.counts.all ?? null} />}>
          <SplitLine web={ordsWeb?.counts.all ?? null} counter={counterOrders} fmt={(n) => String(n)} />
          <div className="mt-3.5 -mx-[22px] -mb-4"><Spark rows={rows} pick={(r) => r.orders} mode="bars" /></div>
        </Kpi>

        <Kpi icon="cash" tone={profit < 0 ? "bad" : "ok"}
          label="Net profit" value={formatTaka(profit)} negative={profit < 0}
          scope={<Scope text="after the books (both shops)" />}
          delta={<Delta now={rowsComplete ? profit : null} before={before ? sum(before, (r) => r.profit) : null} />}>
          <div className="mt-3.5 -mx-[22px] -mb-4"><Spark rows={rows} pick={(r) => r.profit} mode="diverge" /></div>
        </Kpi>

        <Kpi icon="clock" tone="warn"
          label="Unpaid amount" value={dueAll ? formatTaka(dueAll.duePaisa) : "—"}
          scope={<Scope text="all time" tone="now" />}
          delta={<span className="ml-auto text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap"
            style={{ background: "var(--s-sunken)", color: "var(--t-faint)" }}>
            {dueAll ? `${dueAll.dueOrders} orders` : ""}
          </span>}>
          <SplitLine web={dueWeb?.duePaisa ?? null} counter={counterDue} fmt={formatTaka} />
        </Kpi>
      </div>

      {/* ── one chart, three answers ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-[18px] mb-[18px]">
        <div className="biz-panel px-6 py-[22px]">
          <div className="flex items-center justify-between gap-3.5 flex-wrap">
            <div className="flex items-center gap-3">
              <Tile icon="chart" tone="accent" />
              <h2 className="text-[16px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{meta.title}</h2>
            </div>
            <Seg<ChartKey> label="Which chart" value={chart} onPick={setChart}
              options={[{ v: "sales", label: "Money" }, { v: "orders", label: "Orders" }, { v: "profit", label: "Profit" }]} />
          </div>
          <div className="flex items-baseline gap-3 mt-3.5">
            <div className="text-[26px] font-bold tabular-nums tracking-[-0.03em]"
              style={{ color: chart === "profit" && profit < 0 ? "var(--t-bad)" : "var(--t-main)" }}>{meta.big}</div>
            <Scope text="from the books" />
          </div>
          {oneDay ? (
            <p className="text-[12.5px] m-0 mt-6" style={{ color: "var(--t-faint)" }}>
              One day has no shape to draw. Pick 7 days or more to see the chart.
            </p>
          ) : chart === "sales" ? <SalesChart rows={rows} />
            : chart === "orders" ? <OrdersChart rows={rows} />
            : <ProfitChart rows={rows} />}
        </div>

        {/* ── who is in today ── */}
        <Card title="Team attendance (today)" icon="users" tone="info" right={<Scope text="now" tone="now" />}>
          {notMarked ? (
            <div className="rounded-[12px] border px-4 py-3 mt-4 flex items-start gap-3"
              style={{ background: "var(--s-warn)", borderColor: "var(--l-warn)" }}>
              <Icon name="alert" size={17} style={{ color: "var(--t-warn)", flex: "none", marginTop: 1 }} />
              <div className="text-[12.5px] leading-[1.5]" style={{ color: "var(--t-warn)" }}>
                Attendance hasn&apos;t been taken today.{" "}
                <Link href="/employees/attendance" className="underline font-semibold">Take attendance now →</Link>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-[18px]">
            <Stat label="Came in" value={marked ? String(present + half) : "—"} tone={marked ? "ok" : undefined}
              sub={marked && half ? `${half} half day` : !marked ? "not taken yet" : undefined} />
            <Stat label="On leave" value={marked ? String(leave) : "—"} />
            <Stat label="Absent" value={marked ? String(absent) : "—"} tone={marked && absent > 0 ? "bad" : undefined} />
            <Stat label="Working now" value={marked ? String(present + half) : "—"} sub={staff.length ? `of ${staff.length} on the books` : undefined} />
          </div>

          {marked && late.length > 0 ? (
            <>
              <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--t-faint)" }}>Came late</div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {late.map((r) => (
                  <span key={r.employeeId} className="inline-flex items-center gap-2 rounded-full border px-3 py-[5px] text-[12px]"
                    style={{ background: "var(--s-warn)", borderColor: "var(--l-warn)", color: "var(--t-warn)" }}>
                    {r.name}
                    <b className="tabular-nums font-bold">{r.inTime}</b>
                    <span style={{ opacity: 0.7 }}>vs {r.shiftStart}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {staff.length === 0 ? <Empty state={st.att ?? "loading"} empty="No staff on the books." error="Could not read attendance." /> : null}
        </Card>
      </div>

      {/*  THE LOWER HALF, LAID OUT AS THE OWNER'S DESIGN HAS IT.

           One row of three columns, each column a stack:
             left   what sold, and under it delivery beside the riders
             middle which shelf sells, and under it the customers
             right  which days sold, and under it where the money is
           `items-start` so a short column does not stretch to match a tall
           one - three panels of different heights is the design, not a bug.  */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.62fr_0.7fr_0.7fr] gap-[18px] mb-[18px] items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
      <div className="biz-panel px-6 py-[22px] mb-[18px]">
        <div className="flex items-center justify-between gap-3.5 flex-wrap">
          <div className="flex items-center gap-3">
            <Tile icon="box" tone="accent" />
            <h2 className="text-[16px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>Top selling products</h2>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Scope text={soldTab === "web" ? "orders placed" : "line value, delivered"} />
            <Seg<SoldTab> label="Which shop" value={soldTab} onPick={setSoldTab}
              options={[{ v: "web", label: "Website products" }, { v: "counter", label: "Counter items" }]} />
          </div>
        </div>

        {soldTab === "web" ? (
          topProducts.length > 0 ? (
            <>
              <div className="flex items-baseline gap-3 mt-3.5 flex-wrap">
                <div className="text-[20px] font-bold tabular-nums" style={{ color: "var(--t-main)" }}>
                  {formatTaka(soldProducts.reduce((t, x) => t + x.revenuePaisa, 0))}
                </div>
                <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                  {soldProducts.length} product{soldProducts.length === 1 ? "" : "s"} · {funnel?.totals.units ?? 0} units
                  {soldProducts.length > 8 ? " · top 8" : ""}
                </div>
              </div>
              <Table head={[{ label: "Product" }, { label: "Units", right: true }, { label: "Orders", right: true },
                { label: "Money", right: true }, { label: "Profit", right: true }, { label: "Share" }]} min={640}>
                {topProducts.map((it) => (
                  <tr key={it.productId}>
                    <Td>{it.name}</Td>
                    <Td right>{it.units}</Td>
                    <Td right>{it.orders}</Td>
                    <Td right>{formatTaka(it.revenuePaisa)}</Td>
                    <Td right bold color={it.marginPaisa < 0 ? "var(--t-bad)" : "var(--t-ok)"}>{formatTaka(it.marginPaisa)}</Td>
                    <td className="py-[11px] px-2.5 border-b" style={{ borderColor: "var(--l-soft)" }}>
                      <span className="block h-[7px] rounded overflow-hidden" style={{ background: "var(--s-sunken)" }}>
                        <span className="block h-full rounded" style={{ width: `${(it.revenuePaisa / prodMax) * 100}%`, background: "var(--f-chart)" }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          ) : <Empty state={st.funnel ?? "loading"} empty="No product sold on the website in this period." error="Could not read the product figures." />
        ) : (
          topItems.length > 0 ? (
            <>
              <div className="flex items-baseline gap-3 mt-3.5 flex-wrap">
                <div className="text-[20px] font-bold tabular-nums" style={{ color: "var(--t-main)" }}>
                  {formatTaka(items?.totals.revenuePaisa ?? 0)}
                </div>
                <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                  {items?.totals.items ?? 0} item{(items?.totals.items ?? 0) === 1 ? "" : "s"} · {items?.totals.units ?? 0} units
                  {" · "}{items?.totals.bills ?? 0} bill{(items?.totals.bills ?? 0) === 1 ? "" : "s"}
                  {topItems.length < (items?.totals.items ?? 0) ? " · top 8" : ""}
                </div>
              </div>
              <Table head={[{ label: "Item" }, { label: "Units", right: true }, { label: "Bills", right: true },
                { label: "Money", right: true }, { label: "Share" }]} min={560}>
                {topItems.map((it) => (
                  <tr key={it.itemId}>
                    <Td>
                      {it.name}
                      {it.sku ? <span className="ml-2 text-[11px]" style={{ color: "var(--t-faint)" }}>{it.sku}</span> : null}
                    </Td>
                    <Td right>{it.units}{it.unitName ? <span style={{ color: "var(--t-faint)" }}> {it.unitName}</span> : null}</Td>
                    <Td right>{it.bills}</Td>
                    <Td right>{formatTaka(it.revenuePaisa)}</Td>
                    <td className="py-[11px] px-2.5 border-b" style={{ borderColor: "var(--l-soft)" }}>
                      <span className="block h-[7px] rounded overflow-hidden" style={{ background: "var(--s-sunken)" }}>
                        <span className="block h-full rounded" style={{ width: `${(it.revenuePaisa / itemMax) * 100}%`, background: "var(--t-gold)" }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          ) : <Empty state={st.items ?? "loading"} empty="Nothing sold at the counter in this period." error="Could not read the counter figures." />
        )}
      </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.15fr] gap-[18px]">
        <Card title="Delivery performance" icon="truck" tone="info">
          {/*  `inFlight` carries no date window, so counting it here opened the
                card on a period with no deliveries and drew "0 of 0" beside a
                100%-green margin bar over nothing charged  */}
          {deliv && (deliv.delivered + deliv.failed) > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-[18px]">
                <Stat label="On time" value={bp(deliv.onTimeBp)}
                  tone={deliv.onTimeBp !== null && deliv.onTimeBp < 8000 ? "warn" : "ok"}
                  sub={deliv.measurable > 0 ? `of ${deliv.measurable} with a promised time` : "none had a promised time"} />
                <Stat label="Failed" value={bp(deliv.failedBp)} tone={deliv.failedBp ? "bad" : undefined}
                  sub={`${deliv.failed} of ${deliv.delivered + deliv.failed}`} />
                <Stat label="Door to door" value={hoursMins(deliv.avgMinutesToDeliver)} sub="on average" />
                <Stat label="On the road" value={String(deliv.inFlight)} sub="right now" />
              </div>
              <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
              {(() => {
                /*  the bar is ONE whole - what was charged. Amber is what the
                    riders took out of it, green is what stayed. Drawing cost
                    under the word "charged" had it exactly backwards.  */
                const charged = deliv.chargedPaisa, cost = deliv.costPaisa;
                const over = cost > charged;
                const costShare = charged > 0 ? Math.min(100, (cost / charged) * 100) : cost > 0 ? 100 : 0;
                return (
                  <>
                    <div className="flex justify-between text-[12px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                      <span><b style={{ color: over ? "var(--t-bad)" : "var(--t-warn)" }}>Riders paid</b> {formatTaka(cost)}</span>
                      <span><b style={{ color: "var(--t-ok)" }}>Kept</b> {formatTaka(deliv.marginPaisa)}</span>
                    </div>
                    <div className="h-2.5 rounded-md flex overflow-hidden mt-2 gap-[2px]" style={{ background: "var(--s-sunken)" }}>
                      <span style={{ flex: `0 1 ${costShare}%`, background: over ? "var(--t-bad)" : "var(--t-warn)" }} />
                      <span style={{ flex: `0 1 ${100 - costShare}%`, background: "var(--t-ok)" }} />
                    </div>
                    <div className="text-[11.5px] mt-2" style={{ color: "var(--t-faint)" }}>
                      out of {formatTaka(charged)} charged to customers
                    </div>
                  </>
                );
              })()}
            </>
          ) : <Empty state={st.deliv ?? "loading"} empty="No delivery in this period." error="Could not read the delivery figures." />}
        </Card>
        <Card title="Rider performance" icon="user" tone="orchid">
          {deliv && deliv.byCarrier.length > 0 ? (
            <Table head={[{ label: "Rider" }, { label: "Delivered", right: true }, { label: "Judged", right: true },
              { label: "On time", right: true }, { label: "Paid", right: true }]} min={520}>
              {[...deliv.byCarrier].sort((a, b) => b.delivered - a.delivered).map((c) => {
                const pct = c.onTimeBp === null || c.measurable === 0 ? null : c.onTimeBp / 100;
                const col = pct === null ? "var(--t-faint)" : pct >= 80 ? "var(--t-ok)" : pct >= 50 ? "var(--t-warn)" : "var(--t-bad)";
                return (
                  <tr key={c.name}>
                    <Td>{c.name}</Td>
                    <Td right>{c.delivered}</Td>
                    {/*  how many could be judged at all - a rate off one
                         delivery is not the same claim as off fifty  */}
                    <Td right color="var(--t-faint)">{c.measurable}</Td>
                    <Td right bold color={col}>{c.measurable > 0 ? bp(c.onTimeBp) : "not judged"}</Td>
                    <Td right>{formatTaka(c.costPaisa)}</Td>
                  </tr>
                );
              })}
            </Table>
          ) : <Empty state={st.deliv ?? "loading"} empty="No rider carried a delivery in this period." error="Could not read the rider figures." />}
        </Card>
          </div>
        </div>

        <div className="flex flex-col gap-[18px] min-w-0">
        <Card title="Best performing categories" icon="layers" tone="orchid" right={<Scope text="website" />}>
          <div className="mt-4">
            {categories.length > 0 ? categories.map((c) => (
              <TrackRow key={c.name} label={c.name} value={formatTaka(c.paisa)} width={(c.paisa / catMax) * 100} color="var(--f-chart)" />
            )) : <Empty state={st.funnel ?? "loading"} empty="Nothing sold in this period." error="Could not read the shelf figures." />}
          </div>
        </Card>
        <Card title="Customer summary" icon="heart" tone="info">
          <div className="grid grid-cols-2 gap-4 mt-[18px]">
            <Stat label="On the books" value={custTotal === null ? "—" : String(custTotal)} />
            <Stat label="First time buyers" value={newCustomers === null ? "—" : String(newCustomers)} sub="this month" />
            <Stat label="Goods returned" value={rets ? formatTaka(rets.returnValuePaisa) : "—"}
              sub={rets ? `${rets.counts.all ?? 0} returns, all time` : undefined} />
            <Stat label="Refunded" value={rets ? formatTaka(rets.refundPaisa) : "—"} tone={rets && rets.refundPaisa > 0 ? "warn" : undefined} />
          </div>
        </Card>
        </div>

        <div className="flex flex-col gap-[18px] min-w-0">
        <Card title="Sales by day" icon="grid" tone="accent"
          right={rows.length ? <Scope text={`last ${rows.length} day${rows.length === 1 ? "" : "s"}`} /> : null}>
          <div className="grid gap-1.5 mt-[18px]"
            style={{ gridTemplateColumns: `repeat(${Math.min(10, Math.max(1, rows.length))}, 1fr)` }}>
            {rows.map((r) => (
              <i key={r.date} title={`${dayLabel(r.date)} · ${r.revenue ? formatTaka(r.revenue) : "nothing"}`}
                className="block rounded-[5px]"
                style={{ aspectRatio: "1",
                  background: r.revenue > 0 ? "var(--f-chart)" : "var(--f-chart-dim)",
                  opacity: r.revenue > 0 ? 0.3 + (r.revenue / dotMax) * 0.7 : 1 }} />
            ))}
          </div>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-[24px] font-bold tabular-nums" style={{ color: "var(--t-main)" }}>{soldDays}</span>
            <span className="text-[12.5px]" style={{ color: "var(--t-faint)" }}>
              of {rows.length} day{rows.length === 1 ? "" : "s"} took money
            </span>
          </div>
        </Card>
        <Card title="Payment collection" icon="wallet" tone="ok" right={<Scope text="now" tone="now" />}>
          <div className="mt-[18px]">
            {moneyAccounts.length > 0 ? moneyAccounts.map((a) => (
              <TrackRow key={a.id} label={a.name} value={formatTaka(a.balancePaisa)}
                width={(Math.abs(a.balancePaisa) / accMax) * 100}
                color={a.balancePaisa < 0 ? "var(--t-bad)" : a.balancePaisa ? "var(--f-chart)" : "var(--f-chart-dim)"} />
            )) : <Empty state={st.accs ?? "loading"} empty="No money account is set up yet." error="Could not read the accounts." />}
          </div>
          <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="All accounts" value={cash && !cash.unavailable ? formatTaka(cash.value)
              : moneyAccounts.length > 0 ? formatTaka(accTotal) : "—"} />
            <Stat label="Free to spend" value={spendable && !spendable.unavailable ? formatTaka(spendable.value) : "—"}
              sub="the rest is held against unfinished orders" />
          </div>
        </Card>
        </div>
      </div>

      {/*  NOT IN THE OWNER'S DESIGN, KEPT ON PURPOSE: this card is the answer
           to "what will the shop get, and what must it pay", which he asked
           for by name earlier. It sits last so the top of the page matches the
           design exactly.  */}
      <div className="mb-[18px]">
        <Card title="What the shop will get, and must pay" icon="cash" tone="warn" right={<Scope text="now" tone="now" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5 mt-[18px]">
            <Stat label="Customers owe the shop" tone="warn"
              value={dueAll ? formatTaka(dueAll.duePaisa) : "—"}
              sub={dueAll ? `on ${dueAll.dueOrders} orders` : undefined} />
            <Stat label="Shop owes suppliers" tone={payable && !payable.unavailable && payable.value > 0 ? "warn" : undefined}
              value={payable && !payable.unavailable ? formatTaka(payable.value) : "—"} />
            <Stat label="Stock on the shelves" tone={stock && stock.value < 0 ? "bad" : undefined}
              value={stock && !stock.unavailable ? formatTaka(stock.value) : "—"}
              sub={stock && stock.value < 0 ? "below zero - a cost price is wrong" : "at cost price"} />
            <Stat label="Money in the till" value={pos ? formatTaka(pos.money.takenPaisa) : "—"}
              sub={pos ? (pos.drawer.isOpen ? "till open today" : "till closed today") : undefined} />
          </div>
        </Card>
      </div>

      {/*  THE FOOT OF THE PAGE: when it was read, and which source answered
           which half of it. Both belong here rather than on a card, because
           they are true of the whole screen.  */}
      <div className="flex items-start justify-between gap-6 flex-wrap mt-6 pt-5 border-t"
        style={{ borderColor: "var(--l-soft)" }}>
        <p className="text-[11.5px] m-0 tabular-nums whitespace-nowrap" style={{ color: "var(--t-faint)" }}>
          {dash?.meta.generatedAt
            ? `Last updated: ${new Date(dash.meta.generatedAt).toLocaleString("en-GB", { hour12: false })}`
            : "Last updated: not read yet"}
        </p>
        <p className="text-[11.5px] leading-[1.65] m-0 max-w-[980px] text-right" style={{ color: "var(--t-faint)" }}>
          Money taken, orders and unpaid are counted from the order list on delivered orders, website and counter
          together. Profit and the day-by-day chart come from the books instead, so their totals differ from the cards.
          What sold counts orders placed, and the counter table is line value before VAT. Figures marked <b>now</b> are
          true at this moment and do not follow the date filter.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/*  OVERVIEW KIT — the one pattern every overview screen in this panel is built
    from. Extracted from the Business dashboard once it was approved (12 Sep
    2026) so the next fifteen screens are the same shape by construction rather
    than by somebody remembering.

    THE FOUR RULES IT EXISTS TO ENFORCE. Each was learned by shipping the
    opposite:

    1. EVERY FIGURE SAYS WHAT IT COUNTS. `<Scope>` is a two-or-three word mark
       beside a number: "both shops", "from the books", "now", "delivered".
       One screen quietly mixing "website only" with "the whole business" is how
       an owner plans against a number that was never true.

    2. A LABEL BEATS A SENTENCE. There is no explanatory paragraph under a
       figure. If a number needs a paragraph, the number is wrong or the card
       is. `<Stat>` takes a label, a value and at most a short `sub`.

    3. THE PERIOD BELONGS TO THE READER. `<RangeBar>` gives today, yesterday,
       7 / 30 / 90 days and any two dates, and hands back exact Dhaka dates so
       a card headed "4 Sep to 10 Sep" is measured on those days. A figure that
       is only true at this instant carries `<Scope text="now" tone="now" />`
       and is read with NO date filter at all.

    4. NOTHING IS INVENTED, AND A FAILURE IS NEVER A ZERO. `<Empty>` takes a
       per-call state and says "loading", "nothing here" and "could not read"
       as three different things. One flag across many calls once printed
       "Nothing sold at the counter" out of an HTTP 500.  */

/* ═══════════════════════════ dates ═══════════════════════════ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dhaka is UTC+6 and the shop's day is Dhaka's day, never the browser's. */
export const BD_OFFSET_MS = 6 * 3600_000;
export const DAY_MS = 86_400_000;

/** YYYY-MM-DD for the Dhaka day `back` days before today */
export function bdDay(back = 0): string {
  return new Date(Date.now() + BD_OFFSET_MS - back * DAY_MS).toISOString().slice(0, 10);
}
/** "2026-09-02" -> "2 Sep" — an axis has no room for a year */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""}`;
}
export function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1);
}

export type RangeKey = "today" | "yesterday" | "d7" | "d30" | "d90" | "custom";
export interface Range { key: RangeKey; from: string; to: string }

export function presetRange(key: Exclude<RangeKey, "custom">): Range {
  if (key === "today") return { key, from: bdDay(0), to: bdDay(0) };
  if (key === "yesterday") return { key, from: bdDay(1), to: bdDay(1) };
  const back = key === "d7" ? 6 : key === "d30" ? 29 : 89;
  return { key, from: bdDay(back), to: bdDay(0) };
}

/** the same window, immediately before, of the SAME length */
export function previousRange(r: Range): { from: string; to: string } {
  const n = daysBetween(r.from, r.to);
  return {
    from: new Date(Date.parse(r.from) - n * DAY_MS).toISOString().slice(0, 10),
    to: new Date(Date.parse(r.from) - DAY_MS).toISOString().slice(0, 10),
  };
}

/* ═══════════════════════════ numbers ═══════════════════════════ */

/** basis points -> "60 %". null stays "—": not measured is not zero. */
export function bp(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${(v / 100).toFixed(1).replace(/\.0$/, "")} %`;
}
/** 554 minutes -> "9 h 14 m" — how a delivery is actually discussed */
export function hoursMins(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} m`;
}
/**
 * A paisa amount as an axis label.
 *
 * Gridlines are quarters of a round paisa step, so they are very often NOT
 * whole thousands of taka. Rounding them to "3k" put the label 20% away from
 * the line it sat on, and every value read off the chart was then wrong.
 */
export function axisTaka(paisa: number): string {
  const taka = paisa / 100;
  if (taka === 0) return "0";
  if (Math.abs(taka) >= 1000) {
    const k = taka / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(taka));
}
/** a plain count, grouped the way Bengali readers expect */
export function count(n: number): string {
  return n.toLocaleString("en-IN");
}

/* ═══════════════════════════ load state ═══════════════════════════ */

export type Loaded = "loading" | "ok" | "error";

/**
 * One state per call, never one for a batch.
 *
 * `const { st, settle } = useLoadState()` then
 * `settle({ stats: r0, rows: r1 })` after a `Promise.allSettled`.
 */
export function useLoadState() {
  const [st, setSt] = useState<Record<string, Loaded>>({});
  function settle(m: Record<string, PromiseSettledResult<unknown>>) {
    setSt((o) => {
      const next = { ...o };
      for (const k in m) next[k] = m[k].status === "fulfilled" ? "ok" : "error";
      return next;
    });
  }
  function begin(...keys: string[]) {
    setSt((o) => {
      const next = { ...o };
      for (const k of keys) next[k] = "loading";
      return next;
    });
  }
  const at = (k: string): Loaded => st[k] ?? "loading";
  return { st, settle, begin, at };
}

export function Empty({ state, empty, error }: { state: Loaded; empty: string; error: string }) {
  return (
    <p className="text-[12.5px] m-0 mt-4" style={{ color: "var(--t-faint)" }}>
      {state === "loading" ? "Loading…" : state === "error" ? error : empty}
    </p>
  );
}

/* ═══════════════════════════ surfaces ═══════════════════════════ */

export function Card({ title, right, children, className }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-[16px] border px-6 py-[22px] ${className ?? ""}`}
      style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}>
      {title || right ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {title ? (
            <h2 className="text-[15.5px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{title}</h2>
          ) : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** a scope mark: what a figure counts. Two or three words, never a sentence. */
export function Scope({ text, tone = "quiet" }: { text: string; tone?: "quiet" | "now" }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-[3px] rounded-full whitespace-nowrap"
      style={tone === "now"
        ? { background: "var(--s-info)", color: "var(--t-info)" }
        : { background: "var(--s-sunken)", color: "var(--t-faint)" }}>
      {text}
    </span>
  );
}

export type Tone = "warn" | "bad" | "ok" | undefined;

export function Stat({ label, value, sub, tone, href }: {
  label: string; value: string; sub?: string; tone?: Tone; href?: string;
}) {
  const inner = (
    <>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--t-faint)" }}>{label}</div>
      <div className="text-[24px] font-bold tabular-nums mt-2"
        style={{ color: tone === "bad" ? "var(--t-bad)" : tone === "warn" ? "var(--t-warn)" : tone === "ok" ? "var(--t-ok)" : "var(--t-main)" }}>
        {value}
      </div>
      {sub ? <div className="text-[11.5px] mt-1 leading-[1.45] whitespace-pre-line" style={{ color: "var(--t-faint)" }}>{sub}</div> : null}
    </>
  );
  return href
    ? <a href={href} className="block transition-opacity hover:opacity-80">{inner}</a>
    : <div>{inner}</div>;
}

export function TrackRow({ label, value, width, color, right }: {
  label: string; value: string; width: number; color: string; right?: React.ReactNode;
}) {
  return (
    <div className="mb-[13px] last:mb-0">
      <div className="flex justify-between gap-3 items-baseline text-[12.5px]">
        <span className="truncate" style={{ color: "var(--t-main)" }}>{label}</span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <b className="font-semibold tabular-nums" style={{ color }}>{value}</b>
          {right}
        </span>
      </div>
      <div className="h-[7px] rounded mt-[7px] overflow-hidden" style={{ background: "var(--s-sunken)" }}>
        <span className="block h-full rounded" style={{ width: `${Math.max(0, Math.min(100, width))}%`, background: color }} />
      </div>
    </div>
  );
}

export function Chip({ tone, children }: { tone: "ok" | "bad" | "warn" | "mute"; children: React.ReactNode }) {
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

export function Seg<T extends string>({ value, options, onPick, label }:
  { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex p-[3px] gap-[2px] rounded-full border" role="group" aria-label={label}
      style={{ background: "var(--s-raised)", borderColor: "var(--l-soft)" }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" aria-pressed={on} onClick={() => onPick(o.v)}
            className="text-[12.5px] font-semibold px-[15px] py-[7px] rounded-full transition-colors"
            style={on ? { background: "var(--t-main)", color: "var(--s-card)" } : { background: "transparent", color: "var(--t-soft)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ head, children, min = 560 }: {
  head: { label: string; right?: boolean }[]; children: React.ReactNode; min?: number;
}) {
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

export function Td({ children, right, color, bold }: {
  children: React.ReactNode; right?: boolean; color?: string; bold?: boolean;
}) {
  return (
    <td className={`py-[11px] px-2.5 border-b text-[12.5px] ${right ? "text-right tabular-nums" : ""} ${bold ? "font-semibold" : ""}`}
      style={{ borderColor: "var(--l-soft)", color: color ?? "var(--t-main)" }}>
      {children}
    </td>
  );
}

/** a thin rule between two halves of a card */
export function Rule() {
  return <div className="h-px my-5" style={{ background: "var(--l-soft)" }} />;
}

/** a small uppercase heading inside a card */
export function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--t-faint)" }}>{children}</div>
  );
}

/* ═══════════════════════════ the range bar ═══════════════════════════ */

/**
 * Today / Yesterday / 7 / 30 / 90 / any two dates.
 *
 * `maxBack` is how far the caller's own data reaches. The picker will not go
 * past it, because a heading naming 2019 over figures covering one year is
 * exactly the lie rule 3 exists to stop.
 */
export function RangeBar({ range, onPick, maxBack = 364, right, only }: {
  range: Range; onPick: (r: Range) => void; maxBack?: number; right?: React.ReactNode;
  /*  a screen offers only the periods its endpoint can actually measure.
      Offering "pick dates" on a report that always ends tonight would put the
      chosen dates in the heading over figures measured somewhere else - which
      is the lie rule 3 exists to stop.  */
  only?: RangeKey[];
}) {
  const [openCustom, setOpenCustom] = useState(range.key === "custom");
  const floor = bdDay(maxBack);
  const all: { v: RangeKey; label: string }[] = [
    { v: "today", label: "Today" },
    { v: "yesterday", label: "Yesterday" },
    { v: "d7", label: "7 days" },
    { v: "d30", label: "30 days" },
    { v: "d90", label: "90 days" },
    { v: "custom", label: "Pick dates" },
  ];
  const presets = only ? all.filter((p) => only.includes(p.v)) : all;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Seg<RangeKey> label="Period" value={range.key} options={presets}
          onPick={(v) => {
            if (v === "custom") { setOpenCustom(true); onPick({ ...range, key: "custom" }); return; }
            setOpenCustom(false);
            onPick(presetRange(v));
          }} />
        {openCustom || range.key === "custom" ? (
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-[5px]"
            style={{ background: "var(--s-card)", borderColor: "var(--l-soft)" }}>
            {/*  a typed out-of-range date still fires onChange in Chrome, so the
                 order is fixed here rather than trusted to min/max  */}
            <input type="date" value={range.from} min={floor} max={range.to}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const from = v < floor ? floor : v > range.to ? range.to : v;
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
      <div className="text-[12px] flex items-center gap-3" style={{ color: "var(--t-faint)" }}>
        {right}
        <span>
          {range.from === range.to
            ? dayLabel(range.from)
            : `${dayLabel(range.from)} to ${dayLabel(range.to)} · ${daysBetween(range.from, range.to)} days`}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════ a headline figure ═══════════════════════════ */

/**
 * The change against the period before.
 *
 * `now === null` means "not read yet" and renders nothing — it used to print a
 * red "down 100%" beside a value of "—". `before === 0` is growth from nothing,
 * not an infinite percentage.
 */
export function Delta({ now, before, invert }: {
  now: number | null;
  /*  THREE STATES, NOT TWO.
        a number  - the same figure, one period earlier
        null      - there IS no earlier period to compare with
        undefined - the earlier period was not read (a failed call), so nothing
                    is drawn. Printing "no earlier period" over a call that
                    simply failed is a claim about the shop, not about the read.  */
  before: number | null | undefined;
  /*  set on a figure where MORE is worse - a cost, a return, a complaint. The
      arrow still points the way the number moved; only the colour flips.  */
  invert?: boolean;
}) {
  if (before === undefined) return null;
  let cls = "flat", text = "no earlier period";
  if (now !== null && before !== null) {
    if (now === before) text = "no change";
    else if (before === 0) { cls = now > 0 ? "up" : "down"; text = now > 0 ? "nothing before" : "down from nothing"; }
    else {
      const pc = Math.round(((now - before) / Math.abs(before)) * 100);
      cls = now > before ? "up" : "down";
      text = `${now > before ? "↑" : "↓"} ${Math.abs(pc)}%`;
    }
  }
  if (now === null) return null;
  const good = invert ? (cls === "down" ? "up" : cls === "up" ? "down" : "flat") : cls;
  const st = good === "up" ? { background: "var(--s-ok)", color: "var(--t-ok)" }
    : good === "down" ? { background: "var(--s-bad)", color: "var(--t-bad)" }
    : { background: "var(--s-sunken)", color: "var(--t-faint)" };
  return (
    <span className="ml-auto text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap" style={st}>{text}</span>
  );
}

/**
 * Two halves of one figure, as data rather than a sentence.
 *
 * Only draw it where BOTH halves come from one definition, counted the same
 * way on each side. A split whose halves mean different things is worse than
 * no split at all.
 */
export function SplitLine({ a, b, fmt }: {
  a: { label: string; value: number | null; color?: string };
  b: { label: string; value: number | null; color?: string };
  fmt: (n: number) => string;
}) {
  if (a.value === null || b.value === null) return null;
  const ca = a.color ?? "var(--f-chart)", cb = b.color ?? "var(--t-gold)";
  const total = a.value + b.value;
  if (total === 0) {
    return <div className="mt-3.5 text-[11px]" style={{ color: "var(--t-faint)" }}>Nothing from either side in this period.</div>;
  }
  const pc = (a.value / total) * 100;
  return (
    <div className="mt-3.5">
      <div className="h-[6px] rounded flex overflow-hidden gap-[2px]" style={{ background: "var(--s-sunken)" }}>
        <span style={{ flex: `0 1 ${pc}%`, background: ca }} />
        <span style={{ flex: `0 1 ${100 - pc}%`, background: cb }} />
      </div>
      <div className="flex justify-between text-[11px] mt-[7px] tabular-nums">
        <span style={{ color: "var(--t-faint)" }}><b style={{ color: ca }}>{a.label}</b> {fmt(a.value)}</span>
        <span style={{ color: "var(--t-faint)" }}><b style={{ color: cb }}>{b.label}</b> {fmt(b.value)}</span>
      </div>
    </div>
  );
}

export function Kpi({ icon, iconBg, iconColor, label, value, negative, scope, delta, children }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string;
  negative?: boolean; scope?: React.ReactNode; delta?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[16px] border overflow-hidden"
      style={{ background: "var(--s-card)", borderColor: "var(--l-soft)", boxShadow: "var(--elev-soft)" }}>
      <div className="flex-1 px-[22px] pt-5 pb-4">
        <div className="flex items-center gap-[11px] min-h-[36px]">
          <span className="w-9 h-9 rounded-[11px] grid place-items-center shrink-0" style={{ background: iconBg, color: iconColor }}>
            {icon}
          </span>
          <h3 className="m-0 text-[13px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--t-soft)" }}>{label}</h3>
          {delta}
        </div>
        <div className="flex items-baseline gap-2.5 flex-wrap mt-[18px]">
          <b className="text-[34px] font-bold tabular-nums leading-none tracking-[-0.035em]"
            style={{ color: negative ? "var(--t-bad)" : "var(--t-main)" }}>{value}</b>
          {scope}
        </div>
        {children}
      </div>
    </div>
  );
}

/** the grid the four headline figures sit in */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-[18px]">{children}</div>;
}

/* ═══════════════════════════ charts ═══════════════════════════ */

/** one day of anything: a date plus whatever the caller wants plotted */
export interface Point { date: string; value: number }

/** a smooth curve through the points — it never overshoots a peak */
export function smooth(pts: ReadonlyArray<readonly [number, number]>): string {
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

/** the small chart along the foot of a card */
export function Spark({ pts, mode, id }: {
  pts: Point[]; mode: "area" | "bars" | "diverge"; id: string;
}) {
  const W = 200, H = 44;
  if (pts.length === 0) return <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-[44px]" />;
  const step = W / pts.length;
  const bw = Math.max(1.2, step * 0.64);

  if (mode === "diverge") {
    const mx = Math.max(...pts.map((p) => Math.abs(p.value))) || 1, mid = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
        {pts.map((p, i) => {
          const bh = p.value ? Math.max(1.5, (Math.abs(p.value) / mx) * (H / 2 - 2)) : 1.2;
          return <rect key={i} x={i * step + step * 0.18} y={p.value >= 0 ? mid - bh : mid} width={bw} height={bh} rx={0.8}
            fill={p.value > 0 ? "var(--t-ok)" : p.value < 0 ? "var(--t-bad)" : "var(--f-chart-dim)"} />;
        })}
      </svg>
    );
  }
  if (mode === "bars") {
    const mx = Math.max(...pts.map((p) => p.value)) || 1;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
        {pts.map((p, i) => {
          const bh = p.value ? Math.max(2, (p.value / mx) * (H - 5)) : 1.5;
          return <rect key={i} x={i * step + step * 0.18} y={H - bh} width={bw} height={bh} rx={0.8}
            fill={p.value ? "var(--f-chart)" : "var(--f-chart-dim)"} opacity={p.value ? 0.72 : 1} />;
        })}
      </svg>
    );
  }
  const mx = Math.max(...pts.map((p) => p.value)) || 1;
  const xy = pts.map((p, i) => [step * (i + 0.5), H - 3 - (p.value / mx) * (H - 9)] as const);
  const d = smooth(xy);
  /*  the id must be unique on the page: two gradients sharing one id makes the
      second chart take the first one's fill  */
  const gid = `sp-${id}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-[44px]" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.34" />
          <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="var(--f-chart)" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

export const CW = 760, CH = 250, CL = 56, CR = 10, CT = 16, CB = 30;
export const PW = CW - CL - CR, PH = CH - CT - CB;

interface HoverAt { i: number; x: number }

function useHover(n: number) {
  const box = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<HoverAt | null>(null);
  const step = n ? PW / n : PW;
  /*  the chart stays mounted when the period changes, so an index picked on a
      longer window would draw a crosshair off the plot and an empty tooltip  */
  useEffect(() => { setAt(null); }, [n]);
  function onMove(ev: React.MouseEvent) {
    const el = box.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * CW;
    const i = Math.max(0, Math.min(n - 1, Math.floor((vx - CL) / step)));
    setAt({ i, x: ((CL + step * (i + 0.5)) / CW) * r.width });
  }
  return { box, at, setAt, onMove, step };
}

function Tip({ at, children }: { at: HoverAt | null; children: React.ReactNode }) {
  if (!at) return null;
  return (
    <div className="absolute pointer-events-none rounded-[10px] px-3 py-[9px] text-[11.5px] leading-[1.55] whitespace-nowrap z-10"
      style={{ left: at.x, top: (CT / CH) * 100 + "%", transform: "translate(-50%,-110%)",
        background: "var(--t-main)", color: "var(--s-card)", boxShadow: "var(--elev-lift)" }}>
      {children}
    </div>
  );
}

function Axis({ pts, step }: { pts: Point[]; step: number }) {
  if (pts.length === 0) return null;
  const marks = Array.from(new Set([0, Math.floor(pts.length / 2), pts.length - 1]));
  return (
    <>
      {marks.map((i, k) => (
        <text key={i} x={CL + step * (i + 0.5)} y={CH - 8}
          textAnchor={k === 0 ? "start" : k === marks.length - 1 ? "end" : "middle"}
          className="text-[10.5px] font-semibold" fill="var(--t-faint)">
          {dayLabel(pts[i].date)}
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

/** day-by-day money or any other amount: smooth area, best day marked */
export function AreaChart({ pts, id, fmt, noun, best = true }: {
  pts: Point[]; id: string; fmt: (n: number) => string; noun: string; best?: boolean;
}) {
  const { box, at, setAt, onMove, step } = useHover(pts.length);
  const max = Math.max(...pts.map((p) => p.value), 0);
  const nice = Math.ceil(max / 500000) * 500000 || 500000;
  const xy = pts.map((p, i) => [CL + step * (i + 0.5), CT + PH - (p.value / nice) * PH] as const);
  const line = smooth(xy);
  let bi = 0;
  pts.forEach((p, i) => { if (p.value > pts[bi].value) bi = i; });

  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label={noun}>
        <defs>
          <linearGradient id={`ar-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Grid steps={4} label={(g) => axisTaka((nice * g) / 4)} />
        {pts.length > 0 && (
          <>
            <path d={`${line} L${xy[xy.length - 1][0].toFixed(1)} ${CT + PH} L${xy[0][0].toFixed(1)} ${CT + PH} Z`} fill={`url(#ar-${id})`} />
            <path d={line} fill="none" stroke="var(--f-chart)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => p.value ? (
              <circle key={i} cx={xy[i][0]} cy={xy[i][1]} r={best && i === bi ? 5 : 2.8}
                fill={best && i === bi ? "var(--s-card)" : "var(--f-chart)"}
                stroke={best && i === bi ? "var(--t-ok)" : "none"} strokeWidth={best && i === bi ? 2.5 : 0} />
            ) : null)}
            {best && pts[bi].value > 0 && pts.length > 1 && (
              <text x={xy[bi][0]} y={Math.max(CT + 9, xy[bi][1] - 12)} textAnchor="middle"
                className="text-[11px] font-bold" fill="var(--t-ok)">
                best day {fmt(pts[bi].value)}
              </text>
            )}
          </>
        )}
        <Axis pts={pts} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--f-chart)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>
      <Tip at={at}>
        {at && pts[at.i] ? (
          <>
            <span style={{ opacity: 0.65 }}>{dayLabel(pts[at.i].date)}</span><br />
            <b className="tabular-nums">{fmt(pts[at.i].value)}</b>
          </>
        ) : null}
      </Tip>
    </div>
  );
}

/** day-by-day counts: gradient bars */
export function BarChart({ pts, id, noun, unit }: { pts: Point[]; id: string; noun: string; unit: string }) {
  const { box, at, setAt, onMove, step } = useHover(pts.length);
  const peak = Math.max(...pts.map((p) => p.value), 0) || 1;
  /*  COUNTS ARE WHOLE THINGS, AND EQUAL SPACING MUST MEAN EQUAL STEPS.
      Four gridlines over a peak of 1 printed "0 0 1 1 1" - one number against
      three heights. Rounding the labels instead printed "0 2 3 5 6" for a peak
      of 6 - three different gaps drawn the same height. So the top of the
      chart is raised to a whole multiple of the step count, and the bars are
      measured against THAT, which is the line they are drawn under.  */
  const steps = Math.max(1, Math.min(4, peak));
  const max = Math.ceil(peak / steps) * steps;
  const bw = Math.max(2.5, Math.min(22, step - 3));
  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label={noun}>
        <defs>
          <linearGradient id={`bc-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--f-chart)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--f-chart)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <Grid steps={steps} label={(g) => String(Math.round((max * g) / steps))} />
        {pts.map((p, i) => {
          const bh = p.value ? Math.max(4, (p.value / max) * PH) : 3;
          return <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={CT + PH - bh} width={bw} height={bh}
            rx={Math.min(3.5, bw / 2)} fill={p.value ? `url(#bc-${id})` : "var(--f-chart-dim)"} />;
        })}
        <Axis pts={pts} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--f-chart)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>
      <Tip at={at}>
        {at && pts[at.i] ? (
          <>
            <span style={{ opacity: 0.65 }}>{dayLabel(pts[at.i].date)}</span><br />
            <b className="tabular-nums">{pts[at.i].value}</b> {unit}
          </>
        ) : null}
      </Tip>
    </div>
  );
}

/** above and below a zero line: earned green, lost red */
export function DivergeChart({ pts, id, fmt, noun, labels }: {
  pts: Point[]; id: string; fmt: (n: number) => string; noun: string;
  labels?: { up: string; down: string; flat: string };
}) {
  const { box, at, setAt, onMove, step } = useHover(pts.length);
  const max = Math.max(...pts.map((p) => Math.abs(p.value)), 0) || 1;
  const bw = Math.max(2.5, Math.min(22, step - 3));
  const mid = CT + PH / 2;
  const up = pts.filter((p) => p.value > 0).length;
  const down = pts.filter((p) => p.value < 0).length;
  const flat = pts.length - up - down;
  const L = labels ?? { up: "earned", down: "lost", flat: "nothing recorded" };
  return (
    <div className="relative mt-[18px]" ref={box} onMouseMove={onMove} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="block w-full overflow-visible" role="img" aria-label={noun}>
        <defs>
          <linearGradient id={`dvu-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-ok)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--t-ok)" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`dvd-${id}`} x1="0" y1="0" x2="0" y2="1">
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
        {pts.map((p, i) => {
          const bh = p.value ? Math.max(3.5, (Math.abs(p.value) / max) * (PH / 2)) : 3;
          return <rect key={i} x={CL + step * (i + 0.5) - bw / 2} y={p.value >= 0 ? mid - bh : mid}
            width={bw} height={bh} rx={Math.min(3, bw / 2)}
            fill={p.value > 0 ? `url(#dvu-${id})` : p.value < 0 ? `url(#dvd-${id})` : "var(--f-chart-dim)"} />;
        })}
        <Axis pts={pts} step={step} />
        {at ? <line x1={CL + step * (at.i + 0.5)} x2={CL + step * (at.i + 0.5)} y1={CT} y2={CT + PH}
          stroke="var(--t-ok)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} /> : null}
      </svg>
      <Tip at={at}>
        {at && pts[at.i] ? (
          <>
            <span style={{ opacity: 0.65 }}>{dayLabel(pts[at.i].date)}</span><br />
            <b className="tabular-nums">{fmt(pts[at.i].value)}</b>
          </>
        ) : null}
      </Tip>
      <div className="flex gap-2.5 flex-wrap mt-4">
        <Chip tone="ok">{`${L.up} · ${up} day${up === 1 ? "" : "s"}`}</Chip>
        <Chip tone="bad">{`${L.down} · ${down} day${down === 1 ? "" : "s"}`}</Chip>
        <Chip tone="mute">{`${L.flat} · ${flat} day${flat === 1 ? "" : "s"}`}</Chip>
      </div>
    </div>
  );
}

/** one card, several charts, one at a time behind a switch */
export function ChartCard<T extends string>({ title, tab, tabs, onTab, big, scope, children, empty }: {
  title: string; tab: T; tabs: { v: T; label: string }[]; onTab: (v: T) => void;
  big: string; scope?: React.ReactNode; children: React.ReactNode; empty?: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3.5 flex-wrap">
        <h2 className="text-[15.5px] font-semibold m-0 tracking-[-0.01em]" style={{ color: "var(--t-main)" }}>{title}</h2>
        <Seg<T> label="Which chart" value={tab} options={tabs} onPick={onTab} />
      </div>
      <div className="flex items-baseline gap-3 mt-3.5">
        <div className="text-[26px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: "var(--t-main)" }}>{big}</div>
        {scope}
      </div>
      {empty ? <p className="text-[12.5px] m-0 mt-6" style={{ color: "var(--t-faint)" }}>{empty}</p> : children}
    </Card>
  );
}

/* ═══════════════════════════ the live band ═══════════════════════════ */

export interface NowFigure { label: string; value: string; sub?: string; quiet?: boolean }
export interface NowJob { key: string; label: string; count: number; href: string; tone: "ok" | "info" | "warn" | "danger" }

const JOB_TONE: Record<string, "bad" | "warn" | "mute"> = { danger: "bad", warn: "warn", info: "mute", ok: "mute" };

/**
 * The band at the top of an overview: what is true right now, and what is
 * waiting on somebody.
 *
 * A job reading zero is NOT shown. A bar of zeros teaches the eye to skip the
 * bar, and the one row that mattered gets skipped with it.
 */
export function NowBand({ title, figures, jobs, note, loading, failed }: {
  title?: string; figures: NowFigure[]; jobs: NowJob[]; note?: string; loading?: boolean;
  /*  the source of the jobs did not answer. Without this the strip printed
      "Nothing is waiting." over a call that had failed - the worst kind of
      zero, because it is the one somebody acts on.  */
  failed?: boolean;
}) {
  const live = jobs.filter((j) => j.count > 0);
  return (
    <div className="rounded-[18px] border overflow-hidden mb-[18px]"
      style={{ background: "var(--s-accent)", borderColor: "var(--l-accent)", boxShadow: "var(--elev-soft)" }}>
      <div className="flex flex-wrap items-stretch">
        <div className="flex flex-wrap gap-x-10 gap-y-5 px-6 py-5 flex-1" style={{ minWidth: 300 }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--t-ok)", boxShadow: "0 0 0 3px var(--s-ok)" }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--t-accent)" }}>
                {title ?? "Right now"}
              </span>
            </div>
            <div className="text-[13px] mt-2.5" style={{ color: "var(--t-soft)" }}>
              {/*  the shop's own day. A browser set to UTC read 02:00 Dhaka as
                   yesterday, so the band and the figures disagreed.  */}
              {new Date(`${bdDay(0)}T00:00:00Z`).toLocaleDateString("en-GB",
                { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </div>
          </div>
          {figures.map((f) => (
            <div key={f.label}>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--t-faint)" }}>{f.label}</div>
              <div className="flex items-baseline gap-2.5 mt-2">
                <span className="text-[30px] font-bold tabular-nums leading-none tracking-[-0.03em]"
                  style={{ color: f.quiet ? "var(--t-faint)" : "var(--t-main)" }}>{f.value}</span>
                {f.sub ? <span className="text-[13px] tabular-nums" style={{ color: "var(--t-soft)" }}>{f.sub}</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-5 border-t xl:border-t-0 xl:border-l w-full xl:w-auto xl:max-w-[52%]"
          style={{ borderColor: "var(--l-accent)" }}>
          <SubHead>Waiting on someone</SubHead>
          <div className="flex flex-wrap gap-2 mt-3">
            {live.length === 0 ? (
              <span className="text-[12.5px]" style={{ color: "var(--t-faint)" }}>
                {loading ? "Loading…" : failed ? "This did not answer, so nothing here can be trusted." : "Nothing is waiting."}
              </span>
            ) : live.map((j) => {
              const tone = JOB_TONE[j.tone] ?? "mute";
              const st = tone === "bad" ? { background: "var(--s-bad)", color: "var(--t-bad)", borderColor: "var(--l-bad)" }
                : tone === "warn" ? { background: "var(--s-warn)", color: "var(--t-warn)", borderColor: "var(--l-warn)" }
                : { background: "var(--s-card)", color: "var(--t-soft)", borderColor: "var(--l-soft)" };
              return (
                <a key={j.key} href={j.href}
                  className="inline-flex items-center gap-2 rounded-full border pl-3 pr-2 py-[6px] text-[12px] font-medium transition-transform hover:-translate-y-[1px]"
                  style={st}>
                  {j.label}
                  <b className="tabular-nums text-[13px] font-bold px-[7px] py-[1px] rounded-full"
                    style={{ background: "color-mix(in srgb, currentColor 16%, transparent)" }}>
                    {j.count}
                  </b>
                </a>
              );
            })}
          </div>
          {note ? <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>{note}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** the standing note at the foot of an overview: which source is which */
export function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] leading-[1.65] mt-5 m-0" style={{ color: "var(--t-faint)" }}>{children}</p>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  getLens, formatLensValue,
  type LensKey, type RangeKey, type LensResult, type LensChart, type LensUnit,
} from "../_data/api";

/*  ANALYTICS — the whole business, one angle at a time.

    The owner's shape: lenses across the top, charts underneath. Click Delivery
    and you get delivery; click Sales and you get sales.

    ONE RENDERER FOR ALL NINE. Every lens arrives in the same {cards, charts}
    shape, so nothing below knows or cares which lens it is drawing. A tenth
    lens is a method on the server and no change at all here — which is the
    difference between a screen that grows and one nobody dares touch.

    "—" IS NOT A BUG. A card whose value is null could not be worked out, and
    says so rather than printing 0. On books that are still empty, zero
    everywhere would make a working lens and a broken one look identical — and
    that is precisely how /delivery/performance went on showing an invented
    94 % for weeks without anyone noticing.  */

const LENS_ORDER: { key: LensKey; label: string; icon: string }[] = [
  { key: "sales", label: "Sales", icon: "cash" },
  { key: "delivery", label: "Delivery", icon: "truck" },
  { key: "inventory", label: "Inventory", icon: "box" },
  { key: "products", label: "Products", icon: "tag" },
  { key: "customers", label: "Customers", icon: "user" },
  { key: "finance", label: "Finance", icon: "chart" },
  { key: "marketing", label: "Marketing", icon: "sparkle" },
  { key: "purchases", label: "Purchases", icon: "bag" },
  { key: "staff", label: "Staff", icon: "shield" },
];

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

const SERIES = "#2b7fd4";
const BAR = "#7d2ea8";

/*  The lens and the period live in the URL.

    Not decoration: without it, "the delivery numbers" is not a thing you can
    bookmark, send to somebody, or return to after a refresh — the screen always
    reopens on Sales and the reader has to find their way back. State that the
    reader chose belongs in the address bar. */
function readUrl(): { lens: LensKey; range: RangeKey } {
  if (typeof window === "undefined") return { lens: "sales", range: "30d" };
  const p = new URLSearchParams(window.location.search);
  const l = p.get("lens") as LensKey | null;
  const r = p.get("range") as RangeKey | null;
  return {
    lens: l && LENS_ORDER.some((x) => x.key === l) ? l : "sales",
    range: r === "today" || r === "month" || r === "year" || r === "30d" ? r : "30d",
  };
}

export function AnalyticsLenses() {
  const initial = readUrl();
  const [lens, setLens] = useState<LensKey>(initial.lens);
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [data, setData] = useState<LensResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getLens(lens, range));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [lens, range]);

  useEffect(() => { void load(); }, [load]);

  // keep the address bar in step, without adding a history entry per click
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.pathname}?lens=${lens}&range=${range}`;
    window.history.replaceState(null, "", url);
  }, [lens, range]);

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Intelligence"
        title="Analytics"
        actions={
          <Link href="/intelligence/kpis" className="rounded-[10px] border border-[var(--l-accent)] bg-white px-3 py-1.5 text-[12.5px] text-purple hover:bg-[var(--s-accent)]">
            Targets & KPIs
          </Link>
        }
      />

      {/* ---- the lenses ---- */}
      <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft mb-2">Analyse from</div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {LENS_ORDER.map((l) => {
          const on = l.key === lens;
          return (
            <button
              key={l.key}
              onClick={() => setLens(l.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] border transition-colors"
              style={{
                borderColor: on ? "var(--l-accent)" : "var(--l-accent)",
                background: on ? "var(--s-accent)" : "#fff",
                color: on ? "#fff" : "var(--t-accent)",
              }}
            >
              <Icon name={l.icon} size={13} />
              {l.label}
            </button>
          );
        })}
      </div>

      {/*  ---- the period ----
          The buttons go GREY and stop responding on a lens that cannot use
          them, and the lens says why underneath. Four of the nine used to
          ignore the period silently, which does not merely fail to help — it
          tells the reader the number covers a span it does not. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {RANGES.map((r) => {
          const on = r.key === range;
          const dead = data?.rangeMode === "none";
          return (
            <button
              key={r.key}
              onClick={() => !dead && setRange(r.key)}
              disabled={dead}
              className="rounded-[9px] px-3 py-1 text-[11.5px] border disabled:cursor-not-allowed"
              style={{
                borderColor: on && !dead ? "var(--l-info)" : "var(--l-accent)",
                background: on && !dead ? "var(--s-info)" : "#fff",
                color: dead ? "var(--t-main)" : on ? "var(--t-info)" : "var(--t-soft)",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {data?.rangeNote ? (
        <p className="text-[11.5px] text-body-soft mb-4 max-w-[760px] leading-relaxed">{data.rangeNote}</p>
      ) : (
        <div className="mb-4" />
      )}

      {err && (
        <div className="rounded-[12px] border border-[var(--l-bad)] bg-[var(--s-bad)] text-[var(--t-bad)] px-4 py-3 text-[13px]">{err}</div>
      )}

      {loading && !data && <p className="text-body-soft text-[13.5px]">Loading…</p>}

      {data && (
        <>
          {/*  When a lens genuinely has nothing, it says so in a sentence. It
              does NOT draw a row of empty charts and leave the reader to guess
              whether the data is missing or the screen is broken. */}
          {data.emptyNote && (
            <div className="rounded-[14px] border border-[var(--l-accent)] bg-[var(--s-accent)] px-4 py-3 text-[12.5px] text-purple mb-4 leading-relaxed">
              {data.emptyNote}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 mb-4">
            {data.cards.map((c) => (
              <div key={c.key} className="rounded-[14px] border border-[var(--l-accent)] bg-white px-3.5 py-3" title={c.hint}>
                <div className="text-[11.5px] text-body-soft leading-snug">{c.label}</div>
                <div className="font-display text-[21px] leading-none text-purple mt-1.5">
                  {formatLensValue(c.value, c.unit)}
                </div>
                {c.hint && <div className="text-[10.5px] text-body-soft mt-1.5 leading-snug">{c.hint}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.charts.map((ch) => <ChartCard key={ch.key} chart={ch} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ chart }: { chart: LensChart }) {
  const hasData =
    chart.kind === "line" ? chart.points.some((p) => p.value !== 0)
    : chart.kind === "bar" ? chart.rows.length > 0 && chart.rows.some((r) => r.value !== 0)
    : chart.parts.some((p) => p.value !== 0);

  return (
    <div className="rounded-[16px] border border-[var(--l-accent)] bg-white px-4 py-3.5">
      <div className="text-[13.5px] font-medium text-purple">{chart.title}</div>
      {chart.note && <div className="text-[11.5px] text-body-soft mt-0.5">{chart.note}</div>}

      {!hasData ? (
        /*  Same principle as the empty note above, one level down: an axis with
            nothing on it reads as a fault. A sentence does not. */
        <div className="text-[12px] text-body-soft mt-3 py-4">Nothing to draw for this period yet.</div>
      ) : chart.kind === "line" ? (
        <Line points={chart.points} />
      ) : chart.kind === "bar" ? (
        <Bars rows={chart.rows} unit={chart.unit} />
      ) : (
        <Split parts={chart.parts} unit={chart.unit} />
      )}
    </div>
  );
}

function Line({ points }: { points: { label: string; value: number }[] }) {
  if (points.length < 2) {
    return <div className="text-[12px] text-body-soft mt-3 py-4">One day is not a line yet.</div>;
  }
  const max = Math.max(...points.map((p) => p.value), 1);
  const w = 600;
  const h = 120;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i * step},${h - (p.value / max) * (h - 10)}`).join(" ");

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }} preserveAspectRatio="none">
        <polyline points={d} fill="none" stroke={SERIES} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10.5px] text-body-soft mt-1">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function Bars({ rows, unit }: { rows: { label: string; value: number; sub?: string }[]; unit: LensUnit }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="mt-3 space-y-2">
      {rows.slice(0, 10).map((r, i) => (
        <div key={`${r.label}-${i}`}>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-purple truncate">{r.label}</span>
            <span className="text-body-soft shrink-0">{formatLensValue(r.value, unit)}</span>
          </div>
          <div className="h-[6px] rounded-full bg-[var(--s-accent)] mt-1 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: BAR }} />
          </div>
          {r.sub && <div className="text-[10.5px] text-body-soft mt-0.5">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Split({ parts, unit }: { parts: { label: string; value: number }[]; unit: LensUnit }) {
  const total = parts.reduce((n, p) => n + Math.abs(p.value), 0) || 1;
  const colours = [BAR, SERIES, "#e08a1e", "#149a52"];
  return (
    <div className="mt-3">
      <div className="flex h-[10px] rounded-full overflow-hidden bg-[var(--s-accent)]">
        {parts.map((p, i) => (
          <div key={p.label} style={{ width: `${(Math.abs(p.value) / total) * 100}%`, background: colours[i % colours.length] }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {parts.map((p, i) => (
          <div key={p.label}>
            <div className="flex items-center gap-1.5">
              <span className="w-[8px] h-[8px] rounded-full" style={{ background: colours[i % colours.length] }} />
              <span className="text-[11.5px] text-body-soft">{p.label}</span>
            </div>
            <div className="font-display text-[18px] leading-none text-purple mt-1">{formatLensValue(p.value, unit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

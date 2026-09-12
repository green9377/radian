"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, Header, DemoBadge } from "./DeliveryUI";
import { formatTaka, formatBp, getForecast, type ForecastResult, type Projection } from "../_data/api";

/*  FORECASTING & MARKET — DEC-INT-006.

    The owner chose to build this on demo data, against my recommendation. The
    objection is in the architecture file; this screen carries the conditions
    that make the decision survivable.

    THE ONE THAT MATTERS IS THE SWITCH. Every projection says which it is —
    invented or worked out — and it changes over BY ITSELF when the shop has
    traded long enough. Nobody has to remember to come back. `/delivery/
    performance` showed an invented 94 % for weeks precisely because "wire it up
    later" was a person's job, and people do not.

    So the readiness bar is not decoration: it is the promise being kept in
    public, counting down where the reader can see it.  */

const REAL_BG = "#e9f9ef", REAL_BORDER = "#c2ecd3", REAL_TEXT = "#0e7a3d";
const DEMO_BG = "#f5eafb", DEMO_BORDER = "#e3c8f2", DEMO_TEXT = "#470066";

export function ForecastView() {
  const [data, setData] = useState<ForecastResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await getForecast()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (err) {
    return (
      <div className={WRAP}>
        <Header eyebrow="Intelligence" title="Forecast & market" />
        <div className="rounded-[12px] border border-[var(--l-bad)] bg-[var(--s-bad)] text-[var(--t-bad)] px-4 py-3 text-[13px]">{err}</div>
      </div>
    );
  }
  if (!data) return <div className={WRAP}><p className="text-body-soft text-[13.5px]">Loading…</p></div>;

  const anyDemo = data.projections.some((p) => p.source === "DEMO");

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Intelligence"
        title="Forecast & market"
      />

      {/*  Condition 4: the badge is at the TOP, above everything it applies to.
          A warning under the numbers is read after the numbers, which is too
          late to be a warning. */}
      {anyDemo && (
        <DemoBadge text="Some figures below are invented, and say so." />
      )}

      {/* ---- the countdown: the promise, kept in public ---- */}
      <div className="rounded-[16px] border border-[var(--l-accent)] bg-white px-4 py-3.5 mb-5">
        <div className="text-[13.5px] font-medium text-purple">How much history there is</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Stat label="Days with trading" value={String(data.readiness.daysRecorded)} />
          <Stat label="First recorded day" value={data.readiness.firstDay ?? "—"} />
          <Stat label="Weekly forecast" value={data.readiness.weekReady ? "Real" : "Not yet"} good={data.readiness.weekReady} />
          <Stat
            label="Monthly forecast"
            value={data.readiness.monthReady ? "Real" : `${data.readiness.daysUntilMonthReady} days to go`}
            good={data.readiness.monthReady}
          />
        </div>
      </div>

      {/* ---- the projections ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-6">
        {data.projections.map((p) => <ProjectionCard key={p.key} p={p} />)}
      </div>

      {/* ---- market ---- */}
      <h2 className="font-display text-[20px] text-purple leading-tight m-0 mb-1">Market demand</h2>
      <div
        className="rounded-[14px] border px-4 py-3 text-[12.5px] mb-3 leading-relaxed"
        style={{ background: DEMO_BG, borderColor: DEMO_BORDER, color: DEMO_TEXT }}
      >
        <b>Invented, and it will stay that way.</b> {data.market.note}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
        {data.market.items.map((m) => (
          <div key={m.label} className="rounded-[14px] border border-[var(--l-accent)] bg-white px-3.5 py-3">
            <div className="text-[12px] text-body-soft">{m.label}</div>
            <div
              className="font-display text-[20px] leading-none mt-1.5"
              style={{ color: m.changeBp >= 0 ? "var(--t-ok)" : "var(--t-bad)" }}
            >
              {m.changeBp >= 0 ? "+" : "−"}{formatBp(Math.abs(m.changeBp))}
            </div>
            <div className="text-[11px] text-body-soft mt-1.5 leading-snug">{m.note}</div>
          </div>
        ))}
      </div>

      {/*  Condition 5, said out loud. This module issues no buying advice at
          all — an over-forecast on flowers is money in a bin, and for a shop
          whose stock rots that is not a figure of speech. */}
      <div className="rounded-[14px] border border-[var(--l-warn)] bg-[var(--s-warn)] text-[var(--t-warn)] px-4 py-3 text-[12.5px] leading-relaxed">
        <b>No buying suggestions are made here.</b> {data.recommendationNote}
      </div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-[12px] px-3 py-2.5" style={{ background: good ? REAL_BG : "var(--s-accent)" }}>
      <div className="text-[11px]" style={{ color: good ? REAL_TEXT : "var(--t-soft)" }}>{label}</div>
      <div className="font-display text-[17px] leading-none mt-1" style={{ color: good ? REAL_TEXT : "var(--t-accent)" }}>{value}</div>
    </div>
  );
}

function ProjectionCard({ p }: { p: Projection }) {
  const real = p.source === "REAL";
  const bg = real ? REAL_BG : DEMO_BG;
  const border = real ? REAL_BORDER : DEMO_BORDER;
  const textCol = real ? REAL_TEXT : DEMO_TEXT;
  const max = Math.max(1, ...p.points.map((x) => x.value));

  return (
    <div className="rounded-[16px] border px-4 py-3.5" style={{ background: bg, borderColor: border }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13.5px] font-medium" style={{ color: textCol }}>{p.label}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
          style={{ background: real ? "var(--s-ok)" : "var(--s-accent)", color: "#fff" }}
        >
          {real ? "Worked out" : "Invented"}
        </span>
      </div>

      {/*  A FORECAST IS A RANGE. A single confident number is the lie — it
          invites a purchase decision that the data cannot support. */}
      <div className="font-display text-[24px] leading-none mt-2" style={{ color: textCol }}>
        {formatTaka(p.midPaisa)}
      </div>
      <div className="text-[11.5px] mt-1" style={{ color: textCol, opacity: 0.8 }}>
        somewhere between {formatTaka(p.lowPaisa)} and {formatTaka(p.highPaisa)}
      </div>

      {p.points.length > 0 && (
        <div className="flex items-end gap-1 h-[54px] mt-3">
          {p.points.map((pt, i) => (
            <div key={`${pt.label}-${i}`} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-[3px]"
                style={{ height: `${Math.max(3, (pt.value / max) * 42)}px`, background: real ? "var(--s-ok)" : "var(--s-accent)" }}
              />
              <span className="text-[9.5px]" style={{ color: textCol, opacity: 0.7 }}>{pt.label}</span>
            </div>
          ))}
        </div>
      )}

      {/*  How it was worked out, in the reader's own language. A forecast whose
          method is hidden can only be believed or ignored — never checked. */}
      <div className="text-[11.5px] mt-3 leading-relaxed" style={{ color: textCol, opacity: 0.85 }}>
        <Icon name="shield" size={12} /> {p.method}
      </div>

      {!real && (
        <div className="text-[11px] mt-2" style={{ color: textCol, opacity: 0.7 }}>
          {p.haveDays} of {p.needsDays} days of trading recorded.
        </div>
      )}
    </div>
  );
}

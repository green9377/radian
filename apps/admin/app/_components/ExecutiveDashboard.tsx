"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import { TONE, Panel, type Tone } from "./OrderViews";
import {
  formatTaka, formatBp,
  getIntelDashboard, getIntelHistory,
  type IntelDashboard, type IntelHistory, type IntelKpi, type Figure,
} from "../_data/api";

/*  EXECUTIVE DASHBOARD — DEC-INT-001.

    ONE PAGE. THREE SECTIONS. NOTHING HIDDEN.

    The jump bar at the top scrolls; it does not switch. That is the whole
    decision. Tabs were the first choice and were argued out of: whichever two
    tabs are not open stop being read inside a month, and "which tab opens
    first" is the original question wearing a different hat. Scrolling is free.
    Clicking is a decision the reader has to justify to themselves every time,
    and most days they decide not to.

    Crowding is handled the other way — four to six figures per section, and a
    Details link to the screen that already exists for everything else.

    EVERY LINE IN "TODAY" IS CLICKABLE. A dashboard row that cannot be acted on
    is read twice and then never again; that is how a dashboard dies, and why
    the work list is at the top rather than the sales figures.  */

const RAG: Record<string, { tone: Tone; label: string }> = {
  green: { tone: "green", label: "on target" },
  amber: { tone: "amber", label: "behind" },
  red: { tone: "rose", label: "well behind" },
  none: { tone: "purple", label: "no target set" },
};

const TONE_FOR: Record<string, Tone> = { ok: "green", info: "blue", warn: "amber", danger: "rose" };

function fmt(f: Figure, unit: "paisa" | "bp" | "count"): string {
  if (f.unavailable) return "—";
  if (unit === "paisa") return formatTaka(f.value);
  if (unit === "bp") return formatBp(f.value);
  return String(f.value);
}

/* ---------- a jump link. It scrolls. It does not hide the others. ---------- */
function Jump({ id, label, icon }: { id: string; label: string; icon: string }) {
  return (
    <a
      href={`#${id}`}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-white"
      style={{ borderColor: "#e4d3f2", color: "#ce6ef7", background: "#291a35" }}
    >
      <Icon name={icon} size={13} />
      {label}
    </a>
  );
}

function SectionHead({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <div id={id} className="scroll-mt-6 mb-3 mt-9 first:mt-0">
      <h2 className="font-display text-[20px] text-purple leading-tight m-0">{title}</h2>
      <p className="text-body-soft text-[12.5px] m-0 mt-0.5">{note}</p>
    </div>
  );
}

/* ---------- a KPI: figure, target, colour. No message. ---------- */
function KpiCard({ k }: { k: IntelKpi }) {
  const rag = RAG[k.rag] ?? RAG.none;
  const t = TONE[rag.tone];
  const target =
    k.targetValue == null
      ? null
      : k.unit === "paisa"
        ? formatTaka(k.targetValue)
        : formatBp(k.targetValue);

  return (
    <div className="rounded-[16px] border px-4 py-3.5" style={{ background: t.bg, borderColor: t.border }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[12px] font-medium" style={{ color: t.text }}>{k.label}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.05em] px-2 py-0.5 rounded-full"
          style={{ background: t.soft, color: t.text }}
        >
          {rag.label}
        </span>
      </div>

      <div className="font-display text-[26px] leading-none" style={{ color: t.text }}>
        {fmt(k.actual, k.unit)}
      </div>

      {/*  A figure that could not be worked out says WHY, in words, instead of
          printing a zero that looks like a real measurement of nothing. The
          on-time percentage lands here until Orders starts filling promisedBy —
          and the panel has been showing an invented 94 % from a demo file all
          this time, which is exactly what this replaces. */}
      {k.actual.unavailable ? (
        <div className="text-[11.5px] mt-1.5 leading-snug" style={{ color: t.text, opacity: 0.85 }}>
          {k.actual.unavailable}
        </div>
      ) : (
        <div className="text-[11.5px] mt-1 opacity-75" style={{ color: t.text }}>
          {target ? `${formatBp(k.progressBp ?? 0)} of ${target}` : "no target set for this month"}
        </div>
      )}

      {/*  INT-R09 — a percentage states its denominator. A rate that quietly
          divides by only the rows it could measure is not a rate, it is a
          flattering subset. */}
      {k.denominator && k.denominator.unmeasurable > 0 && (
        <div className="text-[11px] mt-1.5 leading-snug" style={{ color: t.text, opacity: 0.7 }}>
          {k.denominator.measurable} of {k.denominator.delivered} deliveries could be judged ·{" "}
          {k.denominator.unmeasurable} have no promised time and are not counted as late
        </div>
      )}

      {k.progressBp != null && !k.actual.unavailable && (
        <div className="mt-2.5 h-[6px] rounded-full overflow-hidden" style={{ background: t.soft }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, k.progressBp / 100))}%`, background: t.solid }}
          />
        </div>
      )}
    </div>
  );
}

export function ExecutiveDashboard() {
  const [data, setData] = useState<IntelDashboard | null>(null);
  const [history, setHistory] = useState<IntelHistory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await getIntelDashboard();
      setData(d);
      // history is OWNER/MANAGER only — a STAFF 403 is expected, not an error
      if (d.seesMoney) {
        try { setHistory(await getIntelHistory(30)); } catch { setHistory(null); }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className={WRAP}><p className="text-body-soft text-[13.5px]">Loading…</p></div>;
  }
  if (err) {
    return (
      <div className={WRAP}>
        <Header eyebrow="Intelligence" title="Executive dashboard" />
        <div className="rounded-[12px] border border-[#52282b] bg-[#391719] text-[#ed8078] px-4 py-3 text-[13px]">{err}</div>
      </div>
    );
  }
  if (!data) return null;

  const openWork = data.today.lines.filter((l) => l.count > 0);
  const clear = openWork.length === 0;

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Intelligence"
        title="Executive dashboard"
        desc="Everything on one page. The links below scroll — nothing is hidden behind them."
        actions={
          <div className="flex items-center gap-2">
            {/*  The dashboard answers "what is happening". The next question is
                always "why", and until now the only way through was the sidebar.
                A summary with no door to the detail is a dead end. */}
            {data?.seesMoney && (
              <>
                <Link href="/intelligence/analytics" className="rounded-[10px] border border-[#3f2d4e] bg-white px-3 py-1.5 text-[12.5px] text-purple hover:bg-[#291a35]">
                  Analytics
                </Link>
                <Link href="/intelligence/reports" className="rounded-[10px] border border-[#3f2d4e] bg-white px-3 py-1.5 text-[12.5px] text-purple hover:bg-[#291a35]">
                  Reports
                </Link>
              </>
            )}
            <button
              onClick={() => void load()}
              className="rounded-[10px] border border-[#3f2d4e] bg-white px-3 py-1.5 text-[12.5px] text-purple hover:bg-[#291a35]"
            >
              <Icon name="clock" size={13} /> Refresh
            </button>
          </div>
        }
      />

      {/* jump bar — scrolls, never switches (DEC-INT-001) */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Jump id="today" label="Today" icon="bolt" />
        <Jump id="business" label="Business" icon="chart" />
        {data.seesMoney && <Jump id="money" label="Money" icon="cash" />}
      </div>

      {/* ================= 1. TODAY ================= */}
      <SectionHead
        id="today"
        title="Today"
        note={`What is waiting. ${data.today.ordersToday} order${data.today.ordersToday === 1 ? "" : "s"} taken today.`}
      />

      {clear ? (
        <div className="rounded-[16px] border border-[#2d4d3a] bg-[#1c3626] px-4 py-5 text-[13.5px] text-[#76efab]">
          <Icon name="check" size={15} /> Nothing is waiting. Every order is packed, every delivery has a
          rider, and the books have nothing stuck in them.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {openWork.map((l) => {
            const t = TONE[TONE_FOR[l.tone] ?? "purple"];
            return (
              <Link
                key={l.key}
                href={l.href}
                className="rounded-[14px] border px-4 py-3 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
                style={{ background: t.bg, borderColor: t.border }}
              >
                <span className="font-display text-[24px] leading-none min-w-[34px]" style={{ color: t.text }}>
                  {l.count}
                </span>
                <span className="text-[12.5px] leading-snug flex-1" style={{ color: t.text }}>{l.label}</span>
                <Icon name="chevronDown" size={13} />
              </Link>
            );
          })}
        </div>
      )}

      {/*  the quiet lines stay visible but small — a count of zero is worth
          seeing once, and worth not shouting about */}
      {!clear && data.today.lines.some((l) => l.count === 0) && (
        <p className="text-body-soft text-[11.5px] mt-2.5">
          Clear: {data.today.lines.filter((l) => l.count === 0).map((l) => l.label.toLowerCase()).join(" · ")}
        </p>
      )}

      {/* ================= 2. BUSINESS ================= */}
      <SectionHead id="business" title="Business" note="How the month is going, against what you set as the target." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.business.kpis.map((k) => <KpiCard key={k.key} k={k} />)}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mt-3">
        {data.business.supporting.map((s) => (
          <div key={s.key} className="rounded-[14px] border border-[#3f3149] bg-white px-3.5 py-3">
            <div className="font-display text-[21px] leading-none text-purple">{fmt(s.value, s.unit)}</div>
            <div className="text-[11.5px] text-body-soft mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/*  history strip — read from DailySnapshot, never recomputed (DEC-INT-002).
          Empty is not a fault. It is a table with nothing to remember yet, and
          it says so rather than drawing a flat line that looks like zero sales. */}
      {data.seesMoney && (() => {
        const days = history?.days ?? [];
        /*  "Are there rows?" is the WRONG question, and asking it drew a flat
            line of zero-height bars that looked exactly like a broken chart —
            the thing this whole section was meant to avoid. The nightly sweep
            back-fills 90 days on first run, so rows exist immediately; what
            does not exist yet is anything to put in them.
            The right question is "did anything HAPPEN?". */
        const active = days.filter((d) => d.revenuePaisa > 0 || d.ordersCount > 0);
        const max = Math.max(1, ...days.map((d) => d.revenuePaisa));

        if (!data.meta.historyReady || active.length === 0) {
          return (
            <div className="mt-3 rounded-[14px] border border-[#3f2d4e] bg-[#291a35] px-4 py-3 text-[12.5px] text-purple leading-relaxed">
              <b>Nothing to chart yet.</b>{" "}
              {data.meta.snapshotDays === 0
                ? "A day is recorded once it has closed, so the first row appears after tonight."
                : `${data.meta.snapshotDays} days have been recorded and every one of them is empty — no sales have gone through the books yet.`}{" "}
              A chart is drawn once there is something to draw.
            </div>
          );
        }

        return (
          <div className="mt-3">
            <Panel
              title="Last 30 days"
              icon="chart"
              tone="blue"
              hint={`${active.length} of ${days.length} days had sales`}
            >
              <div className="p-4 flex items-end gap-[3px] h-[110px]">
                {days.map((d) => (
                  <div
                    key={d.onDate}
                    title={`${d.onDate} · ${formatTaka(d.revenuePaisa)} · ${d.ordersCount} orders`}
                    className="flex-1 rounded-t-[3px] min-w-[4px]"
                    style={{
                      height: `${Math.max(2, (d.revenuePaisa / max) * 100)}%`,
                      background: d.revenuePaisa > 0 ? "#2b7fd4" : "#172a3e",
                    }}
                  />
                ))}
              </div>
            </Panel>
          </div>
        );
      })()}

      {/* ================= 3. MONEY ================= */}
      {/*  DEC-INT-005 — STAFF never gets here, and more importantly never gets
          this in the JSON either. The server withholds it; this block only
          reflects that. A section hidden in the browser while the numbers still
          arrive is not a restriction, it is a rumour. */}
      {data.money ? (
        <>
          <SectionHead id="money" title="Money" note="Every figure here comes from Finance. None of it is worked out twice." />

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
            {data.money.figures.map((f) => (
              <Link
                key={f.key}
                href={f.href}
                className="rounded-[14px] border border-[#3f3149] bg-white px-3.5 py-3 transition-transform hover:-translate-y-0.5"
              >
                <div className="font-display text-[20px] leading-none text-purple">{fmt(f.value, "paisa")}</div>
                <div className="text-[11.5px] text-body-soft mt-1.5 leading-snug">{f.label}</div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="rounded-[14px] border border-[#3f3149] bg-white px-4 py-3.5">
              <div className="text-[12px] text-body-soft mb-1.5">Break-even this month</div>
              {data.money.breakEven.known ? (
                <>
                  <div className="font-display text-[22px] leading-none text-purple">
                    {formatBp(data.money.breakEven.progressBp)} of {formatTaka(data.money.breakEven.targetPaisa)}
                  </div>
                  <div className="mt-2.5 h-[6px] rounded-full overflow-hidden bg-[#2c1e37]">
                    <div className="h-full rounded-full bg-[#7d2ea8]" style={{ width: `${Math.min(100, data.money.breakEven.progressBp / 100)}%` }} />
                  </div>
                </>
              ) : (
                /* Finance refuses to guess a break-even on thin sales and returns 0
                   rather than a confident wrong number. Passed straight through. */
                <div className="text-[12.5px] text-body-soft leading-snug">
                  Not enough sales yet to work this out honestly. Finance would rather say so than
                  print a number it does not believe.
                </div>
              )}
            </div>

            <div className="rounded-[14px] border border-[#3f3149] bg-white px-4 py-3.5">
              <div className="text-[12px] text-body-soft mb-1.5">Runway at the current fixed costs</div>
              <div className="font-display text-[22px] leading-none text-purple">
                {data.money.runwayDays == null ? "—" : `${data.money.runwayDays} days`}
              </div>
              <div className="text-[11.5px] text-body-soft mt-1.5">
                {data.money.runwayDays == null
                  ? "No fixed costs recorded this month, so there is nothing to divide."
                  : "How long the spendable cash lasts if nothing else comes in."}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-body-soft text-[12px] mt-8">
          Cost, margin and cash are not shown for your account.
        </p>
      )}

      <p className="text-body-soft text-[11px] mt-8">
        Today&apos;s figures are live. History comes from the nightly record.
        Last generated {new Date(data.meta.generatedAt).toLocaleString("en-GB")}.
      </p>
    </div>
  );
}

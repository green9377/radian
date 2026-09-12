"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import { TONE, type Tone } from "./OrderViews";
import {
  formatTaka, formatBp, MONTH_NAMES,
  getKpiYear, getKpiMovement, getKpiWeekdays,
  saveKpiTarget, clearKpiTarget, copyKpiTargets,
  type KpiYear, type KpiMovement, type KpiWeekdays, type KpiName, type Rag, type KpiMonth,
} from "../_data/api";

/*  ANALYTICS & KPIs — DEC-INT-003.

    Two halves. "Where against the target" is the grid; "why" is underneath.

    THE THING THIS SCREEN MUST NOT DO is show a confident number for a month it
    knows nothing about. A month with no recorded days reports null, and null is
    drawn as "—", never as ৳0 — a zero would put a valley on the chart that
    never happened and make this year look like a recovery.  */

const RAG_TONE: Record<Rag, Tone> = { none: "purple", green: "green", amber: "amber", red: "rose" };

const KPI_META: Record<KpiName, { label: string; short: string; unit: "paisa" | "bp"; hint: string }> = {
  MONTHLY_SALES: { label: "Monthly sales", short: "Sales", unit: "paisa", hint: "Taka, for the whole month" },
  GROSS_MARGIN: { label: "Gross margin", short: "Margin", unit: "bp", hint: "Percent — what is left after what the goods cost" },
  ON_TIME_DELIVERY: { label: "On-time delivery", short: "On time", unit: "bp", hint: "Percent of deliveries that met the promised time" },
};

/** null means NOT KNOWN. It must never render as a number. */
function show(v: number | null, unit: "paisa" | "bp") {
  if (v === null) return "—";
  return unit === "paisa" ? formatTaka(v) : formatBp(v);
}

/** what the owner types → what the API stores */
function toStored(input: string, unit: "paisa" | "bp"): number | null {
  const n = Number(input.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  // taka → paisa, percent → basis points. Typing "95" for margin must not
  // become 0.95 %, which would turn the month green for ever.
  return unit === "paisa" ? Math.round(n * 100) : Math.round(n * 100);
}
function fromStored(v: number | null, unit: "paisa" | "bp") {
  if (v === null) return "";
  return unit === "paisa" ? String(v / 100) : String(v / 100);
}

export function KpiCentre() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<KpiYear | null>(null);
  const [movement, setMovement] = useState<KpiMovement | null>(null);
  const [weekdays, setWeekdays] = useState<KpiWeekdays | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ month: number; kpi: KpiName } | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const y = await getKpiYear(year);
      setData(y);
      const m = y.currentMonth ?? 12;
      const [mv, wd] = await Promise.all([getKpiMovement(year, m), getKpiWeekdays(90)]);
      setMovement(mv);
      setWeekdays(wd);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  async function commit(month: number, kpi: KpiName) {
    const unit = KPI_META[kpi].unit;
    setBusy(true);
    setErr(null);
    try {
      const stored = toStored(draft, unit);
      if (stored === null) await clearKpiTarget({ year, month, kpi });
      else await saveKpiTarget({ year, month, kpi, targetValue: stored });
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyFrom(month: number) {
    setBusy(true);
    setErr(null);
    try {
      const rest = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => m !== month);
      const r = await copyKpiTargets({ fromYear: year, fromMonth: month, toYear: year, months: rest });
      await load();
      setErr(r.skipped > 0
        ? `Filled ${r.written}. Left ${r.skipped} alone — those months already had a target.`
        : `Filled ${r.written} targets.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className={WRAP}>
        <Header eyebrow="Intelligence" title="Analytics & KPIs" />
        {err ? (
          <div className="rounded-[12px] border border-[var(--l-bad)] bg-[var(--s-bad)] text-[var(--t-bad)] px-4 py-3 text-[13px]">{err}</div>
        ) : (
          <p className="text-body-soft text-[13.5px]">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Intelligence"
        title="Analytics & KPIs"
        actions={
          <div className="flex items-center gap-1.5">
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className="rounded-[10px] border px-3 py-1.5 text-[12.5px]"
                style={{
                  borderColor: y === year ? "var(--l-accent)" : "var(--l-accent)",
                  background: y === year ? "var(--s-accent)" : "#fff",
                  color: y === year ? "#fff" : "var(--t-accent)",
                }}
              >
                {y}
              </button>
            ))}
          </div>
        }
      />

      {err && (
        <div className="rounded-[12px] border border-[var(--l-accent)] bg-[var(--s-accent)] text-purple px-4 py-2.5 text-[12.5px] mb-4">{err}</div>
      )}

      {/* ---------------- the grid: target vs actual, month by month ---------------- */}
      <div className="rounded-[16px] border border-[var(--l-accent)] bg-white overflow-hidden mb-6">
        <table className="w-full text-[12.5px]" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-[var(--s-accent)] text-purple">
              <th className="text-left font-medium px-3 py-2.5 w-[110px]">Month</th>
              {(Object.keys(KPI_META) as KpiName[]).map((k) => (
                <th key={k} className="text-left font-medium px-3 py-2.5" title={KPI_META[k].hint}>
                  {KPI_META[k].label}
                </th>
              ))}
              <th className="text-left font-medium px-3 py-2.5 w-[92px]">Orders</th>
              <th className="w-[52px]" />
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <MonthRow
                key={m.month}
                m={m}
                isCurrent={data.currentMonth === m.month}
                editing={editing}
                draft={draft}
                busy={busy}
                onEdit={(kpi) => {
                  const cell = m.kpis.find((c) => c.kpi === kpi)!;
                  setEditing({ month: m.month, kpi });
                  setDraft(fromStored(cell.target, KPI_META[kpi].unit));
                }}
                onDraft={setDraft}
                onCommit={commit}
                onCancel={() => setEditing(null)}
                onCopy={() => void copyFrom(m.month)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/*  ---------------- why the month moved ----------------
          Revenue can only change two ways: more people bought, or each person
          spent more. They call for opposite responses, and a shop that cannot
          tell them apart spends money on the wrong one. */}
      <h2 className="font-display text-[20px] text-purple leading-tight m-0 mb-3">Why it moved</h2>

      {movement && !movement.known ? (
        <div className="rounded-[14px] border border-[var(--l-accent)] bg-[var(--s-accent)] px-4 py-3 text-[12.5px] text-purple mb-6">
          {movement.why}
        </div>
      ) : movement && movement.known ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <Card
            tone={movement.totalChangePaisa >= 0 ? "green" : "rose"}
            label="Change on last month"
            value={(movement.totalChangePaisa >= 0 ? "+" : "−") + formatTaka(Math.abs(movement.totalChangePaisa))}
            sub={movement.changeBp !== null ? `${formatBp(Math.abs(movement.changeBp))} ${movement.changeBp >= 0 ? "up" : "down"}` : undefined}
          />
          <Card
            tone={movement.leadingReason === "volume" ? "blue" : "purple"}
            label="Because of order count"
            value={(movement.volumePaisa >= 0 ? "+" : "−") + formatTaka(Math.abs(movement.volumePaisa))}
            sub={`${movement.ordersFrom} → ${movement.ordersTo} orders`}
          />
          <Card
            tone={movement.leadingReason === "value" ? "blue" : "purple"}
            label="Because of basket size"
            value={(movement.valuePaisa >= 0 ? "+" : "−") + formatTaka(Math.abs(movement.valuePaisa))}
            sub={`${formatTaka(movement.aovFromPaisa)} → ${formatTaka(movement.aovToPaisa)} each`}
          />
        </div>
      ) : null}

      {/* ---------------- weekday pattern ---------------- */}
      <h2 className="font-display text-[20px] text-purple leading-tight m-0 mb-1">Which days sell</h2>
      <p className="text-body-soft text-[12.5px] m-0 mb-3">Last 90 days.</p>

      {weekdays && !weekdays.known ? (
        <div className="rounded-[14px] border border-[var(--l-accent)] bg-[var(--s-accent)] px-4 py-3 text-[12.5px] text-purple">
          No sales in the last 90 days.
        </div>
      ) : weekdays ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {weekdays.weekdays.map((d) => {
            const max = Math.max(1, ...weekdays.weekdays.map((x) => x.avgRevenuePaisa));
            return (
              <div key={d.name} className="rounded-[14px] border border-[var(--l-accent)] bg-white px-3.5 py-3">
                <div className="text-[11.5px] text-body-soft">{d.name.slice(0, 3)}</div>
                <div className="font-display text-[17px] leading-none text-purple mt-1.5">{formatTaka(d.avgRevenuePaisa)}</div>
                <div className="mt-2 h-[5px] rounded-full bg-[var(--s-accent)] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--s-accent)]" style={{ width: `${(d.avgRevenuePaisa / max) * 100}%` }} />
                </div>
                <div className="text-[11px] text-body-soft mt-1.5">{d.avgOrders} orders / day</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Card({ tone, label, value, sub }: { tone: Tone; label: string; value: string; sub?: string }) {
  const t = TONE[tone];
  return (
    <div className="rounded-[16px] border px-4 py-3.5" style={{ background: t.bg, borderColor: t.border }}>
      <div className="text-[12px] font-medium" style={{ color: t.text }}>{label}</div>
      <div className="font-display text-[24px] leading-none mt-1.5" style={{ color: t.text }}>{value}</div>
      {sub && <div className="text-[11.5px] mt-1 opacity-75" style={{ color: t.text }}>{sub}</div>}
    </div>
  );
}

function MonthRow({
  m, isCurrent, editing, draft, busy, onEdit, onDraft, onCommit, onCancel, onCopy,
}: {
  m: KpiMonth;
  isCurrent: boolean;
  editing: { month: number; kpi: KpiName } | null;
  draft: string;
  busy: boolean;
  onEdit: (kpi: KpiName) => void;
  onDraft: (v: string) => void;
  onCommit: (month: number, kpi: KpiName) => void;
  onCancel: () => void;
  onCopy: () => void;
}) {
  const noData = m.actual.daysRecorded === 0 && !m.actual.isCurrentMonth && !m.inFuture;

  return (
    <tr className="border-t border-[var(--l-accent)]" style={{ background: isCurrent ? "var(--s-accent)" : undefined }}>
      <td className="px-3 py-2.5">
        <span className="text-purple">{MONTH_NAMES[m.month - 1]}</span>
        {isCurrent && <span className="ml-1.5 text-[10px] uppercase tracking-[0.05em] text-orchid">now</span>}
        {/*  A month with nothing recorded is called out. Without this the row
            of dashes looks like a bug rather than an honest gap. */}
        {noData && <div className="text-[10.5px] text-body-soft mt-0.5">nothing recorded</div>}
      </td>

      {m.kpis.map((cell) => {
        const meta = KPI_META[cell.kpi];
        const t = TONE[RAG_TONE[cell.rag]];
        const isEditing = editing?.month === m.month && editing.kpi === cell.kpi;
        return (
          <td key={cell.kpi} className="px-3 py-2.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="font-medium"
                style={{ color: cell.rag === "none" ? "var(--t-soft)" : t.text }}
              >
                {show(cell.actual, meta.unit)}
              </span>
              {isEditing ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={draft}
                    disabled={busy}
                    onChange={(e) => onDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommit(m.month, cell.kpi);
                      if (e.key === "Escape") onCancel();
                    }}
                    placeholder={meta.unit === "paisa" ? "৳" : "%"}
                    className="w-[86px] rounded-[8px] border border-[var(--l-accent)] px-2 py-1 text-[12px] outline-none"
                    autoComplete="off"
                  />
                  <button onClick={() => onCommit(m.month, cell.kpi)} disabled={busy}
                    className="text-[11px] text-purple underline">save</button>
                  <button onClick={onCancel} className="text-[11px] text-body-soft underline">cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => onEdit(cell.kpi)}
                  className="text-[11.5px] rounded-full px-2 py-0.5 border"
                  style={{ borderColor: t.border, background: t.bg, color: t.text }}
                  title="Set target"
                >
                  {cell.target === null
                    ? "set target"
                    : `of ${show(cell.target, meta.unit)}${cell.progressBp !== null ? ` · ${formatBp(cell.progressBp)}` : ""}`}
                </button>
              )}
            </div>
          </td>
        );
      })}

      <td className="px-3 py-2.5 text-body-soft">
        {m.actual.ordersCount === null ? "—" : m.actual.ordersCount}
      </td>

      <td className="px-2 py-2.5">
        <button
          onClick={onCopy}
          disabled={busy}
          title="Copy to empty months"
          className="text-body-soft hover:text-purple"
        >
          <Icon name="copy" size={14} />
        </button>
      </td>
    </tr>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WRAP, ErrorBox } from "./OrderViews";
import { orderReport, formatTaka, type ApiOrderReport, type ApiOrderReportRow } from "../_data/api";
import { SOLID, Band, type Tile } from "./OrdersUi";

/*
  Orders -> Reports (owner, 9 Sep 2026; design/orders-module-v5.html).

  Counted by the database (GET /orders/report), never on screen. One date
  range at the top drives every card. Revenue counts delivered orders only —
  that is the moment Radian recognises a sale — and the same rule applies to
  every per-row revenue on this page. Product quantities count every line on
  a non-cancelled order.
*/

type Range = "today" | "7d" | "30d" | "month" | "all";
const RANGES: [Range, string][] = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["all", "All time"],
];
function bounds(r: Range): { from?: string; to?: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (r) {
    case "today":
      return { from: start.toISOString() };
    case "7d":
      start.setDate(start.getDate() - 6);
      return { from: start.toISOString() };
    case "30d":
      start.setDate(start.getDate() - 29);
      return { from: start.toISOString() };
    case "month":
      start.setDate(1);
      return { from: start.toISOString() };
    default:
      return {};
  }
}

const CARD = "bg-white border border-[#e4dbec] rounded-[14px] px-4 py-3.5";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={CARD}>
      <span className="block text-[11px] font-medium text-[#7b6b87] uppercase tracking-[0.04em]">{label}</span>
      <span className="block text-[20px] font-medium text-body mt-1 leading-none">{value}</span>
      {sub && <span className="block text-[11.5px] text-[#7b6b87] mt-1.5">{sub}</span>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-body">{title}</span>
        {hint && <span className="text-[11.5px] text-[#7b6b87]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function short(paisa: number): string {
  const t = paisa / 100;
  if (t >= 100_000) return `৳ ${(t / 100_000).toFixed(1)}L`;
  if (t >= 1_000) return `৳ ${(t / 1_000).toFixed(1)}k`;
  return formatTaka(paisa);
}

function Bars({ rows, by = "n" }: { rows: ApiOrderReportRow[]; by?: "n" | "revenuePaisa" }) {
  const max = Math.max(1, ...rows.map((r) => r[by]));
  if (rows.length === 0) return <span className="text-[12.5px] text-[#7b6b87]">No data in this range.</span>;
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[140px_1fr_120px] items-center gap-2.5 text-[12.5px]">
          <span className="text-body truncate">{r.label}</span>
          <div className="h-[8px] rounded-full bg-lavender-deep overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((r[by] / max) * 100)}%`, background: SOLID.purple }} />
          </div>
          <span className="text-right text-[#7b6b87] whitespace-nowrap">
            <span className="font-medium text-body">{r.n}</span> · {short(r.revenuePaisa)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayChart({ days }: { days: ApiOrderReport["day"] }) {
  if (days.length === 0) return <span className="text-[12.5px] text-[#7b6b87]">No data in this range.</span>;
  const shown = days.slice(-31);
  const max = Math.max(1, ...shown.map((d) => d.revenuePaisa));
  const best = shown.reduce((a, b) => (b.revenuePaisa > a.revenuePaisa ? b : a), shown[0]);
  const label = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return shown.length > 14 ? String(d.getDate()) : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  };
  return (
    <>
      <div className="flex items-end gap-[5px] h-[130px] border-b border-[#e4dbec]">
        {shown.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-[4px] relative min-w-[6px]"
            style={{ height: `${Math.max(2, Math.round((d.revenuePaisa / max) * 100))}%`, background: d === best ? SOLID.orchid : SOLID.purple, opacity: 0.9 }}
            title={`${d.date}: ${d.n} orders · ${d.delivered} delivered · ${formatTaka(d.revenuePaisa)}`}
          >
            <span className="absolute top-full left-0 right-0 text-center text-[10px] text-[#7b6b87] mt-1 whitespace-nowrap">{label(d.date)}</span>
          </div>
        ))}
      </div>
      <span className="block text-[12px] text-[#7b6b87] mt-6">
        Best day {new Date(best.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} · {best.n} orders · {formatTaka(best.revenuePaisa)}
      </span>
    </>
  );
}

export default function ReportsView() {
  const [range, setRange] = useState<Range>("7d");
  const [rep, setRep] = useState<ApiOrderReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRep(await orderReport(bounds(range)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    void load();
  }, [load]);

  const v = (f: (r: ApiOrderReport) => string) => (loading || !rep ? "…" : f(rep));
  const tiles: Tile[] = useMemo(
    () => [
      { key: "orders", label: "Orders", value: v((r) => String(r.totalOrders)) },
      { key: "delivered", label: "Delivered", value: v((r) => String(r.deliveredOrders)), sub: rep ? `${rep.totalOrders ? Math.round((rep.deliveredOrders / rep.totalOrders) * 100) : 0}% of orders` : undefined },
      { key: "revenue", label: "Revenue", value: v((r) => formatTaka(r.revenuePaisa)), sub: "delivered only" },
      { key: "aov", label: "Average order", value: v((r) => formatTaka(r.aovPaisa)), sub: "per delivered order" },
      { key: "cancelled", label: "Cancelled", value: v((r) => String(r.cancelledOrders)), hot: !!rep && rep.cancelledOrders > 0, sub: rep ? `${rep.cancelRatePct}%` : undefined },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rep, loading],
  );

  const products: ApiOrderReportRow[] = (rep?.products ?? []).map((p) => ({ label: p.label, n: p.qty, revenuePaisa: p.revenuePaisa }));

  return (
    <div className={WRAP}>
      <Band
        title="Reports"
        tiles={tiles}
        right={
          <select className="ipt h-[40px] min-w-[150px] font-medium bg-white" value={range} onChange={(e) => setRange(e.target.value as Range)}>
            {RANGES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        }
      />

      {error && <ErrorBox error={error} onRetry={() => void load()} />}

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <Card title="Sales by day" hint="revenue · delivered">
          <DayChart days={rep?.day ?? []} />
        </Card>
        <Card title="By delivery type" hint="orders · revenue">
          <Bars rows={rep?.method ?? []} />
        </Card>
      </div>
      <div className="grid md:grid-cols-3 gap-3 mb-3">
        <Card title="By channel" hint="orders · revenue">
          <Bars rows={rep?.channel ?? []} />
        </Card>
        <Card title="By payment" hint="orders · revenue">
          <Bars rows={rep?.payment ?? []} />
        </Card>
        <Card title="Self vs gift" hint="orders · revenue">
          <Bars rows={rep?.type ?? []} />
        </Card>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Top products" hint="qty · line revenue">
          <Bars rows={products} />
        </Card>
        <Card title="By zone" hint="orders · revenue">
          <Bars rows={rep?.zone ?? []} />
        </Card>
      </div>
    </div>
  );
}

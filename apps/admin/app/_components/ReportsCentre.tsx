"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import {
  listReports, runReport, formatReportCell, reportToCsv, downloadCsv,
  type ReportMeta, type ReportResult,
} from "../_data/api";

/*  REPORTS CENTRE — DEC-INT-004.

    Not new reports. The same figures the system already works out, in one
    place, with a date range and a way to get a file out.

    PDF IS THE BROWSER'S PRINT, DELIBERATELY.

    The obvious move is a PDF library on the server. It would have been wrong
    here: Mushak 6.3 is a Bangladeshi government form printed in Bangla, and
    pdfkit cannot shape complex scripts — conjuncts like ক্ত and ন্ধ come out
    broken into their parts. On a government form that is not a cosmetic
    problem, it is an invalid document.

    The browser shapes Bangla correctly, and the panel already prints the Mushak
    challan exactly this way. So: print for paper and PDF, CSV for the
    accountant. No new dependency on either side — the API still has none
    beyond Nest and Prisma.  */

const btn = "rounded-[10px] border border-[var(--l-accent)] bg-white px-3 py-1.5 text-[12.5px] text-purple hover:bg-[var(--s-accent)] disabled:opacity-50";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/*  Which report, and over what dates, lives in the URL — same reasoning as the
    Analytics lenses. "Send me the stock valuation" should be a link, not a set
    of instructions about which buttons to press. */
function readUrl() {
  if (typeof window === "undefined") return { key: "pnl", from: monthStartIso(), to: todayIso() };
  const p = new URLSearchParams(window.location.search);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const f = p.get("from");
  const t = p.get("to");
  return {
    key: p.get("key") ?? "pnl",
    from: f && iso.test(f) ? f : monthStartIso(),
    to: t && iso.test(t) ? t : todayIso(),
  };
}

export function ReportsCentre() {
  const initial = readUrl();
  const [metas, setMetas] = useState<ReportMeta[]>([]);
  const [active, setActive] = useState<string>(initial.key);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await listReports();
        setMetas(r.reports);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const meta = metas.find((m) => m.key === active);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await runReport(active, from, to));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [active, from, to]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}?key=${active}&from=${from}&to=${to}`);
  }, [active, from, to]);

  const groups = useMemo(() => {
    const g = new Map<string, ReportMeta[]>();
    for (const m of metas) g.set(m.group, [...(g.get(m.group) ?? []), m]);
    return [...g.entries()];
  }, [metas]);

  return (
    <div className={WRAP}>
      {/*  One stylesheet prints every report, because every report has the same
          shape. The chrome disappears; the numbers and the date range stay. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sheet { border: none !important; padding: 0 !important; }
          aside, nav { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
          table { font-size: 10.5px; }
        }
      `}</style>

      <div className="no-print">
        <Header eyebrow="Intelligence" title="Reports" />
      </div>

      {/* ---- pick a report ---- */}
      <div className="no-print mb-4">
        {groups.map(([group, items]) => (
          <div key={group} className="mb-2.5">
            <div className="text-[11px] font-bold tracking-[0.06em] uppercase text-body-soft mb-1.5">{group}</div>
            <div className="flex gap-1.5 flex-wrap">
              {items.map((m) => {
                const on = m.key === active;
                return (
                  <button
                    key={m.key}
                    onClick={() => setActive(m.key)}
                    title={m.description}
                    className="rounded-full px-3.5 py-1.5 text-[12.5px] border"
                    style={{
                      borderColor: on ? "var(--l-accent)" : "var(--l-accent)",
                      background: on ? "var(--s-accent)" : "#fff",
                      color: on ? "#fff" : "var(--t-accent)",
                    }}
                  >
                    {m.title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ---- range + actions ---- */}
      <div className="no-print flex items-end gap-2 flex-wrap mb-4">
        {meta?.usesRange ? (
          <>
            <label className="text-[11.5px] text-body-soft">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="block rounded-[9px] border border-[var(--l-accent)] px-2 py-1 text-[12.5px] mt-0.5" />
            </label>
            <label className="text-[11.5px] text-body-soft">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="block rounded-[9px] border border-[var(--l-accent)] px-2 py-1 text-[12.5px] mt-0.5" />
            </label>
          </>
        ) : (
          /*  A stock valuation has no date range, and offering one that does
              nothing is worse than not offering it. */
          <span className="text-[12px] text-body-soft pb-1.5">No date range — as things stand now.</span>
        )}

        <button className={btn} onClick={() => void load()} disabled={loading}>
          <Icon name="clock" size={13} /> Refresh
        </button>
        <button className={btn} onClick={() => window.print()} disabled={!data}>
          <Icon name="download" size={13} /> Print / save as PDF
        </button>
        <button
          className={btn}
          disabled={!data || data.rows.length === 0}
          onClick={() => {
            if (!data) return;
            const stamp = data.from ? `${data.from.slice(0, 10)}_${data.to?.slice(0, 10)}` : todayIso();
            downloadCsv(`radian-${data.key}-${stamp}.csv`, reportToCsv(data));
          }}
        >
          <Icon name="download" size={13} /> Download for Excel
        </button>
      </div>

      {err && (
        <div className="no-print rounded-[12px] border border-[var(--l-bad)] bg-[var(--s-bad)] text-[var(--t-bad)] px-4 py-3 text-[13px] mb-4">{err}</div>
      )}

      {loading && !data && <p className="text-body-soft text-[13.5px]">Loading…</p>}

      {data && (
        <div className="sheet bg-white border border-[var(--l-accent)] rounded-[16px] px-5 py-4">
          <div className="mb-3">
            <h2 className="font-display text-[20px] text-purple leading-tight m-0">{data.title}</h2>
            <p className="text-[12.5px] text-body-soft m-0 mt-0.5">{data.subtitle}</p>
            {data.from && (
              <p className="text-[11.5px] text-body-soft m-0 mt-0.5">
                {data.from.slice(0, 10)} to {data.to?.slice(0, 10)}
              </p>
            )}
          </div>

          {/*  A caveat is the report warning you about its OWN numbers. It goes
              ABOVE the table and it prints — a footnote nobody reads is how a
              partial figure gets quoted as a whole one. */}
          {data.caveat && (
            <div className="rounded-[10px] border border-[var(--l-warn)] bg-[var(--s-warn)] text-[var(--t-warn)] px-3.5 py-2 text-[12px] mb-3 leading-relaxed">
              {data.caveat}
            </div>
          )}

          {data.emptyNote ? (
            <div className="text-[12.5px] text-body-soft py-6">{data.emptyNote}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--l-accent)]">
                    {data.columns.map((c) => (
                      <th key={c.key} className={`py-1.5 px-2 font-medium text-purple ${c.numeric ? "text-right" : "text-left"}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--l-accent)]">
                      {data.columns.map((c) => (
                        <td key={c.key} className={`py-1.5 px-2 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                          {formatReportCell(row[c.key], c.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--l-accent)] font-medium">
                      {data.columns.map((c) => (
                        <td key={c.key} className={`py-2 px-2 text-purple ${c.numeric ? "text-right tabular-nums" : ""}`}>
                          {formatReportCell(data.totals![c.key], c.format)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          <p className="text-[10.5px] text-body-soft mt-4">
            Radian · printed {new Date().toLocaleString("en-GB")}
          </p>
        </div>
      )}

      {/*  Mushak is not a table, so it is not one of the reports above — it is a
          per-order government form with its own layout. Sending the reader
          there beats reproducing it badly. */}
      <p className="no-print text-[12px] text-body-soft mt-4">
        Mushak 6.3 VAT challan: <a href="/finance/vat" className="text-purple underline">Finance → VAT challan</a>
      </p>
    </div>
  );
}

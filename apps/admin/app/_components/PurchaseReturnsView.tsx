"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WRAP, ItemPageHead, DemoBar, DataTable, Kpi } from "./ItemUI";
import { fmtDate } from "./PurchaseViews";
import { listPurchaseReturns, formatTaka, type ApiPurchaseReturn } from "../_data/api";

/*
  Purchase returns — goods sent back to suppliers (DEC-PUR-006).
  Real-world basis: the owner returned ৳106,200 of stock after Valentine 2026.
  A return is created FROM its purchase (detail page → “Return goods”); this screen
  is the ledger of all of them.
*/

const ROW = "grid grid-cols-1 md:grid-cols-[130px_minmax(0,1fr)_110px_120px_120px_120px] items-center gap-2 px-4 py-3";

export default function PurchaseReturnsView() {
  const [rows, setRows] = useState<ApiPurchaseReturn[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await listPurchaseReturns());
      setIsDemo(false);
    } catch {
      // API unreachable — honest empty screen, no sample rows
      setRows([]);
      setIsDemo(true);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const total = rows.reduce((s, r) => s + r.totalPaisa, 0);
  const credit = rows.reduce((s, r) => s + r.creditPaisa, 0);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title="Returns to suppliers"
      />
      {isDemo && <DemoBar what="sample returns" onRetry={load} />}

      <Kpi items={[
        { l: "Total returned", v: formatTaka(total), c: "var(--t-accent)", bg: "var(--s-accent)", icon: "box" },
        { l: "Cut from dues", v: formatTaka(rows.reduce((s, r) => s + r.dueCutPaisa, 0)), c: "var(--t-warn)", bg: "var(--s-warn)", icon: "cash" },
        { l: "Became credit", v: formatTaka(credit), c: "var(--t-ok)", bg: "var(--s-ok)", icon: "check" },
        { l: "Returns", v: rows.length, c: "var(--t-info)", bg: "var(--s-info)", icon: "grid" },
        { l: "Suppliers", v: new Set(rows.map((r) => r.purchase?.supplierName)).size, c: "var(--t-warn)", bg: "var(--s-warn)", icon: "user" },
      ]} />

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>Return</span><span>Purchase · supplier</span><span>Date</span>
          <span className="text-right">Value</span><span className="text-right">Due cut</span><span className="text-right">Credit</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">No returns yet.</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className={ROW}>
            <span className="text-[13px] font-semibold text-purple">{r.returnNo}</span>
            <span className="text-[13px] text-body min-w-0 truncate">
              {r.purchase
                ? <Link href={`/purchases/${r.purchase.id}`} className="underline decoration-lavender-deep hover:decoration-orchid">
                    {r.purchase.purchaseNo} · {r.purchase.supplierName}
                  </Link>
                : "—"}
              {r.reason && <span className="text-body-soft"> · {r.reason}</span>}
            </span>
            <span className="text-[12.5px] text-body-soft">{fmtDate(r.returnDate)}</span>
            <span className="text-[13px] font-medium text-right">{formatTaka(r.totalPaisa)}</span>
            <span className="text-[13px] text-right" style={{ color: "var(--t-warn)" }}>{formatTaka(r.dueCutPaisa)}</span>
            <span className="text-[13px] text-right" style={{ color: r.creditPaisa > 0 ? "var(--t-ok)" : "var(--t-accent)" }}>
              {r.creditPaisa > 0 ? formatTaka(r.creditPaisa) : "—"}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

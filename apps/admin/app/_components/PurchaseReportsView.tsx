"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, QuickSelect } from "./ItemUI";
import { fmtDate } from "./PurchaseViews";
import {
  loadPurchasesSafe, loadItemsSafe, getPurchasePriceHistory,
  formatTaka, fmtQty,
  type ApiPurchase, type ApiItem, type PurchasePriceHistory,
} from "../_data/api";

/*
  Purchase reports — the three questions the owner actually asks:
    1. "মাসে কত টাকার কেনা হলো?"        → monthly bars
    2. "কোথায় কত বাকি?"                → supplier due board (indicative until the
                                          Supplier module — free-text names, DEC-PUR-003)
    3. "এই item-টা কবে কত দামে কিনেছি?" → per-item price history + current average
  Numbers aggregate over the loaded book (server caps at 500 most recent) — same
  D1 lesson as Sales: when the book outgrows this, move the maths server-side.
*/

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export default function PurchaseReportsView() {
  const [rows, setRows] = useState<ApiPurchase[]>([]);
  const [items, setItems] = useState<ApiItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const [histItem, setHistItem] = useState("");
  const [hist, setHist] = useState<PurchasePriceHistory | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, i] = await Promise.all([loadPurchasesSafe(), loadItemsSafe()]);
      setRows(p.purchases);
      setItems(i.items.filter((x) => x.isPurchasable));
      setIsDemo(p.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ---- price history for the picked item (demo: derived from the sample book)
  useEffect(() => {
    if (!histItem) { setHist(null); return; }
    (async () => {
      setHistLoading(true);
      try {
        setHist(await getPurchasePriceHistory(histItem));
      } catch {
        const lines = rows.flatMap((p) =>
          p.lines
            .filter((l) => l.itemId === histItem && l.receivedQtyMilli > 0)
            .map((l) => ({
              id: l.id, receivedQtyMilli: l.receivedQtyMilli, qtyMilli: l.qtyMilli,
              unitPricePaisa: l.unitPricePaisa, factorSnapshot: l.factorSnapshot,
              unit: l.unit ? { name: l.unit.name, shortCode: l.unit.shortCode } : null,
              purchase: { purchaseNo: p.purchaseNo, supplierName: p.supplierName, purchaseDate: p.purchaseDate },
            })),
        );
        let v = 0, b = 0;
        for (const l of lines) { v += Math.round((l.receivedQtyMilli * l.unitPricePaisa) / 1000); b += l.receivedQtyMilli * Math.max(l.factorSnapshot, 1); }
        setHist({ averagePaisa: b > 0 ? Math.round((v * 1000) / b) : null, lines });
      } finally { setHistLoading(false); }
    })();
  }, [histItem, rows]);

  const live = useMemo(() => rows.filter((p) => p.status !== "CANCELLED"), [rows]);

  // ---- 1. monthly bars (last 6 months, oldest first — a story reads forward)
  const months = useMemo(() => {
    const m = new Map<string, { bought: number; paid: number; due: number; count: number }>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      m.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), { bought: 0, paid: 0, due: 0, count: 0 });
    }
    for (const p of live) {
      const k = monthKey(new Date(p.purchaseDate));
      const slot = m.get(k);
      if (!slot) continue;
      slot.bought += p.grandTotalPaisa; slot.paid += p.paidPaisa; slot.due += p.duePaisa; slot.count += 1;
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v }));
  }, [live]);
  const maxMonth = Math.max(...months.map((m) => m.bought), 1);

  // ---- 2. supplier due board
  const supplierBoard = useMemo(() => {
    const m = new Map<string, { count: number; bought: number; due: number }>();
    for (const p of live) {
      const s = m.get(p.supplierName) ?? { count: 0, bought: 0, due: 0 };
      s.count += 1; s.bought += p.grandTotalPaisa; s.due += p.duePaisa;
      m.set(p.supplierName, s);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.due - a.due || b.bought - a.bought);
  }, [live]);

  const totals = useMemo(() => ({
    bought: live.reduce((s, p) => s + p.grandTotalPaisa, 0),
    paid: live.reduce((s, p) => s + p.paidPaisa, 0),
    due: live.reduce((s, p) => s + p.duePaisa, 0),
  }), [live]);

  const histItemObj = items.find((i) => i.id === histItem) ?? null;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title="Reports"
        blurb="Month by month buying, who is owed what, and every price you have ever paid for an item. Supplier totals are indicative until the Supplier module exists (free-text names, DEC-PUR-003)."
      />
      {isDemo && <DemoBar what="sample purchases" onRetry={load} />}

      <Kpi items={[
        { l: "Total bought (book)", v: formatTaka(totals.bought), c: "#470066", bg: "#f5eafb", icon: "box" },
        { l: "Paid", v: formatTaka(totals.paid), c: "#0e7a3d", bg: "#e8f7ef", icon: "check" },
        { l: "Still due", v: formatTaka(totals.due), c: totals.due > 0 ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "cash" },
        { l: "Purchases", v: live.length, c: "#2563a8", bg: "#e8f0fa", icon: "grid" },
        { l: "Suppliers", v: supplierBoard.length, c: "#b5642f", bg: "#f9efe6", icon: "user" },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {/* ---------------- monthly bars ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <b className="text-[14px] text-purple block mb-3">Buying, month by month</b>
          {loading && <p className="text-[13px] text-body-soft m-0">Loading…</p>}
          {months.map((m) => (
            <div key={m.k} className="mb-2.5">
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="text-body font-medium">{monthLabel(m.k)} <span className="text-body-soft">· {m.count} buys</span></span>
                <span className="font-semibold text-purple">{formatTaka(m.bought)}</span>
              </div>
              <div className="h-[10px] rounded-full overflow-hidden" style={{ background: "#f1eaf7" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((m.bought / maxMonth) * 100)}%`, background: `linear-gradient(90deg, ${ACCENT}, #cf43ea)` }} />
              </div>
              {m.due > 0 && <div className="text-[13px] mt-0.5" style={{ color: "#c0392b" }}>due {formatTaka(m.due)}</div>}
            </div>
          ))}
        </div>

        {/* ---------------- supplier due board ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <div className="px-5 py-3.5 border-b border-lavender-deep flex items-center justify-between">
            <b className="text-[14px] text-purple">Supplier board</b>
            <span className="text-[13px] text-body-soft">due first</span>
          </div>
          <div className="divide-y divide-lavender-deep max-h-[340px] overflow-y-auto">
            {supplierBoard.length === 0 && <p className="text-[13px] text-body-soft px-5 py-4 m-0">Nothing yet.</p>}
            {supplierBoard.map((s) => (
              <Link key={s.name} href={`/purchases/list`} className="grid grid-cols-[minmax(0,1fr)_60px_110px_110px] gap-2 items-center px-5 py-2.5 hover:bg-lavender/20">
                <span className="text-[13px] font-medium text-body truncate">{s.name}</span>
                <span className="text-[12.5px] text-body-soft text-right">×{s.count}</span>
                <span className="text-[13px] text-right">{formatTaka(s.bought)}</span>
                <span className="text-[13px] font-semibold text-right" style={{ color: s.due > 0 ? "#c0392b" : "#9b8aa6" }}>
                  {s.due > 0 ? formatTaka(s.due) : "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- item price history ---------------- */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <b className="text-[14px] text-purple">Item price history</b>
          <div className="min-w-[260px]">
            <QuickSelect
              value={histItem}
              placeholder="Pick an item…"
              options={items.map((i) => ({ id: i.id, label: i.name, hint: i.sku, imageUrl: i.imageUrl ?? null, tintSeed: i.sku }))}
              onChange={setHistItem}
            />
          </div>
          {histItemObj && hist?.averagePaisa != null && (
            <span className="text-[13px] ml-auto">
              current average <b className="text-purple">{formatTaka(hist.averagePaisa)}</b>
              <span className="text-body-soft"> / {histItemObj.unit?.name ?? "unit"}</span>
            </span>
          )}
        </div>

        {!histItem && <p className="text-[13px] text-body-soft m-0">Pick an item to see every price you have paid for it.</p>}
        {histItem && histLoading && <p className="text-[13px] text-body-soft m-0">Loading…</p>}
        {histItem && !histLoading && hist && hist.lines.length === 0 && (
          <p className="text-[13px] text-body-soft m-0">Never bought yet.</p>
        )}
        {histItem && !histLoading && hist && hist.lines.length > 0 && (
          <DataTable head={
            <div className="grid grid-cols-[130px_minmax(0,1fr)_110px_110px_110px] gap-2 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
              <span>Purchase</span><span>Supplier</span><span className="text-right">Qty</span><span className="text-right">Price/unit</span><span className="text-right">Date</span>
            </div>
          }>
            {hist.lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[130px_minmax(0,1fr)_110px_110px_110px] gap-2 px-4 py-2.5 items-center">
                <span className="text-[13px] font-semibold text-purple">{l.purchase.purchaseNo}</span>
                <span className="text-[13px] text-body truncate">{l.purchase.supplierName}</span>
                <span className="text-[13px] text-right">{fmtQty(l.receivedQtyMilli)} {l.unit?.name ?? ""}</span>
                <span className="text-[13px] font-medium text-right">{formatTaka(l.unitPricePaisa)}</span>
                <span className="text-[12.5px] text-body-soft text-right">{fmtDate(l.purchase.purchaseDate)}</span>
              </div>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}

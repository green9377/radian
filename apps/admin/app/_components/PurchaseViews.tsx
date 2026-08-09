"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, QuickSelect } from "./ItemUI";
import {
  loadPurchasesSafe, loadPurchaseStatsSafe, formatTaka, fmtQty,
  PURCHASE_STATUS_META,
  type ApiPurchase, type PurchaseStats, type PurchaseStatus,
} from "../_data/api";

/*
  Purchases — Overview + All purchases.
  Architecture: RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).

  Layout mirrors the owner's Biznify habits on purpose (three money cards up top:
  bought / paid / due) — that is the screen he has read every day for 1.5 years.
  What we do better: due is a FILTER, advance-waiting is impossible to miss, and
  every row says its payment state without opening it.
*/

export function StatusChip({ status }: { status: PurchaseStatus }) {
  const m = PURCHASE_STATUS_META[status];
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start"
      style={{ background: m.bg, color: m.colour }}>{m.label}</span>
  );
}

export function PayBadge({ p }: { p: ApiPurchase }) {
  if (p.status === "CANCELLED") return <span className="text-[12px] text-body-soft">—</span>;
  const map = {
    PAID: { label: "Paid", bg: "#12a172", color: "#fff" },
    PARTIAL: { label: "Part paid", bg: "#f59e0b", color: "#fff" },
    UNPAID: { label: "Unpaid", bg: "#e74c3c", color: "#fff" },
  } as const;
  const m = map[p.paymentState];
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start"
      style={{ background: m.bg, color: m.color }}>{m.label}</span>
  );
}

export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const NewBtn = () => (
  <Link href="/purchases/new"
    className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
    style={{ background: ACCENT }}>
    <Icon name="plus" size={13} /> New purchase
  </Link>
);

/* ================================================================== OVERVIEW */

export function PurchasesOverview() {
  const [stats, setStats] = useState<PurchaseStats | null>(null);
  const [rows, setRows] = useState<ApiPurchase[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([loadPurchaseStatsSafe(), loadPurchasesSafe()]);
      setStats(s.stats);
      setRows(p.purchases);
      setIsDemo(s.isDemo || p.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const dues = useMemo(
    () => rows.filter((r) => r.duePaisa > 0 && r.status !== "CANCELLED").sort((a, b) => b.duePaisa - a.duePaisa).slice(0, 5),
    [rows],
  );
  const recent = useMemo(() => rows.slice(0, 6), [rows]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title="Purchases"
        blurb="Everything Radian buys — market-morning flowers and supplier orders in ONE book. Stock does not move from here yet: that arrives with Inventory (DEC-PUR-002)."
        right={<NewBtn />}
      />
      {isDemo && <DemoBar what="sample purchases" onRetry={load} />}

      {stats && (
        <Kpi items={[
          { l: "Bought this month", v: formatTaka(stats.monthBoughtPaisa), c: "#470066", bg: "#f5eafb", icon: "box" },
          { l: "Total due to suppliers", v: formatTaka(stats.totalDuePaisa), c: stats.totalDuePaisa > 0 ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "cash" },
          { l: "Purchases with due", v: stats.dueCount, c: "#b45309", bg: "#fff4e6", icon: "bolt" },
          { l: "Advance paid, waiting", v: stats.advanceWaiting.length, c: "#2563a8", bg: "#e8f0fa", icon: "clock" },
          { l: "Credit with suppliers", v: formatTaka(stats.openCreditPaisa), c: "#0e8f74", bg: "#e7f5f1", icon: "check" },
        ]} />
      )}

      {/* advance-paid — money is out, goods are not in. The one list that must never hide. */}
      {stats && stats.advanceWaiting.length > 0 && (
        <div className="rounded-[16px] border px-5 py-4 mb-5 shadow-soft" style={{ background: "#fff4e6", borderColor: "#fce4c4" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white" style={{ background: "#b45309" }}><Icon name="clock" size={13} /></span>
            <b className="text-[14px]" style={{ color: "#8a5209" }}>Advance paid — goods on the way</b>
          </div>
          {stats.advanceWaiting.map((a) => (
            <Link key={a.id} href={`/purchases/${a.id}`}
              className="flex items-center justify-between gap-3 bg-white/70 rounded-[10px] px-3.5 py-2.5 mb-1.5 hover:bg-white">
              <span className="text-[13px] font-medium text-body">{a.purchaseNo} · {a.supplierName}</span>
              <span className="text-[12.5px] text-body-soft">{fmtDate(a.purchaseDate)}</span>
              <span className="text-[13px] font-semibold" style={{ color: "#b45309" }}>
                {formatTaka(a.paidPaisa)} <span className="font-normal text-body-soft">of {formatTaka(a.grandTotalPaisa)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* dues to clear */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <b className="text-[14px] text-purple">Dues to clear</b>
            <Link href="/purchases/list?status=due" className="text-[12.5px] font-medium underline" style={{ color: ACCENT }}>See all →</Link>
          </div>
          {dues.length === 0 && <p className="text-[13px] text-body-soft m-0">Nothing owed. 🎉</p>}
          {dues.map((p) => (
            <Link key={p.id} href={`/purchases/${p.id}`} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0 hover:bg-lavender/20 rounded-[8px] px-2 -mx-2">
              <span className="text-[13px] text-body min-w-0 truncate">{p.supplierName} <span className="text-body-soft">· {p.purchaseNo}</span></span>
              <span className="text-[13px] font-semibold shrink-0" style={{ color: "#c0392b" }}>{formatTaka(p.duePaisa)}</span>
            </Link>
          ))}
        </div>

        {/* recent */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <b className="text-[14px] text-purple">Recent purchases</b>
            <Link href="/purchases/list" className="text-[12.5px] font-medium underline" style={{ color: ACCENT }}>All purchases →</Link>
          </div>
          {loading && <p className="text-[13px] text-body-soft m-0">Loading…</p>}
          {recent.map((p) => (
            <Link key={p.id} href={`/purchases/${p.id}`} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0 hover:bg-lavender/20 rounded-[8px] px-2 -mx-2">
              <span className="text-[13px] text-body min-w-0 truncate">{fmtDate(p.purchaseDate)} · {p.supplierName}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[13px] font-medium">{formatTaka(p.grandTotalPaisa)}</span>
                <StatusChip status={p.status} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== ALL PURCHASES */

// no/date · supplier · items · total · paid · due · status · payment
const ROW = "grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.2fr)_100px_100px_100px_110px_92px] items-center gap-2 px-4 py-3";

const TABS: { id: string; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "RECEIVED", label: "Received" },
  { id: "ADVANCE_PAID", label: "Advance paid" },
  { id: "due", label: "Has due" },
  { id: "CANCELLED", label: "Cancelled" },
];

export function PurchaseListView() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiPurchase[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("ALL");
  const [supplier, setSupplier] = useState(""); // "" = all suppliers (Biznify's Select Supplier filter)

  async function load() {
    setLoading(true);
    try {
      const r = await loadPurchasesSafe();
      setRows(r.purchases);
      setIsDemo(r.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status");
    if (s && TABS.some((t) => t.id === s)) setTab(s);
  }, []);

  // the supplier shelf, straight from the loaded rows — free text today (DEC-PUR-003),
  // becomes the Supplier master when that module lands
  const suppliers = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) m.set(p.supplierName, (m.get(p.supplierName) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (supplier) r = r.filter((p) => p.supplierName === supplier);
    if (tab === "due") r = r.filter((p) => p.duePaisa > 0 && p.status !== "CANCELLED");
    else if (tab !== "ALL") r = r.filter((p) => p.status === tab);
    const needle = query.trim().toLowerCase();
    if (needle) {
      r = r.filter((p) =>
        p.purchaseNo.toLowerCase().includes(needle) ||
        p.supplierName.toLowerCase().includes(needle) ||
        (p.supplierReceiptNo ?? "").toLowerCase().includes(needle) ||
        p.lines.some((l) => (l.item?.name ?? "").toLowerCase().includes(needle)),
      );
    }
    return r;
  }, [rows, tab, query, supplier]);

  const totals = useMemo(() => ({
    bought: filtered.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.grandTotalPaisa, 0),
    paid: filtered.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.paidPaisa, 0),
    due: filtered.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.duePaisa, 0),
  }), [filtered]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title="All purchases"
        blurb="One book for every buy — a cash market run and a supplier order are the same row, only their steps differ (DEC-PUR-001)."
        right={<NewBtn />}
      />
      {isDemo && <DemoBar what="sample purchases" onRetry={load} />}

      <Kpi items={[
        { l: "Total (filtered)", v: formatTaka(totals.bought), c: "#470066", bg: "#f5eafb", icon: "box" },
        { l: "Paid", v: formatTaka(totals.paid), c: "#0e7a3d", bg: "#e8f7ef", icon: "check" },
        { l: "Due", v: formatTaka(totals.due), c: totals.due > 0 ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "cash" },
        { l: "Purchases", v: filtered.length, c: "#2563a8", bg: "#e8f0fa", icon: "grid" },
        { l: "Suppliers", v: new Set(filtered.map((p) => p.supplierName)).size, c: "#b5642f", bg: "#f9efe6", icon: "user" },
      ]} />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
            style={tab === t.id
              ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
              : { background: "#fff", borderColor: "#e3d7ec", color: "#6b5878" }}>
            {t.label}
          </button>
        ))}
        {/* Biznify's "Select Supplier" filter (owner, 22 Jul) — type-to-filter, house style */}
        <div className="min-w-[190px]">
          <QuickSelect
            value={supplier}
            placeholder="All suppliers"
            options={suppliers.map((s) => ({ id: s.name, label: s.name, hint: `×${s.count}` }))}
            onChange={setSupplier}
          />
        </div>
        <div className="relative ml-auto min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
          <input className="ipt ipt-icon w-full" placeholder="Search no, supplier, item…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>Purchase</span><span>Supplier</span><span>Items</span>
          <span className="text-right">Total</span><span className="text-right">Paid</span>
          <span className="text-right">Due</span><span>Status</span><span>Payment</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">
            Nothing here yet. <Link className="underline font-medium" style={{ color: ACCENT }} href="/purchases/new">Record your first purchase →</Link>
          </div>
        )}
        {filtered.map((p) => (
          <button key={p.id} onClick={() => router.push(`/purchases/${p.id}`)}
            className={ROW + " w-full text-left hover:bg-lavender/25 transition-colors"}>
            <span>
              <span className="block text-[13px] font-semibold text-purple">
                {p.purchaseNo}
                {/* DEC-PUR-014 — received but no stock movement; open it to repair */}
                {p.stockMissing && (
                  <span className="ml-1.5 align-middle text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[6px]"
                    style={{ background: "#fdebd0", color: "#8a5a00" }}>
                    stock not posted
                  </span>
                )}
              </span>
              <span className="block text-[13px] text-body-soft">{fmtDate(p.purchaseDate)}{p.partiallyReceived ? " · partly received" : ""}</span>
            </span>
            <span className="text-[13px] text-body min-w-0 truncate">{p.supplierName}</span>
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">
              {p.lines.map((l) => `${l.item?.name ?? "?"} ×${fmtQty(l.qtyMilli)}`).join(", ")}
            </span>
            <span className="text-[13px] font-medium text-right">{formatTaka(p.grandTotalPaisa)}</span>
            <span className="text-[13px] text-right" style={{ color: "#0e7a3d" }}>{formatTaka(p.paidPaisa)}</span>
            <span className="text-[13px] font-semibold text-right" style={{ color: p.duePaisa > 0 ? "#c0392b" : "#9b8aa6" }}>
              {p.duePaisa > 0 ? formatTaka(p.duePaisa) : "—"}
            </span>
            <StatusChip status={p.status} />
            <PayBadge p={p} />
          </button>
        ))}
      </DataTable>

      <p className="text-[12.5px] text-body-soft mt-3">
        Showing {filtered.length} of {rows.length} · Stock does <b>not</b> move from this screen.
      </p>
    </div>
  );
}

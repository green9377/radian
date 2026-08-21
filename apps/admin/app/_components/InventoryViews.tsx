"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ItemThumb } from "./ItemUI";
import { InvAdjustModal } from "./InventoryActions";
import {
  loadInvOverviewSafe, loadInvStockSafe, loadInvMovementsSafe, loadInvWarehousesSafe,
  formatTaka, fmtQty, INV_REASON_META,
  type ApiWarehouse, type InvMovement, type InvOverview, type InvReason, type InvStockRow,
} from "../_data/api";

/*
  Inventory — Overview + Stock board + Movements.
  Architecture: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).

  Decision-first (§12 conventions): the screen leads with what needs doing —
  negative rows (DEC-INV-011), low stock (DEC-INV-008), expiring lots
  (DEC-INV-007), wastage money (DEC-INV-005) — then the numbers.
  MAKE_TO_ORDER rows NEVER show a stock number: "can build N" (DEC-INV-010).
*/

export function fmtDT(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " + new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function StockNum({ r }: { r: InvStockRow }) {
  if (r.assemblyMode === "MAKE_TO_ORDER") {
    return (
      <span className="text-[12px] font-semibold px-2 py-1 rounded-full"
        style={{ background: "#f5eafb", color: ACCENT }}>
        can build {r.canBuild ?? 0}
      </span>
    );
  }
  const neg = r.totalQtyMilli < 0;
  return (
    <span className={"text-[13.5px] font-semibold " + (neg ? "" : "text-body")}
      style={neg ? { color: "#c0392b" } : undefined}>
      {fmtQty(r.totalQtyMilli)} <span className="font-normal text-[12px] text-body-soft">{r.unitShort}</span>
    </span>
  );
}

function ReasonChip({ reason }: { reason: InvReason }) {
  const m = INV_REASON_META[reason];
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start"
      style={{ background: m.bg, color: m.colour }}>{m.label}</span>
  );
}

/* ================================================================= OVERVIEW */

export function InventoryOverview() {
  const [ov, setOv] = useState<InvOverview | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await loadInvOverviewSafe();
      setOv(r.overview);
      setIsDemo(r.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const att = ov?.needsAttention;
  const attentionCount = (att?.negativeCount ?? 0) + (att?.lowCount ?? 0) + (att?.expiring.length ?? 0);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Inventory"
        right={
          <Link href="/inventory/stock"
            className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="box" size={13} /> Stock board
          </Link>
        }
      />
      {isDemo && <DemoBar what="sample stock" onRetry={load} />}

      {ov && (
        <Kpi items={[
          { l: "Stock value (AVCO)", v: formatTaka(ov.kpis.totalValuePaisa), c: "#470066", bg: "#f5eafb", icon: "box" },
          { l: "Wastage today", v: formatTaka(ov.kpis.wastageTodayPaisa), c: ov.kpis.wastageTodayPaisa > 0 ? "#c0392b" : "#0e7a3d", bg: "#fdecea", icon: "bolt" },
          { l: "Wastage this month", v: formatTaka(ov.kpis.wastageMonthPaisa), c: "#b45309", bg: "#fff4e6", icon: "cash" },
          { l: "Given free this month", v: formatTaka(ov.kpis.giftMonthPaisa), c: "#cf43ea", bg: "#fbeafe", icon: "heart" },
          { l: "Movements today", v: ov.kpis.movementsToday, c: "#2563a8", bg: "#e8f0fa", icon: "clock" },
        ]} />
      )}

      {/* needs attention — the reason this screen exists */}
      {att && attentionCount > 0 && (
        <div className="rounded-[16px] border px-5 py-4 mb-5 shadow-soft" style={{ background: "#fdecea", borderColor: "#f7cdc7" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white" style={{ background: "#c0392b" }}><Icon name="bolt" size={13} /></span>
            <b className="text-[14px]" style={{ color: "#8f2b20" }}>Needs attention ({attentionCount})</b>
          </div>

          {att.negative.map((r) => (
            <Link key={r.itemId} href="/inventory/stock?filter=negative"
              className="flex items-center gap-3 bg-white/70 rounded-[10px] px-3.5 py-2.5 mb-1.5 hover:bg-white">
              <ItemThumb item={r} size={30} />
              <span className="text-[13px] font-medium text-body flex-1 min-w-0 truncate">{r.name}</span>
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fdecea", color: "#c0392b" }}>
                negative {fmtQty(r.totalQtyMilli)} {r.unitShort}
              </span>
              <span className="text-[12.5px] text-body-soft">count it, then adjust</span>
            </Link>
          ))}

          {att.low.map((r) => (
            <Link key={r.itemId} href="/inventory/stock?filter=low"
              className="flex items-center gap-3 bg-white/70 rounded-[10px] px-3.5 py-2.5 mb-1.5 hover:bg-white">
              <ItemThumb item={r} size={30} />
              <span className="text-[13px] font-medium text-body flex-1 min-w-0 truncate">{r.name}</span>
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fff4e6", color: "#b45309" }}>
                low · {fmtQty(r.totalQtyMilli)} {r.unitShort}
              </span>
              <span className="text-[12.5px] text-body-soft">reorder at {r.reorderLevel}</span>
            </Link>
          ))}

          {att.expiring.map((l) => (
            <div key={l.id} className="flex items-center gap-3 bg-white/70 rounded-[10px] px-3.5 py-2.5 mb-1.5">
              <ItemThumb item={{ sku: l.item.sku, name: l.item.name, imageUrl: l.item.imageUrl }} size={30} />
              <span className="text-[13px] font-medium text-body flex-1 min-w-0 truncate">{l.item.name}</span>
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fbeafe", color: "#a2189f" }}>
                expires {new Date(l.expiryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <span className="text-[12.5px] text-body-soft">{fmtQty(l.qtyMilli)} left</span>
            </div>
          ))}
        </div>
      )}

      {!loading && att && attentionCount === 0 && (
        <div className="rounded-[16px] border px-5 py-4 mb-5 shadow-soft flex items-center gap-3" style={{ background: "#e8f7ef", borderColor: "#c9ecd8" }}>
          <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white" style={{ background: "#0e7a3d" }}><Icon name="check" size={13} /></span>
          <b className="text-[14px]" style={{ color: "#0e7a3d" }}>All clear — no negative stock, nothing low, no expiry alarms.</b>
        </div>
      )}

      {/* quick doors */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { href: "/inventory/opening", icon: "plus", label: "Opening stock", blurb: "enter your first counts" },
          { href: "/inventory/transfer", icon: "truck", label: "Transfer", blurb: "storeroom → shop, one step" },
          { href: "/inventory/issue", icon: "bolt", label: "Wastage & Gift", blurb: "write-offs in taka, at AVCO" },
          { href: "/inventory/movements", icon: "clock", label: "Movements", blurb: "the ledger — who, when, why" },
        ].map((d) => (
          <Link key={d.href} href={d.href}
            className="bg-white border border-lavender-deep rounded-[14px] shadow-soft px-4 py-3.5 hover:border-purple/40 transition-colors">
            <span className="w-[28px] h-[28px] rounded-[8px] grid place-items-center text-white mb-2" style={{ background: ACCENT }}>
              <Icon name={d.icon} size={14} />
            </span>
            <b className="block text-[13.5px] text-body">{d.label}</b>
            <span className="block text-[12px] text-body-soft">{d.blurb}</span>
          </Link>
        ))}
      </div>

    </div>
  );
}

/* ============================================================== STOCK BOARD */

/*  DEC-INV-017 — the columns are the warehouses that EXIST, not two guesses.
    Until 10 Aug this row hardcoded SHOP and STORE, and when a warehouse was
    missing it printed the name "Storeroom" anyway with a 0 under it. The owner
    was looking at a store that had never been created. Empty means empty.     */
const ROW = "grid gap-3 items-center px-4 py-3";
const rowCols = (warehouses: number) => ({
  gridTemplateColumns: `44px minmax(180px,1.4fr) ${'1fr '.repeat(Math.max(warehouses, 0) + 1)}100px 110px 74px`,
});

export function InvStockBoard() {
  const [rows, setRows] = useState<InvStockRow[]>([]);
  const [whs, setWhs] = useState<ApiWarehouse[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustRow, setAdjustRow] = useState<InvStockRow | null>(null);
  /*  tiles first — the same photo-card language as the till and the purchase
      picker (owner, 21 Aug: "tile and row system, jevabe pos and purchase
      pick item a show kre"); the row table stays one press away  */
  const [view, setView] = useState<"tiles" | "rows">("tiles");
  const [filter, setFilter] = useState<string>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("filter") ?? "all"
      : "all",
  );

  async function load() {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([loadInvStockSafe(), loadInvWarehousesSafe()]);
      setRows(s.rows);
      setWhs(w.rows);
      setIsDemo(s.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    let r = rows;
    const s = search.trim().toLowerCase();
    if (s) r = r.filter((x) => x.name.toLowerCase().includes(s) || x.sku.toLowerCase().includes(s));
    if (filter === "low") r = r.filter((x) => x.isLow);
    if (filter === "negative") r = r.filter((x) => x.isNegative);
    return r;
  }, [rows, search, filter]);

  const cols = whs.filter((w) => w.isActive);
  const whQty = (r: InvStockRow, id: string) =>
    r.perWarehouse.find((p) => p.warehouseId === id)?.qtyMilli ?? 0;

  const totalValue = shown.reduce((s, r) => s + Math.max(r.valuePaisa, 0), 0);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Stock board"
        right={
          <span className="flex gap-2">
            <Link href="/inventory/transfer"
              className="text-[13px] font-medium px-3.5 py-2.5 rounded-[10px] border border-lavender-deep text-purple hover:border-orchid bg-white">
              Transfer
            </Link>
            <Link href="/inventory/issue"
              className="text-white text-[13px] font-medium px-3.5 py-2.5 rounded-[10px]" style={{ background: "#c0392b" }}>
              Wastage / Gift
            </Link>
            <Link href="/inventory/opening"
              className="text-white text-[13px] font-medium px-3.5 py-2.5 rounded-[10px]" style={{ background: ACCENT }}>
              Opening stock
            </Link>
          </span>
        }
      />
      {isDemo && <DemoBar what="sample stock" onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={14} /></span>
          <input className="ipt ipt-icon h-[44px] max-w-[280px]" placeholder="Search name or SKU…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {([["all", "All"], ["low", "Low stock"], ["negative", "Negative"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
            style={filter === k
              ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
              : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
            {label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[13px] text-body-soft">
            {shown.length} items · value <b className="text-body">{formatTaka(totalValue)}</b>
          </span>
          <span className="flex rounded-[10px] border border-lavender-deep overflow-hidden">
            {(["tiles", "rows"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} title={v === "tiles" ? "Photo tiles" : "Table rows"}
                className="px-2.5 py-2"
                style={view === v ? { background: ACCENT, color: "#fff" } : { background: "#fff", color: "#6b5878" }}>
                <Icon name={v === "tiles" ? "grid" : "layers"} size={14} />
              </button>
            ))}
          </span>
        </span>
      </div>

      {/* ---------------- tiles ---------------- */}
      {view === "tiles" && (
        <>
          {loading && <p className="text-[13px] text-body-soft">Loading…</p>}
          {!loading && shown.length === 0 && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-10 text-center text-[13px] text-body-soft">
              Nothing here yet. Enter your first counts on the Opening stock screen.
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {shown.map((r) => {
              const mto = r.assemblyMode === "MAKE_TO_ORDER";
              return (
                <div key={r.itemId}
                  className="bg-white rounded-[14px] shadow-soft overflow-hidden border-2 flex flex-col"
                  style={{ borderColor: r.isNegative ? "#f0b4b4" : r.isLow ? "#f0d9a8" : "#efe4f7" }}>
                  <div className="flex items-center gap-2.5 px-3 pt-3">
                    <ItemThumb item={r} size={44} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-body leading-[1.25] truncate">{r.name}</span>
                      <span className="block text-[11px] text-body-soft truncate">{r.sku}</span>
                    </span>
                  </div>
                  <div className="px-3 py-2.5 flex items-end justify-between gap-2">
                    <span>
                      <span className="block text-[10px] uppercase tracking-[0.06em] text-body-soft font-semibold">In stock</span>
                      <b className="block text-[20px] leading-[1.1] font-display"
                        style={{ color: r.isNegative ? "#c0392b" : r.isLow ? "#b45309" : "#470066", fontVariantNumeric: "tabular-nums" }}>
                        {mto ? "—" : fmtQty(r.totalQtyMilli)}
                      </b>
                      <span className="block text-[10.5px] text-body-soft">{mto ? "made to order" : r.unitName}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[10px] uppercase tracking-[0.06em] text-body-soft font-semibold">Value</span>
                      <span className="block text-[13px] font-medium text-body" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {mto ? "—" : formatTaka(r.valuePaisa)}
                      </span>
                    </span>
                  </div>
                  {!mto && cols.length > 1 && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1">
                      {cols.map((w) => (
                        <span key={w.id} className="text-[10.5px] px-1.5 py-0.5 rounded-full"
                          style={{ background: "#f7f1fb", color: "#5c4a6b", fontVariantNumeric: "tabular-nums" }}>
                          {w.name.split(" ")[0]} {fmtQty(whQty(r, w.id))}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto border-t border-lavender-deep/60 flex">
                    {(r.isNegative || r.isLow) && (
                      <span className="text-[10.5px] font-bold px-2.5 py-2"
                        style={{ color: r.isNegative ? "#c0392b" : "#b45309" }}>
                        {r.isNegative ? "NEGATIVE" : "LOW"}
                      </span>
                    )}
                    {!mto && (
                      <button onClick={() => setAdjustRow(r)}
                        className="ml-auto text-[12px] font-semibold px-3 py-2 text-purple hover:bg-lavender/40">
                        Adjust
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---------------- rows ---------------- */}
      {view === "rows" && (
      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}
          style={rowCols(cols.length)}>
          <span /><span>Item</span>
          {cols.map((w) => <span key={w.id} className="text-right">{w.name}</span>)}
          <span className="text-right">Total</span>
          <span className="text-right">@ cost</span>
          <span className="text-right">Value</span>
          <span />
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && shown.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">
            Nothing here yet. Enter your first counts on the Opening stock screen.
          </div>
        )}
        {shown.map((r) => (
          <div key={r.itemId} style={rowCols(cols.length)}
            className={ROW + (r.isNegative ? " bg-[#fdecea]/40" : r.isLow ? " bg-[#fff4e6]/40" : "")}>
            <ItemThumb item={r} size={38} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-body truncate">
                {r.name}
                {r.trackExpiry && <span className="ml-2 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full align-middle" style={{ background: "#fbeafe", color: "#a2189f" }}>expiry</span>}
              </span>
              <span className="block text-[12px] text-body-soft">{r.sku} · {r.unitName}</span>
            </span>
            {r.assemblyMode === "MAKE_TO_ORDER" ? (
              <>
                {cols.map((w) => <span key={w.id} className="text-right text-[12.5px] text-body-soft">—</span>)}
                <span className="text-right"><StockNum r={r} /></span>
              </>
            ) : (
              <>
                {cols.map((w) => (
                  <span key={w.id} className="text-right text-[13px] text-body">{fmtQty(whQty(r, w.id))}</span>
                ))}
                <span className="text-right"><StockNum r={r} /></span>
              </>
            )}
            <span className="text-right text-[12.5px] text-body-soft">{formatTaka(r.unitCostPaisa)}</span>
            <span className="text-right text-[13px] font-medium text-body">{r.assemblyMode === "MAKE_TO_ORDER" ? "—" : formatTaka(r.valuePaisa)}</span>
            {r.assemblyMode === "MAKE_TO_ORDER" ? <span /> : (
              <button onClick={() => setAdjustRow(r)}
                className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid justify-self-end">
                Adjust
              </button>
            )}
          </div>
        ))}
      </DataTable>
      )}

      {adjustRow && (
        <InvAdjustModal row={adjustRow} whs={whs}
          onClose={() => setAdjustRow(null)} onDone={load} />
      )}
    </div>
  );
}

/* ================================================================ MOVEMENTS */

const MROW = "grid grid-cols-[44px_minmax(160px,1.3fr)_110px_1fr_100px_110px_130px] gap-3 items-center px-4 py-3";

export function InvMovementsView() {
  const [rows, setRows] = useState<InvMovement[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("reason") ?? ""
      : "",
  );

  async function load(r = reason) {
    setLoading(true);
    try {
      const res = await loadInvMovementsSafe(r ? { reason: r } : undefined);
      setRows(res.rows);
      setIsDemo(res.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reason]);

  const reasons = Object.keys(INV_REASON_META) as InvReason[];

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Movements"
      />
      {isDemo && <DemoBar what="sample movements" onRetry={() => load()} />}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setReason("")}
          className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
          style={!reason ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
          All
        </button>
        {reasons.map((k) => (
          <button key={k} onClick={() => setReason(k)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
            style={reason === k
              ? { background: INV_REASON_META[k].colour, color: "#fff", borderColor: INV_REASON_META[k].colour }
              : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
            {INV_REASON_META[k].label}
          </button>
        ))}
      </div>

      <DataTable head={
        <div className={MROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span /><span>Item</span><span>Reason</span><span>Note</span>
          <span className="text-right">Qty</span><span className="text-right">Value</span><span className="text-right">When · who</span>
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">No movements yet.</div>
        )}
        {rows.map((m) => (
          <div key={m.id} className={MROW}>
            <ItemThumb item={m.item} size={38} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-body truncate">{m.item.name}</span>
              <span className="block text-[12px] text-body-soft">{m.item.sku} · {m.warehouse.name}</span>
            </span>
            <ReasonChip reason={m.reason} />
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">{m.note ?? "—"}</span>
            <span className="text-right text-[13px] font-semibold" style={{ color: m.qtyMilli < 0 ? "#c0392b" : "#0e7a3d" }}>
              {m.qtyMilli > 0 ? "+" : ""}{fmtQty(m.qtyMilli)}
            </span>
            <span className="text-right text-[13px] text-body">{formatTaka(Math.abs(m.valuePaisa))}</span>
            <span className="text-right text-[12px] text-body-soft">{fmtDT(m.createdAt)}<br />{m.actor ?? "—"}</span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  WRAP, ACCENT, ItemPageHead, DemoBar, DataTable, ItemThumb, Modal, Field,
  QuickSelect, ErrBar, OkBar, msg,
} from "./ItemUI";
import { ItemPicker } from "./PurchaseNewView";
import {
  listItems, formatTaka, fmtQty, toMilli, getIssueReasons, addIssueReason,
  loadInvWarehousesSafe, loadInvTransfersSafe, loadInvIssuesSafe,
  postInvOpening, postInvTransfer, postInvIssue, postInvAdjust,
  type ApiItem, type ApiWarehouse, type InvIssue, type InvStockRow, type InvTransfer,
} from "../_data/api";

/*
  Inventory — the ACTION screens: Opening stock · Transfer · Wastage & Gift · Adjust.
  Architecture: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).

  Biznify-audit shape (owner, 22 Jul): plain entry form on top, history right below
  on the SAME page — the pattern his staff already know. One save posts the ledger
  movements atomically through InventoryService (INV-RULE-001).
*/


type Line = { key: number; itemId: string; qty: string; expiryDate?: string };
let lineKey = 1;
const newLine = (): Line => ({ key: lineKey++, itemId: "", qty: "" });

/** items stock can move for: tracked, physical, not derived (MAKE_TO_ORDER holds no stock) */
function pickable(items: ApiItem[]): ApiItem[] {
  return items.filter(
    (i) => i.isStockTracked && i.itemType !== "SERVICE" && i.assemblyMode !== "MAKE_TO_ORDER" && i.isActive,
  );
}

function useInvBase() {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [whs, setWhs] = useState<ApiWarehouse[]>([]);
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    const w = await loadInvWarehousesSafe();
    setWhs(w.rows);
    setIsDemo(w.isDemo);
    try {
      setItems(pickable(await listItems()));
    } catch {
      setItems([]); // demo mode — pickers explain themselves
    }
  }
  useEffect(() => { load(); }, []);

  const options = useMemo(
    () => items.map((i) => ({
      id: i.id,
      label: i.name,
      hint: `${i.sku} · ${i.unit?.name ?? ""}`,
      imageUrl: i.imageUrl ?? null,
      tintSeed: i.sku,
    })),
    [items],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);
  return { items, byId, options, whs, isDemo, reload: load };
}

function WhPills({ whs, value, onChange, exclude }: {
  whs: ApiWarehouse[]; value: string; onChange: (id: string) => void; exclude?: string;
}) {
  return (
    <div className="flex gap-2">
      {whs.filter((w) => w.id !== exclude).map((w) => (
        <button key={w.id} type="button" onClick={() => onChange(w.id)}
          className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
          style={value === w.id
            ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
            : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
          {w.name}
        </button>
      ))}
    </div>
  );
}

/*  Shared multi-item line editor. The item is CHOSEN in the same photo picker
    the till and the purchase form use (owner, 21 Aug: "pick an item a click
    krle jen pos ar purchases ar moto ase") — a dropdown of bare names made
    staff guess which rose was which. A chosen line shows its face and stays.  */
function LinesEditor({ lines, setLines, items, byId, showValue, showExpiry, have, nothingLeft }: {
  lines: Line[];
  setLines: (l: Line[]) => void;
  /** what the picker offers — already filtered to what this screen may touch */
  items: ApiItem[];
  byId: Map<string, ApiItem>;
  showValue?: boolean;
  showExpiry?: boolean;
  /** Transfer only — how much the source store holds, so you cannot move air */
  have?: { label: string; qtyMilliOf: (itemId: string) => number };
  /** shown INSTEAD of the Add button when the picker would open empty */
  nothingLeft?: React.ReactNode;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const patch = (key: number, p: Partial<Line>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));

  /*  grid-cols-[…] cannot be stitched together at runtime — Tailwind collects
      class names at build time (got burned once on the Stock board). Hence
      the inline style.  */
  const cols = "grid gap-2.5 items-center";
  const grid = {
    gridTemplateColumns: [
      "minmax(220px,1fr)", "110px",
      have && "110px", showExpiry && "150px", showValue && "110px", "36px",
    ].filter(Boolean).join(" "),
  };

  return (
    <div>
      {lines.length > 0 && (
        <div style={grid} className={cols + " mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft"}>
          <span>Item</span><span>Qty</span>
          {have && <span className="text-right">{have.label}</span>}
          {showExpiry && <span>Expiry (if any)</span>}
          {showValue && <span className="text-right">Worth</span>}
          <span />
        </div>
      )}
      {lines.map((l) => {
        const item = byId.get(l.itemId);
        const cost = item?.effectiveCostPaisa ?? 0;
        const value = Math.round(toMilli(l.qty || 0) * cost / 1000);
        const stock = have && item ? have.qtyMilliOf(l.itemId) : 0;
        const tooMuch = !!have && !!item && toMilli(l.qty || 0) > stock;
        return (
          <div key={l.key} style={grid} className={cols + " mb-2"}>
            <span className="flex items-center gap-2.5 min-w-0">
              {item && <ItemThumb item={item} size={34} />}
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-body truncate">{item?.name ?? "?"}</span>
                <span className="block text-[11px] text-body-soft truncate">{item?.sku}{item?.unit?.name ? ` · ${item.unit.name}` : ""}</span>
              </span>
            </span>
            <input className="ipt" placeholder={item ? item.unit?.name ?? "Qty" : "Qty"}
              inputMode="decimal" value={l.qty}
              onChange={(e) => patch(l.key, { qty: e.target.value })} />
            {have && (
              /* red the moment the line asks for more than the source holds —
                 the API allows it (INV-RULE-006 never blocks), so the warning
                 has to be here, before the press, not after */
              <span className="text-right text-[13px]"
                style={{ color: tooMuch ? "#c0392b" : "#5c4a6b" }}>
                {item ? `${fmtQty(stock)}${tooMuch ? " ⚠" : ""}` : "—"}
              </span>
            )}
            {showExpiry && (
              item?.trackExpiry
                ? <input type="date" className="ipt" value={l.expiryDate ?? ""}
                    onChange={(e) => patch(l.key, { expiryDate: e.target.value })} />
                : <span className="text-[12px] text-body-soft">n/a</span>
            )}
            {showValue && (
              <span className="text-right text-[13px] font-medium text-body">
                {item && l.qty ? formatTaka(value) : "—"}
              </span>
            )}
            <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              className="text-body-soft hover:text-purple text-[17px]" title="Remove line">×</button>
          </div>
        );
      })}
      {items.filter((i) => !lines.some((l) => l.itemId === i.id)).length === 0 && nothingLeft ? (
        /*  an empty picker reads as a bug (owner, 21 Aug: "main storeroom
            select krle kon item ase na kn?") — so when there is truly nothing
            left to offer, the screen says WHY instead of opening a blank list  */
        lines.length === 0 ? <div className="mt-1">{nothingLeft}</div> : null
      ) : (
        <>
          {lines.length === 0 && (
            <p className="text-[13px] text-body-soft mt-1 mb-2">Nothing on the sheet yet — press <b>Add items</b> and pick from your shelf.</p>
          )}
          <button type="button" onClick={() => setPickOpen(true)}
            className="text-[12.5px] font-medium inline-flex items-center gap-1.5 mt-1"
            style={{ color: ACCENT }}>
            <Icon name="plus" size={12} /> Add items
          </button>
        </>
      )}

      {pickOpen && (
        <ItemPicker
          items={items.filter((i) => !lines.some((l) => l.itemId === i.id))}
          onClose={() => setPickOpen(false)}
          onDone={(picked) => {
            setLines([
              ...lines,
              ...picked.map(({ item, qty }) => ({ key: lineKey++, itemId: item.id, qty: String(qty) })),
            ]);
            setPickOpen(false);
          }}
        />
      )}
    </div>
  );
}

function validLines(lines: Line[]): { itemId: string; qtyMilli: number; expiryDate?: string }[] {
  return lines
    .filter((l) => l.itemId && toMilli(l.qty) > 0)
    .map((l) => ({ itemId: l.itemId, qtyMilli: toMilli(l.qty), ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}) }));
}

/* ── one shape for every action screen (10 Aug 2026) ──────────────────────
   Owner: "3 vag ar ak vag design pore ache" — each action page was a single
   760px card on a 1900px screen. Now they share one mould: work sheet on the
   left, running totals + button on the right. Styling three pages separately
   would have drifted into three designs — so the shell lives here once.    */

function ActionShell({ sheet, panel }: { sheet: React.ReactNode; panel: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start max-w-[1300px] mb-6">
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">{sheet}</div>
      <div className="grid gap-3">{panel}</div>
    </div>
  );
}

/** the sheet's top strip — where the "from / to / type" choices live */
const SheetBar = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 border-b border-lavender-deep">{children}</div>
);

const SheetNote = ({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) => (
  <div className="flex items-center gap-3 px-4 py-3 border-t border-lavender-deep">
    <span className="text-[12.5px] text-body-soft shrink-0">Note</span>
    <input className="ipt w-full" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

function SummaryCard({ rows }: { rows: { label: string; value: string; big?: boolean; tone?: string }[] }) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-4 py-4">
      {rows.map((r, i) => (
        <div key={r.label} className={i ? "mt-3" : ""}>
          <span className="block text-[12.5px] text-body-soft">{r.label}</span>
          {r.big
            ? <b className="block text-[24px] font-semibold leading-tight" style={{ color: r.tone ?? "#470066" }}>{r.value}</b>
            : <b className="block text-[15px] text-body">{r.value}</b>}
        </div>
      ))}
    </div>
  );
}

const PanelHint = ({ tone = "#8a5a00", bg = "#fff4e6", children }: {
  tone?: string; bg?: string; children: React.ReactNode;
}) => (
  <div className="rounded-[12px] px-3 py-2.5" style={{ background: bg }}>
    <span className="text-[12px]" style={{ color: tone }}>{children}</span>
  </div>
);

const SaveBtn = ({ onClick, busy, disabled, label, full }: {
  onClick: () => void; busy: boolean; disabled: boolean; label: string; full?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled || busy}
    className={`text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40${full ? " w-full" : ""}`}
    style={{ background: ACCENT }}>
    {busy ? "Saving…" : label}
  </button>
);

/* ================================================================= OPENING */

export function InvOpeningView() {
  const { items, byId, whs, isDemo, reload } = useInvBase();
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  /* itemId → warehouseIds it has already moved in (DEC-INV-012) */
  const [touched, setTouched] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => { if (!warehouseId && whs.length) setWarehouseId(whs[0].id); }, [whs, warehouseId]);

  useEffect(() => {
    /*  A stock row only exists after the first movement — so the row existing
        means "this item already moves in this warehouse". No new endpoint.  */
    (async () => {
      try {
        const st = await loadInvStockSafe();
        const m = new Map<string, Set<string>>();
        for (const r of st.rows) m.set(r.itemId, new Set(r.perWarehouse.map((p) => p.warehouseId)));
        setTouched(m);
      } catch { setTouched(new Map()); }
    })();
  }, []);

  /*  DEC-INV-012 — an item that has already moved cannot be "opened" again;
      the API refuses. It used to be pickable and fail on save. Now it never
      enters the list — the guaranteed mistake cannot be made. Same rule,
      caught earlier.                                                        */
  const openable = useMemo(
    () => items.filter((i) => !(warehouseId && touched.get(i.id)?.has(warehouseId))),
    [items, touched, warehouseId],
  );
  const hiddenCount = items.length - openable.length;

  const ready = validLines(lines);
  const worthPaisa = ready.reduce((s, l) => {
    const it = byId.get(l.itemId);
    return s + Math.round((l.qtyMilli * (it?.effectiveCostPaisa ?? 0)) / 1000);
  }, 0);
  const whName = whs.find((w) => w.id === warehouseId)?.name ?? "—";

  async function save() {
    const ls = validLines(lines);
    if (!ls.length || !warehouseId) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await postInvOpening({
        lines: ls.map((l) => ({ ...l, warehouseId })),
        note: note || undefined,
      });
      setOk(`Opening posted — ${r.posted} item(s). Counted numbers are now the truth.`);
      setLines([]); setNote("");
    } catch (e) { setErr(msg(e, "Could not post opening stock")); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Opening stock"
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <ActionShell
        sheet={
          <>
            <SheetBar>
              <span className="text-[12.5px] text-body-soft">Counting in</span>
              <WhPills whs={whs.filter((w) => w.isActive)} value={warehouseId} onChange={setWarehouseId} />
            </SheetBar>
            <div className="px-4 py-3">
              <LinesEditor lines={lines} setLines={setLines} items={openable} byId={byId} showExpiry showValue
                nothingLeft={
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "#fff4e6", color: "#8a5a00" }}>
                    Every item already moves in <b>{whName}</b>, so there is nothing left to open here —
                    an opening only STARTS a ledger (DEC-INV-012). To correct a count, use{" "}
                    <Link href="/inventory/stock" className="font-semibold underline">Adjust on the Stock board</Link>;
                    a brand-new item appears here as soon as it is created.
                  </div>
                } />
            </div>
            <SheetNote value={note} onChange={setNote} placeholder="e.g. First count, 10 Aug morning" />
          </>
        }
        panel={
          <>
            <SummaryCard rows={[
              { label: "Counting into", value: whName },
              { label: "Lines ready", value: String(ready.length), big: true },
              { label: "Worth at cost", value: formatTaka(worthPaisa), big: true },
            ]} />
            <SaveBtn onClick={save} busy={busy} disabled={!warehouseId || ready.length === 0} label="Post opening stock" full />
            {hiddenCount > 0 && (
              <PanelHint>
                <b>{hiddenCount} item{hiddenCount > 1 ? "s" : ""}</b> already moving in {whName} {hiddenCount > 1 ? "are" : "is"} not
                in the list — opening only starts a ledger. Change one on the Stock board with Adjust.
              </PanelHint>
            )}
          </>
        }
      />
    </div>
  );
}

/* ================================================================ TRANSFER */

export function InvTransferView() {
  const { items, byId, whs, isDemo, reload } = useInvBase();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [history, setHistory] = useState<InvTransfer[]>([]);
  const [histDemo, setHistDemo] = useState(false);

  useEffect(() => {
    if (whs.length >= 2 && !fromId) {
      const store = whs.find((w) => w.code === "STORE") ?? whs[1];
      const shop = whs.find((w) => w.code === "SHOP") ?? whs[0];
      setFromId(store.id); setToId(shop.id);
    }
  }, [whs, fromId]);

  async function loadHistory() {
    const r = await loadInvTransfersSafe();
    setHistory(r.rows); setHistDemo(r.isDemo);
  }
  useEffect(() => { loadHistory(); }, []);

  /*  Show what each warehouse holds — writing a transfer without it is moving goods blind. */
  const [stock, setStock] = useState<InvStockRow[]>([]);
  useEffect(() => {
    (async () => { try { setStock((await loadInvStockSafe()).rows); } catch { setStock([]); } })();
  }, []);
  const stockInFrom = (itemId: string) =>
    stock.find((r) => r.itemId === itemId)?.perWarehouse.find((p) => p.warehouseId === fromId)?.qtyMilli ?? 0;

  /*  the picker offers only what the source store actually holds (owner,
      22 Aug: "jekhane je product ache sekhane jen tai dekhay") — a transfer
      of goods that are not there is written blind and lands negative  */
  const transferable = useMemo(
    () => items.filter((i) => stockInFrom(i.id) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, stock, fromId],
  );

  async function save() {
    const ls = validLines(lines);
    if (!ls.length || !fromId || !toId || fromId === toId) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const t = await postInvTransfer({ fromWarehouseId: fromId, toWarehouseId: toId, lines: ls, note: note || undefined });
      setOk(`${t.transferNo} posted — OUT and IN in one transaction (DEC-INV-004).`);
      setLines([]); setNote("");
      loadHistory();
    } catch (e) { setErr(msg(e, "Could not post transfer")); }
    finally { setBusy(false); }
  }

  const whName = (id: string) => whs.find((w) => w.id === id)?.name ?? "?";
  const fromName = whs.find((w) => w.id === fromId)?.name ?? "";
  const toName = whs.find((w) => w.id === toId)?.name ?? "";
  const ready = validLines(lines);
  const worthPaisa = ready.reduce((s, l) => {
    const it = byId.get(l.itemId);
    return s + Math.round((l.qtyMilli * (it?.effectiveCostPaisa ?? 0)) / 1000);
  }, 0);
  const shortLines = ready.filter((l) => l.qtyMilli > stockInFrom(l.itemId)).length;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Transfer"
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <ActionShell
        sheet={
          <>
            <SheetBar>
              <span className="flex items-center gap-2.5">
                <span className="text-[12.5px] text-body-soft">From</span>
                <WhPills whs={whs.filter((w) => w.isActive)} value={fromId}
                  onChange={(id) => { setFromId(id); if (id === toId) setToId(""); }} />
              </span>
              <span className="text-body-soft"><Icon name="truck" size={14} /></span>
              <span className="flex items-center gap-2.5">
                <span className="text-[12.5px] text-body-soft">To</span>
                <WhPills whs={whs.filter((w) => w.isActive)} value={toId} onChange={setToId} exclude={fromId} />
              </span>
            </SheetBar>
            <div className="px-4 py-3">
              <LinesEditor lines={lines} setLines={setLines} items={transferable} byId={byId}
                have={{ label: `In ${fromName || "source"}`, qtyMilliOf: stockInFrom }}
                nothingLeft={
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "#fff4e6", color: "#8a5a00" }}>
                    <b>{fromName || "This store"}</b> holds nothing to move. Goods appear here
                    once a purchase lands there or a count puts them there.
                  </div>
                } />
            </div>
            <SheetNote value={note} onChange={setNote} placeholder="e.g. Morning restock for the shop floor" />
          </>
        }
        panel={
          <>
            <SummaryCard rows={[
              { label: "Route", value: `${fromName || "—"} → ${toName || "—"}` },
              { label: "Lines ready", value: String(ready.length), big: true },
              { label: "Worth at cost", value: formatTaka(worthPaisa), big: true },
            ]} />
            <SaveBtn onClick={save} busy={busy}
              disabled={!fromId || !toId || fromId === toId || ready.length === 0}
              label="Post transfer" full />
            {shortLines > 0 && (
              <PanelHint>
                <b>{shortLines} line{shortLines > 1 ? "s" : ""}</b> ask{shortLines > 1 ? "" : "s"} for more than {fromName} holds.
                It will still post and show as negative — count that store first if that is not what you meant.
              </PanelHint>
            )}
          </>
        }
      />

      <h3 className="font-display text-[17px] text-purple mb-2.5">Recent transfers</h3>
      {histDemo && <DemoBar what="sample transfers" onRetry={loadHistory} />}
      <DataTable head={
        <div className="grid grid-cols-[110px_1fr_180px_140px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span>No.</span><span>Items</span><span>Route</span><span className="text-right">When · who</span>
        </div>
      }>
        {history.length === 0 && <div className="px-4 py-6 text-[13px] text-body-soft">No transfers yet.</div>}
        {history.map((t) => (
          <div key={t.id} className="grid grid-cols-[110px_1fr_180px_140px] gap-3 items-center px-4 py-3">
            <span className="text-[13px] font-semibold text-purple">{t.transferNo}</span>
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">
              {t.lines.map((l) => `${l.item.name} ×${fmtQty(l.qtyMilli)}`).join(", ")}
            </span>
            <span className="text-[12.5px] text-body">{whName(t.fromWarehouseId)} → {whName(t.toWarehouseId)}</span>
            <span className="text-right text-[12px] text-body-soft">
              {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {t.actor ?? "—"}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

/* ============================================================ WASTAGE & GIFT */

export function InvIssueView() {
  const { items, byId, whs, isDemo, reload } = useInvBase();
  const [kind, setKind] = useState<"WASTAGE" | "GIFT">("WASTAGE");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [history, setHistory] = useState<InvIssue[]>([]);
  const [allHistory, setAllHistory] = useState<InvIssue[]>([]); // totals ignore the filter tab
  const [histDemo, setHistDemo] = useState(false);
  const [histKind, setHistKind] = useState<string>("");

  useEffect(() => {
    if (!warehouseId && whs.length) {
      const shop = whs.find((w) => w.code === "SHOP") ?? whs[0];
      setWarehouseId(shop.id);
    }
  }, [whs, warehouseId]);

  /*  same rule as Transfer (owner, 22 Aug): only what THIS store holds can be
      wasted or gifted out of it  */
  const [stock, setStock] = useState<InvStockRow[]>([]);
  useEffect(() => {
    (async () => { try { setStock((await loadInvStockSafe()).rows); } catch { setStock([]); } })();
  }, []);
  const stockHere = (itemId: string) =>
    stock.find((r) => r.itemId === itemId)?.perWarehouse.find((p) => p.warehouseId === warehouseId)?.qtyMilli ?? 0;
  const issuable = useMemo(
    () => items.filter((i) => stockHere(i.id) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, stock, warehouseId],
  );

  async function loadHistory(k = histKind) {
    const [r, all] = await Promise.all([
      loadInvIssuesSafe(k || undefined),
      k ? loadInvIssuesSafe() : Promise.resolve(null),
    ]);
    setHistory(r.rows); setHistDemo(r.isDemo);
    setAllHistory(all ? all.rows : r.rows);
  }
  useEffect(() => { loadHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [histKind]);

  /*  DEC-GBL-004 — the reasons are the shop's, not the screen's. A list nobody
      can add to goes stale (the same lesson as return reasons, same day).  */
  const [reasonRows, setReasonRows] = useState<{ WASTAGE: string[]; GIFT: string[] }>({ WASTAGE: [], GIFT: [] });
  const [newReasonOpen, setNewReasonOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const [w, g] = await Promise.all([getIssueReasons("WASTAGE"), getIssueReasons("GIFT")]);
        setReasonRows({ WASTAGE: w.map((r) => r.label), GIFT: g.map((r) => r.label) });
      } catch { /* the chips simply stay empty; free-text note still works */ }
    })();
  }, []);
  async function saveReason() {
    const label = reasonDraft.trim();
    if (!label) return;
    try {
      await addIssueReason(kind, label);
      setReasonRows((m) => ({ ...m, [kind]: [...m[kind], label] }));
      setReason(label); setReasonDraft(""); setNewReasonOpen(false);
    } catch (e) { setErr(msg(e, "Could not add that reason")); }
  }
  const reasons = reasonRows[kind];
  const totalPaisa = validLines(lines).reduce((s, l) => {
    const item = byId.get(l.itemId);
    return s + Math.round((l.qtyMilli * (item?.effectiveCostPaisa ?? 0)) / 1000);
  }, 0);

  async function save() {
    const ls = validLines(lines);
    if (!ls.length || !warehouseId) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const doc = await postInvIssue({
        kind, warehouseId, reason: reason || undefined, note: note || undefined,
        lines: ls.map(({ itemId, qtyMilli }) => ({ itemId, qtyMilli })),
      });
      setOk(`${doc.issueNo} posted — ${formatTaka(doc.totalValuePaisa)} written off at AVCO cost.`);
      setLines([]); setReason(""); setNote("");
      loadHistory();
    } catch (e) { setErr(msg(e, "Could not post the entry")); }
    finally { setBusy(false); }
  }

  const monthTotal = (k: "WASTAGE" | "GIFT") => {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    return allHistory
      .filter((i) => i.kind === k && new Date(i.createdAt) >= start)
      .reduce((s, i) => s + i.totalValuePaisa, 0);
  };

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Wastage & Gift"
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <ActionShell
        sheet={
          <>
            <SheetBar>
              <span className="flex items-center gap-2">
                {(["WASTAGE", "GIFT"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => { setKind(k); setReason(""); }}
                    className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
                    style={kind === k
                      ? { background: k === "WASTAGE" ? "#c0392b" : "#cf43ea", color: "#fff", borderColor: "transparent" }
                      : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                    {k === "WASTAGE" ? "Wastage" : "Gift (free out)"}
                  </button>
                ))}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="text-[12.5px] text-body-soft">Out of</span>
                <WhPills whs={whs.filter((w) => w.isActive)} value={warehouseId} onChange={setWarehouseId} />
              </span>
            </SheetBar>

            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-lavender-deep">
              <span className="text-[12.5px] text-body-soft mr-1">Why</span>
              {reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors"
                  style={reason === r
                    ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
                    : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                  {r}
                </button>
              ))}
              {newReasonOpen ? (
                <span className="flex items-center gap-1.5">
                  <input className="ipt h-[32px] text-[12.5px]" style={{ width: 180 }} autoFocus
                    placeholder="New reason…" value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveReason()} />
                  <button type="button" onClick={saveReason} disabled={!reasonDraft.trim()}
                    className="text-white text-[12px] font-medium px-2.5 h-[32px] rounded-[8px] disabled:opacity-40"
                    style={{ background: ACCENT }}>Add</button>
                  <button type="button" onClick={() => { setNewReasonOpen(false); setReasonDraft(""); }}
                    className="text-[15px] text-body-soft px-1">×</button>
                </span>
              ) : (
                <button type="button" onClick={() => setNewReasonOpen(true)}
                  className="text-[12px] font-medium underline" style={{ color: ACCENT }}>+ New reason</button>
              )}
            </div>

            <div className="px-4 py-3">
              <LinesEditor lines={lines} setLines={setLines} items={issuable} byId={byId} showValue
                have={{ label: "In store", qtyMilliOf: stockHere }}
                nothingLeft={
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "#fff4e6", color: "#8a5a00" }}>
                    This store holds nothing right now — there is nothing to waste or give away from it.
                  </div>
                } />
            </div>
            <SheetNote value={note} onChange={setNote}
              placeholder={kind === "WASTAGE" ? "e.g. Morning sorting" : "e.g. Sent to client office"} />
          </>
        }
        panel={
          <>
            <SummaryCard rows={[
              { label: "Out of", value: whs.find((w) => w.id === warehouseId)?.name ?? "—" },
              { label: "Lines ready", value: String(validLines(lines).length), big: true },
              {
                label: kind === "WASTAGE" ? "Written off" : "Given away",
                value: formatTaka(totalPaisa), big: true,
                tone: kind === "WASTAGE" ? "#c0392b" : "#a2189f",
              },
            ]} />
            <SaveBtn onClick={save} busy={busy}
              disabled={!warehouseId || !reason || validLines(lines).length === 0}
              label={kind === "WASTAGE" ? "Post wastage" : "Post gift"} full />
            {!reason && validLines(lines).length > 0 && (
              <PanelHint>Pick a reason first — this is money leaving, and the report is only useful if it says why.</PanelHint>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2.5 mb-2.5">
        <h3 className="font-display text-[17px] text-purple m-0">History</h3>
        {(["", "WASTAGE", "GIFT"] as const).map((k) => (
          <button key={k || "all"} type="button" onClick={() => setHistKind(k)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={histKind === k
              ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
              : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
            {k === "" ? "All" : k === "WASTAGE" ? "Wastage" : "Gift"}
          </button>
        ))}
        <span className="ml-auto text-[12.5px] text-body-soft">
          This month — wastage <b style={{ color: "#c0392b" }}>{formatTaka(monthTotal("WASTAGE"))}</b> ·
          gift <b style={{ color: "#cf43ea" }}> {formatTaka(monthTotal("GIFT"))}</b>
        </span>
      </div>
      {histDemo && <DemoBar what="sample entries" onRetry={() => loadHistory()} />}
      <DataTable head={
        <div className="grid grid-cols-[110px_90px_1fr_140px_110px_130px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span>No.</span><span>Type</span><span>Items</span><span>Reason</span>
          <span className="text-right">Value</span><span className="text-right">When · who</span>
        </div>
      }>
        {history.length === 0 && <div className="px-4 py-6 text-[13px] text-body-soft">No entries yet.</div>}
        {history.map((i) => (
          <div key={i.id} className="grid grid-cols-[110px_90px_1fr_140px_110px_130px] gap-3 items-center px-4 py-3">
            <span className="text-[13px] font-semibold text-purple">{i.issueNo}</span>
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start"
              style={i.kind === "WASTAGE"
                ? { background: "#fdecea", color: "#c0392b" }
                : { background: "#fbeafe", color: "#a2189f" }}>
              {i.kind === "WASTAGE" ? "Wastage" : "Gift"}
            </span>
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">
              {i.lines.map((l) => `${l.item.name} ×${fmtQty(l.qtyMilli)}`).join(", ")}
            </span>
            <span className="text-[12.5px] text-body">{i.reason ?? "—"}</span>
            <span className="text-right text-[13px] font-semibold" style={{ color: i.kind === "WASTAGE" ? "#c0392b" : "#a2189f" }}>
              {formatTaka(i.totalValuePaisa)}
            </span>
            <span className="text-right text-[12px] text-body-soft">
              {new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {i.actor ?? "—"}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

/* ================================================================== ADJUST */

/** quick per-item fix, opened from the Stock board row (INV-RULE-006: never blocks) */
export function InvAdjustModal({ row, whs, onClose, onDone }: {
  row: InvStockRow;
  whs: ApiWarehouse[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(whs[0]?.id ?? "");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const current = row.perWarehouse.find((p) => p.warehouseId === warehouseId)?.qtyMilli ?? 0;
  const delta = counted === "" ? 0 : toMilli(counted) - current;

  async function save() {
    if (!warehouseId || counted === "" || delta === 0) return;
    setBusy(true); setErr("");
    try {
      await postInvAdjust({
        itemId: row.itemId, warehouseId, deltaQtyMilli: delta,
        note: note || `Counted ${counted} (was ${fmtQty(current)})`,
      });
      onDone(); onClose();
    } catch (e) { setErr(msg(e, "Could not post the adjustment")); setBusy(false); }
  }

  return (
    <Modal title={`Adjust — ${row.name}`} onClose={onClose} onSave={save}
      saveLabel="Post adjustment" busy={busy}
      canSave={!!warehouseId && counted !== "" && delta !== 0}>
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      <div className="flex items-center gap-3 mb-4">
        <ItemThumb item={row} size={38} />
        <div>
          <b className="block text-[13.5px] text-body">{row.name}</b>
          <span className="text-[12px] text-body-soft">{row.sku} · counted in {row.unitName}</span>
        </div>
      </div>
      <Field label="Warehouse" required>
        <WhPills whs={whs} value={warehouseId} onChange={setWarehouseId} />
      </Field>
      <Field label={`Counted qty (${row.unitShort})`} required
        hint={`Ledger says ${fmtQty(current)} ${row.unitShort} here — enter what you actually counted`}>
        <input className="ipt w-full" inputMode="decimal" autoFocus
          value={counted} onChange={(e) => setCounted(e.target.value)} />
      </Field>
      {counted !== "" && (
        <p className="text-[13px] mb-3" style={{ color: delta === 0 ? "#5c4a6b" : delta > 0 ? "#0e7a3d" : "#c0392b" }}>
          {delta === 0 ? "No difference — nothing to post."
            : `Adjustment: ${delta > 0 ? "+" : ""}${fmtQty(delta)} ${row.unitShort} (ADJUSTMENT movement, audited)`}
        </p>
      )}
      <Field label="Note">
        <input className="ipt w-full" placeholder="Why the count differs (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* =============================================================== STOCKTAKE */

import {
  loadInvStockSafe, loadInvStocktakesSafe, createInvStocktake, applyInvStocktake,
  type InvStocktake,
} from "../_data/api";

/**
 * DEC-INV-009 — count session: pick a warehouse, the countable items load with
 * their ledger figure, staff type what they actually counted. Save keeps the
 * session as DRAFT; Apply posts ONE ADJUSTMENT per differing line and locks it
 * (INV-RULE-011). Blank count = "did not count this item" — skipped, not zero.
 */
export function InvStocktakeView() {
  const { whs, isDemo, reload } = useInvBase();
  const [warehouseId, setWarehouseId] = useState("");
  const [counting, setCounting] = useState(false);
  const [rows, setRows] = useState<InvStockRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [sessions, setSessions] = useState<InvStocktake[]>([]);
  const [sessDemo, setSessDemo] = useState(false);
  const [openSession, setOpenSession] = useState<string | null>(null);

  useEffect(() => { if (!warehouseId && whs.length) setWarehouseId(whs[0].id); }, [whs, warehouseId]);

  async function loadSessions() {
    const r = await loadInvStocktakesSafe();
    setSessions(r.rows); setSessDemo(r.isDemo);
  }
  useEffect(() => { loadSessions(); }, []);

  async function startCounting() {
    setBusy(true); setErr("");
    try {
      const r = await loadInvStockSafe();
      // MAKE_TO_ORDER never holds stock — nothing to count (DEC-ITM-004)
      setRows(r.rows.filter((x) => x.assemblyMode !== "MAKE_TO_ORDER"));
      setCounts({});
      setCounting(true);
    } finally { setBusy(false); }
  }

  const whQty = (r: InvStockRow) =>
    r.perWarehouse.find((p) => p.warehouseId === warehouseId)?.qtyMilli ?? 0;

  const filled = rows.filter((r) => (counts[r.itemId] ?? "") !== "");
  const diffs = filled.map((r) => {
    const counted = toMilli(counts[r.itemId]);
    const diff = counted - whQty(r);
    return { r, counted, diff, diffPaisa: Math.round(diff * r.unitCostPaisa / 1000) };
  });
  const totalDiffPaisa = diffs.reduce((s, d) => s + d.diffPaisa, 0);

  async function save() {
    if (!filled.length) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const doc = await createInvStocktake({
        warehouseId, note: note || undefined,
        lines: filled.map((r) => ({ itemId: r.itemId, countedQtyMilli: toMilli(counts[r.itemId]) })),
      });
      setOk(`${doc.stocktakeNo} saved as draft — review below, then Apply to post the adjustments.`);
      setCounting(false); setNote(""); setCounts({});
      loadSessions();
    } catch (e) { setErr(msg(e, "Could not save the stocktake")); }
    finally { setBusy(false); }
  }

  async function apply(id: string) {
    setBusy(true); setErr(""); setOk("");
    try {
      const doc = await applyInvStocktake(id);
      setOk(`${doc.stocktakeNo} applied — adjustments posted to the ledger.`);
      loadSessions();
    } catch (e) { setErr(msg(e, "Could not apply the stocktake")); }
    finally { setBusy(false); }
  }

  const whName = (id: string) => whs.find((w) => w.id === id)?.name ?? "?";

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Stocktake"
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      {!counting && (
        <ActionShell
          sheet={
            <SheetBar>
              <span className="text-[12.5px] text-body-soft">Count which store</span>
              <WhPills whs={whs.filter((w) => w.isActive)} value={warehouseId} onChange={setWarehouseId} />
            </SheetBar>
          }
          panel={
            <>
              <button onClick={startCounting} disabled={!warehouseId || busy}
                className="w-full text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40"
                style={{ background: ACCENT }}>
                {busy ? "Loading…" : "Start counting"}
              </button>
            </>
          }
        />
      )}

      {counting && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start mb-6">
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5">
          <div className="flex items-center gap-3 mb-4">
            <b className="text-[14.5px] text-body">Counting {whName(warehouseId)}</b>
            <span className="text-[12.5px] text-body-soft">Leave a row blank if you did not count it — blank ≠ zero.</span>
            <button onClick={() => setCounting(false)} className="ml-auto text-[12.5px] text-body-soft hover:text-purple">Cancel</button>
          </div>

          <div className="grid grid-cols-[44px_minmax(180px,1.3fr)_110px_130px_110px_120px] gap-3 items-center px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
            <span /><span>Item</span><span className="text-right">Ledger</span>
            <span>Counted</span><span className="text-right">Diff</span><span className="text-right">Diff (taka)</span>
          </div>
          <div className="divide-y divide-lavender-deep">
            {rows.map((r) => {
              const v = counts[r.itemId] ?? "";
              const counted = v === "" ? null : toMilli(v);
              const diff = counted === null ? null : counted - whQty(r);
              const diffPaisa = diff === null ? null : Math.round(diff * r.unitCostPaisa / 1000);
              return (
                <div key={r.itemId} className="grid grid-cols-[44px_minmax(180px,1.3fr)_110px_130px_110px_120px] gap-3 items-center px-1 py-2.5">
                  <ItemThumb item={r} size={36} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-body truncate">{r.name}</span>
                    <span className="block text-[11.5px] text-body-soft">{r.sku}</span>
                  </span>
                  <span className="text-right text-[13px] text-body">{fmtQty(whQty(r))} {r.unitShort}</span>
                  <input className="ipt" inputMode="decimal" placeholder="—" value={v}
                    onChange={(e) => setCounts({ ...counts, [r.itemId]: e.target.value })} />
                  <span className="text-right text-[13px] font-semibold"
                    style={{ color: diff === null || diff === 0 ? "#8d7a97" : diff > 0 ? "#0e7a3d" : "#c0392b" }}>
                    {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
                  </span>
                  <span className="text-right text-[13px]"
                    style={{ color: diffPaisa === null || diffPaisa === 0 ? "#8d7a97" : diffPaisa > 0 ? "#0e7a3d" : "#c0392b" }}>
                    {diffPaisa === null ? "—" : formatTaka(diffPaisa)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-lavender-deep">
            <span className="text-[12.5px] text-body-soft shrink-0">Note</span>
            <input className="ipt w-full" placeholder="e.g. Weekly count"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3">
          <SummaryCard rows={[
            { label: "Counting", value: whName(warehouseId) },
            { label: "Rows counted", value: `${filled.length} of ${rows.length}`, big: true },
            {
              label: "Net mismatch", value: formatTaka(totalDiffPaisa), big: true,
              tone: totalDiffPaisa === 0 ? "#5c4a6b" : totalDiffPaisa > 0 ? "#0e7a3d" : "#c0392b",
            },
          ]} />
          <SaveBtn onClick={save} busy={busy} disabled={filled.length === 0} label="Save as draft" full />
        </div>
        </div>
      )}

      <h3 className="font-display text-[17px] text-purple mb-2.5">Sessions</h3>
      {sessDemo && <DemoBar what="sample sessions" onRetry={loadSessions} />}
      <DataTable head={
        <div className="grid grid-cols-[110px_120px_1fr_110px_120px_120px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span>No.</span><span>Warehouse</span><span>Result</span>
          <span className="text-right">Net (taka)</span><span className="text-right">When · who</span><span />
        </div>
      }>
        {sessions.length === 0 && <div className="px-4 py-6 text-[13px] text-body-soft">No stocktakes yet.</div>}
        {sessions.map((s) => {
          const net = s.lines.reduce((a, l) => a + l.diffValuePaisa, 0);
          const diffCount = s.lines.filter((l) => l.countedQtyMilli !== l.ledgerQtyMilli).length;
          const open = openSession === s.id;
          return (
            <div key={s.id}>
              <div className="grid grid-cols-[110px_120px_1fr_110px_120px_120px] gap-3 items-center px-4 py-3">
                <button onClick={() => setOpenSession(open ? null : s.id)}
                  className="text-left text-[13px] font-semibold text-purple hover:underline">{s.stocktakeNo}</button>
                <span className="text-[12.5px] text-body">{whName(s.warehouseId)}</span>
                <span className="text-[12.5px] text-body-soft min-w-0 truncate">
                  {s.lines.length} counted · {diffCount} differ{s.note ? ` · ${s.note}` : ""}
                </span>
                <span className="text-right text-[13px] font-semibold"
                  style={{ color: net === 0 ? "#8d7a97" : net > 0 ? "#0e7a3d" : "#c0392b" }}>
                  {formatTaka(net)}
                </span>
                <span className="text-right text-[12px] text-body-soft">
                  {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {s.actor ?? "—"}
                </span>
                {s.status === "DRAFT" ? (
                  <button onClick={() => apply(s.id)} disabled={busy}
                    className="text-white text-[12px] font-medium px-3 py-1.5 rounded-[8px] justify-self-end disabled:opacity-40"
                    style={{ background: ACCENT }}>
                    Apply
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-end"
                    style={{ background: "#e8f7ef", color: "#0e7a3d" }}>Applied</span>
                )}
              </div>
              {open && (
                <div className="px-4 pb-3">
                  {s.lines.map((l) => (
                    <div key={l.id} className="grid grid-cols-[minmax(160px,1fr)_120px_120px_120px] gap-3 items-center bg-lavender/20 rounded-[8px] px-3 py-2 mb-1 text-[12.5px]">
                      <span className="text-body truncate">{l.item.name} <span className="text-body-soft">({l.item.sku})</span></span>
                      <span className="text-right text-body-soft">ledger {fmtQty(l.ledgerQtyMilli)}</span>
                      <span className="text-right text-body">counted {fmtQty(l.countedQtyMilli)}</span>
                      <span className="text-right font-medium"
                        style={{ color: l.diffValuePaisa === 0 ? "#8d7a97" : l.diffValuePaisa > 0 ? "#0e7a3d" : "#c0392b" }}>
                        {formatTaka(l.diffValuePaisa)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </DataTable>
    </div>
  );
}

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
  listItems, formatTaka, fmtQty, toMilli, getIssueReasons, addIssueReason, updateIssueReason, deleteIssueReason,
  getIssueAnalysis, type IssueAnalysis, type ApiIssueReason,
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
            : { background: "#fff", color: "var(--t-accent)", borderColor: "var(--l-accent)" }}>
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
                style={{ color: tooMuch ? "var(--t-bad)" : "var(--t-accent)" }}>
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
            ? <b className="block text-[24px] font-semibold leading-tight" style={{ color: r.tone ?? "var(--t-accent)" }}>{r.value}</b>
            : <b className="block text-[15px] text-body">{r.value}</b>}
        </div>
      ))}
    </div>
  );
}

const PanelHint = ({ tone = "var(--t-warn)", bg = "var(--s-warn)", children }: {
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
      setOk(`Opening posted — ${r.posted} item(s).`);
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
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "var(--s-warn)", color: "var(--t-warn)" }}>
                    Every item already moves in <b>{whName}</b>. To correct a count, use{" "}
                    <Link href="/inventory/stock" className="font-semibold underline">Adjust on the Stock board</Link>.
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
                in the list.
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
      setOk(`${t.transferNo} posted.`);
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
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "var(--s-warn)", color: "var(--t-warn)" }}>
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
                It will still post and show as negative.
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
  /*  Entry writes the loss; Analysis reads it back from every angle
      (owner, 22 Aug: "sob angle theke jen analysis kra jay")  */
  const [tab, setTab] = useState<"entry" | "analysis">("entry");
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
  const [reasonRows, setReasonRows] = useState<{ WASTAGE: ApiIssueReason[]; GIFT: ApiIssueReason[] }>({ WASTAGE: [], GIFT: [] });
  const [newReasonOpen, setNewReasonOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [editReason, setEditReason] = useState<{ id: string; label: string } | null>(null);
  const [armDelete, setArmDelete] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const [w, g] = await Promise.all([getIssueReasons("WASTAGE"), getIssueReasons("GIFT")]);
        setReasonRows({ WASTAGE: w, GIFT: g });
      } catch { /* the chips simply stay empty; free-text note still works */ }
    })();
  }, []);
  async function saveReason() {
    const label = reasonDraft.trim();
    if (!label) return;
    try {
      const row = await addIssueReason(kind, label);
      setReasonRows((m) => ({ ...m, [kind]: [...m[kind], row] }));
      setReason(label); setReasonDraft(""); setNewReasonOpen(false);
    } catch (e) { setErr(msg(e, "Could not add that reason")); }
  }
  async function renameReason() {
    if (!editReason) return;
    const label = editReason.label.trim();
    if (!label) return;
    try {
      await updateIssueReason(editReason.id, label);
      setReasonRows((m) => ({ ...m, [kind]: m[kind].map((r) => (r.id === editReason.id ? { ...r, label } : r)) }));
      if (reasonRows[kind].find((r) => r.id === editReason.id)?.label === reason) setReason(label);
      setEditReason(null);
    } catch (e) { setErr(msg(e, "Could not rename that reason")); }
  }
  async function removeReason(id: string) {
    if (armDelete !== id) { setArmDelete(id); window.setTimeout(() => setArmDelete(""), 2500); return; }
    try {
      await deleteIssueReason(id);
      setReasonRows((m) => ({ ...m, [kind]: m[kind].filter((r) => r.id !== id) }));
      setArmDelete("");
    } catch (e) { setErr(msg(e, "Could not delete that reason")); }
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
      setOk(`${doc.issueNo} posted — ${formatTaka(doc.totalValuePaisa)} written off.`);
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

      <div className="flex items-center gap-2 mb-4">
        {([["entry", "New entry"], ["analysis", "Analysis"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className="text-[13px] font-medium px-4 py-2 rounded-[10px] border"
            style={tab === id
              ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
              : { background: "#fff", borderColor: "var(--l-accent)", color: "var(--t-accent)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "analysis" && <IssueAnalysisView />}

      {tab === "entry" && (
      <>
      <ActionShell
        sheet={
          <>
            <SheetBar>
              <span className="flex items-center gap-2">
                {(["WASTAGE", "GIFT"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => { setKind(k); setReason(""); }}
                    className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
                    style={kind === k
                      ? { background: k === "WASTAGE" ? "var(--s-bad)" : "var(--s-orchid)", color: "#fff", borderColor: "transparent" }
                      : { background: "#fff", color: "var(--t-accent)", borderColor: "var(--l-accent)" }}>
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
              {reasons.map((r) =>
                editReason?.id === r.id ? (
                  <span key={r.id} className="flex items-center gap-1">
                    <input className="ipt h-[30px] text-[12.5px]" style={{ width: 150 }} autoFocus
                      value={editReason.label}
                      onChange={(e) => setEditReason({ id: r.id, label: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") renameReason(); if (e.key === "Escape") setEditReason(null); }} />
                    <button type="button" onClick={renameReason}
                      className="text-white text-[11.5px] font-medium px-2 h-[30px] rounded-[8px]" style={{ background: ACCENT }}>Save</button>
                  </span>
                ) : (
                  /*  the pencil and the cross live INSIDE the chip and only show
                      on hover (owner, 22 Aug: "icon ar pichone mouse dile dekha
                      jabe") — the row stays clean until you reach for it  */
                  <span key={r.id} className="group inline-flex items-center rounded-full border transition-colors"
                    style={reason === r.label
                      ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
                      : { background: "#fff", color: "var(--t-accent)", borderColor: "var(--l-accent)" }}>
                    <button type="button" onClick={() => setReason(r.label)}
                      className="text-[12.5px] font-medium pl-3 pr-1.5 py-1.5">{r.label}</button>
                    <span className="hidden group-hover:inline-flex items-center pr-1.5 gap-0.5">
                      <button type="button" title="Rename"
                        onClick={() => setEditReason({ id: r.id, label: r.label })}
                        className="p-0.5 opacity-70 hover:opacity-100"><Icon name="edit" size={11} /></button>
                      <button type="button" title={armDelete === r.id ? "Press again to delete" : "Delete"}
                        onClick={() => removeReason(r.id)}
                        className={"px-0.5 text-[13px] leading-none " + (armDelete === r.id ? "text-[var(--t-bad)] font-bold" : "opacity-70 hover:opacity-100")}>
                        ×
                      </button>
                    </span>
                  </span>
                ),
              )}
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
                  <div className="rounded-[12px] px-3.5 py-3 text-[12.5px]" style={{ background: "var(--s-warn)", color: "var(--t-warn)" }}>
                    This store holds nothing.
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
                tone: kind === "WASTAGE" ? "var(--t-bad)" : "var(--t-orchid)",
              },
            ]} />
            <SaveBtn onClick={save} busy={busy}
              disabled={!warehouseId || !reason || validLines(lines).length === 0}
              label={kind === "WASTAGE" ? "Post wastage" : "Post gift"} full />
            {!reason && validLines(lines).length > 0 && (
              <PanelHint>Pick a reason first — this is money leaving.</PanelHint>
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
              : { background: "#fff", color: "var(--t-accent)", borderColor: "var(--l-accent)" }}>
            {k === "" ? "All" : k === "WASTAGE" ? "Wastage" : "Gift"}
          </button>
        ))}
        <span className="ml-auto text-[12.5px] text-body-soft">
          This month — wastage <b style={{ color: "var(--t-bad)" }}>{formatTaka(monthTotal("WASTAGE"))}</b> ·
          gift <b style={{ color: "var(--t-orchid)" }}> {formatTaka(monthTotal("GIFT"))}</b>
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
                ? { background: "var(--s-bad)", color: "var(--t-bad)" }
                : { background: "var(--s-orchid)", color: "var(--t-orchid)" }}>
              {i.kind === "WASTAGE" ? "Wastage" : "Gift"}
            </span>
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">
              {i.lines.map((l) => `${l.item.name} ×${fmtQty(l.qtyMilli)}`).join(", ")}
            </span>
            <span className="text-[12.5px] text-body">{i.reason ?? "—"}</span>
            <span className="text-right text-[13px] font-semibold" style={{ color: i.kind === "WASTAGE" ? "var(--t-bad)" : "var(--t-orchid)" }}>
              {formatTaka(i.totalValuePaisa)}
            </span>
            <span className="text-right text-[12px] text-body-soft">
              {new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {i.actor ?? "—"}
            </span>
          </div>
        ))}
      </DataTable>
      </>
      )}
    </div>
  );
}

/*  ============================================================ ANALYSIS
    The loss, read back from every angle: by day, by item, by reason, by
    store, by month — value and count, wastage red, gift pink.  */

const W_RED = "#c0392b";
const G_PINK = "#cf43ea";

function IssueAnalysisView() {
  const [days, setDays] = useState(30);
  const [a, setA] = useState<IssueAnalysis | null>(null);
  useEffect(() => {
    getIssueAnalysis(days).then(setA).catch(() => setA(null));
  }, [days]);

  if (!a) return <p className="text-[13px] text-body-soft">Loading…</p>;

  const total = a.totalWastagePaisa + a.totalGiftPaisa;
  const maxDay = Math.max(1, ...a.series.map((d) => d.wastagePaisa + d.giftPaisa));
  const topItems = a.byItem.slice(0, 8);
  const maxItem = Math.max(1, ...topItems.map((i) => i.wastagePaisa + i.giftPaisa));
  const maxReason = Math.max(1, ...a.byReason.map((r) => r.paisa));
  const card = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";
  const head = (label: string) => (
    <div className="pl-4 pr-3 py-2" style={{ background: ACCENT }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-white">{label}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[7, 30, 90, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border"
            style={days === d
              ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
              : { background: "#fff", color: "var(--t-accent)", borderColor: "var(--l-accent)" }}>
            {d === 365 ? "1 year" : `${d} days`}
          </button>
        ))}
      </div>

      {/* ---- the four numbers ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Wasted", v: formatTaka(a.totalWastagePaisa), c: W_RED, bg: "var(--s-bad)", icon: "trash" },
          { l: "Gifted", v: formatTaka(a.totalGiftPaisa), c: G_PINK, bg: "var(--s-orchid)", icon: "heart" },
          { l: "Total lost", v: formatTaka(total), c: "var(--t-accent)", bg: "var(--s-accent)", icon: "chart" },
          { l: "Entries", v: String(a.entryCount), c: "var(--t-info)", bg: "var(--s-info)", icon: "layers" },
        ].map((k) => (
          <div key={k.l} className="rounded-[14px] px-4 py-3.5 flex items-center gap-3" style={{ background: k.bg }}>
            <span className="w-[36px] h-[36px] rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: k.c }}>
              <Icon name={k.icon} size={16} />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: k.c }}>{k.l}</span>
              <b className="block text-[18px] font-display leading-[1.2]" style={{ color: k.c, fontVariantNumeric: "tabular-nums" }}>{k.v}</b>
            </span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* ---- day by day ---- */}
        <div className={card + " overflow-hidden"}>
          {head("Day by day")}
          <div className="px-4 py-4">
            {a.series.length === 0 && <p className="text-[13px] text-body-soft m-0">Nothing in this window.</p>}
            <div className="flex items-end gap-[3px]" style={{ height: 140 }}>
              {a.series.map((d) => {
                const w = Math.round((d.wastagePaisa / maxDay) * 128);
                const g = Math.round((d.giftPaisa / maxDay) * 128);
                return (
                  <div key={d.date} className="flex-1 flex flex-col justify-end items-stretch group relative" style={{ minWidth: 6 }}
                    title={`${d.date} — wastage ${formatTaka(d.wastagePaisa)} · gift ${formatTaka(d.giftPaisa)}`}>
                    <span style={{ height: g, background: G_PINK, borderRadius: "3px 3px 0 0" }} />
                    <span style={{ height: w, background: W_RED, borderRadius: g ? 0 : "3px 3px 0 0" }} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11.5px] text-body-soft">
              <span className="inline-flex items-center gap-1.5"><span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: W_RED }} /> Wastage</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: G_PINK }} /> Gift</span>
            </div>
          </div>
        </div>

        {/* ---- month by month ---- */}
        <div className={card + " overflow-hidden"}>
          {head("Month by month")}
          <div className="px-4 py-3">
            {a.byMonth.length === 0 && <p className="text-[13px] text-body-soft m-0 py-1">Nothing yet.</p>}
            {a.byMonth.map((m) => (
              <div key={m.month} className="flex items-center justify-between py-2 border-b border-lavender-deep/50 last:border-0">
                <b className="text-[13px] text-purple">{m.month}</b>
                <span className="flex gap-2 text-[12px]">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--s-bad)", color: W_RED }}>
                    wasted <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(m.wastagePaisa)}</b>
                  </span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--s-orchid)", color: G_PINK }}>
                    gifted <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(m.giftPaisa)}</b>
                  </span>
                </span>
              </div>
            ))}
          </div>

          {a.byWarehouse.length > 0 && (
            <>
              {head("Store by store")}
              <div className="px-4 py-3">
                {a.byWarehouse.map((w) => (
                  <div key={w.name} className="flex items-center justify-between py-1.5 text-[12.5px]">
                    <span className="text-body">{w.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      <b style={{ color: W_RED }}>{formatTaka(w.wastagePaisa)}</b>
                      <span className="text-body-soft"> · </span>
                      <b style={{ color: G_PINK }}>{formatTaka(w.giftPaisa)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ---- which item bleeds ---- */}
        <div className={card + " overflow-hidden"}>
          {head("Which item, how much")}
          <div className="px-4 py-3">
            {topItems.length === 0 && <p className="text-[13px] text-body-soft m-0 py-1">Nothing yet.</p>}
            {topItems.map((i) => {
              const sum = i.wastagePaisa + i.giftPaisa;
              return (
                <div key={i.itemId} className="py-2 border-b border-lavender-deep/50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <ItemThumb item={i} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-body truncate">{i.name}</span>
                      <span className="block text-[10.5px] text-body-soft">
                        {i.wastageQtyMilli > 0 ? `wasted ${fmtQty(i.wastageQtyMilli)}` : ""}
                        {i.wastageQtyMilli > 0 && i.giftQtyMilli > 0 ? " · " : ""}
                        {i.giftQtyMilli > 0 ? `gifted ${fmtQty(i.giftQtyMilli)}` : ""}
                        {i.unitName ? ` ${i.unitName}` : ""}
                      </span>
                    </span>
                    <b className="text-[13px] shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(sum)}</b>
                  </div>
                  <div className="flex mt-1.5 rounded-full overflow-hidden" style={{ height: 7, background: "var(--s-accent)" }}>
                    <span style={{ width: `${(i.wastagePaisa / maxItem) * 100}%`, background: W_RED }} />
                    <span style={{ width: `${(i.giftPaisa / maxItem) * 100}%`, background: G_PINK }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- why ---- */}
        <div className={card + " overflow-hidden"}>
          {head("Why — reason by reason")}
          <div className="px-4 py-3">
            {a.byReason.length === 0 && <p className="text-[13px] text-body-soft m-0 py-1">Nothing yet.</p>}
            {a.byReason.map((r) => (
              <div key={`${r.kind}:${r.reason}`} className="py-2 border-b border-lavender-deep/50 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-body min-w-0 truncate">
                    {r.reason}
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                      style={r.kind === "WASTAGE"
                        ? { background: "var(--s-bad)", color: W_RED }
                        : { background: "var(--s-orchid)", color: G_PINK }}>
                      {r.kind === "WASTAGE" ? "WASTE" : "GIFT"}
                    </span>
                  </span>
                  <span className="text-[12px] text-body-soft shrink-0">
                    {r.count}× · <b className="text-body" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(r.paisa)}</b>
                  </span>
                </div>
                <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 6, background: "var(--s-accent)" }}>
                  <span className="block h-full" style={{ width: `${(r.paisa / maxReason) * 100}%`, background: r.kind === "WASTAGE" ? W_RED : G_PINK }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
        hint={`Ledger says ${fmtQty(current)} ${row.unitShort} here`}>
        <input className="ipt w-full" inputMode="decimal" autoFocus
          value={counted} onChange={(e) => setCounted(e.target.value)} />
      </Field>
      {counted !== "" && (
        <p className="text-[13px] mb-3" style={{ color: delta === 0 ? "var(--t-accent)" : delta > 0 ? "var(--t-ok)" : "var(--t-bad)" }}>
          {delta === 0 ? "No difference — nothing to post."
            : `Adjustment: ${delta > 0 ? "+" : ""}${fmtQty(delta)} ${row.unitShort}`}
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
  /** everything countable — the pool "Found something else" picks from */
  const [allRows, setAllRows] = useState<InvStockRow[]>([]);
  const [foundOpen, setFoundOpen] = useState(false);
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
      /*  The sheet is THIS store's shelf, not the whole catalogue (owner,
          22 Aug — the same rule as the pickers). MAKE_TO_ORDER never holds
          stock (DEC-ITM-004). Anything the ledger says is 0 here is left out;
          if it turns up on the shelf anyway, "Found something else" adds it.  */
      setAllRows(r.rows.filter((x) => x.assemblyMode !== "MAKE_TO_ORDER"));
      setRows(
        r.rows.filter(
          (x) =>
            x.assemblyMode !== "MAKE_TO_ORDER" &&
            (x.perWarehouse.find((p) => p.warehouseId === warehouseId)?.qtyMilli ?? 0) !== 0,
        ),
      );
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
      setOk(`${doc.stocktakeNo} saved as draft.`);
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
                    style={{ color: diff === null || diff === 0 ? "var(--t-accent)" : diff > 0 ? "var(--t-ok)" : "var(--t-bad)" }}>
                    {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
                  </span>
                  <span className="text-right text-[13px]"
                    style={{ color: diffPaisa === null || diffPaisa === 0 ? "var(--t-accent)" : diffPaisa > 0 ? "var(--t-ok)" : "var(--t-bad)" }}>
                    {diffPaisa === null ? "—" : formatTaka(diffPaisa)}
                  </span>
                </div>
              );
            })}
          </div>

          {/*  the shelf sometimes holds what the ledger says is not there —
               a returned item nobody logged, a box found behind the counter  */}
          <button type="button" onClick={() => setFoundOpen(true)}
            className="text-[12.5px] font-medium inline-flex items-center gap-1.5 mt-3"
            style={{ color: ACCENT }}>
            <Icon name="plus" size={12} /> Found something else
          </button>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-lavender-deep">
            <span className="text-[12.5px] text-body-soft shrink-0">Note</span>
            <input className="ipt w-full" placeholder="e.g. Weekly count"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {foundOpen && (
            <ItemPicker
              title="Found on the shelf"
              items={allRows
                .filter((r) => !rows.some((x) => x.itemId === r.itemId))
                .map((r) => ({
                  id: r.itemId, sku: r.sku, name: r.name, imageUrl: r.imageUrl ?? null,
                  itemType: "RAW", unit: { name: r.unitName },
                } as unknown as ApiItem))}
              onClose={() => setFoundOpen(false)}
              onDone={(picked) => {
                const add = picked
                  .map((p) => allRows.find((r) => r.itemId === p.item.id))
                  .filter((r): r is InvStockRow => !!r);
                setRows([...rows, ...add]);
                setFoundOpen(false);
              }}
            />
          )}
        </div>

        <div className="grid gap-3">
          <SummaryCard rows={[
            { label: "Counting", value: whName(warehouseId) },
            { label: "Rows counted", value: `${filled.length} of ${rows.length}`, big: true },
            {
              label: "Net mismatch", value: formatTaka(totalDiffPaisa), big: true,
              tone: totalDiffPaisa === 0 ? "var(--t-accent)" : totalDiffPaisa > 0 ? "var(--t-ok)" : "var(--t-bad)",
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
                  style={{ color: net === 0 ? "var(--t-accent)" : net > 0 ? "var(--t-ok)" : "var(--t-bad)" }}>
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
                    style={{ background: "var(--s-ok)", color: "var(--t-ok)" }}>Applied</span>
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
                        style={{ color: l.diffValuePaisa === 0 ? "var(--t-accent)" : l.diffValuePaisa > 0 ? "var(--t-ok)" : "var(--t-bad)" }}>
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

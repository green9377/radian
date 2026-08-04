"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import {
  WRAP, ACCENT, ItemPageHead, DemoBar, DataTable, ItemThumb, Modal, Field,
  QuickSelect, ErrBar, OkBar, msg,
} from "./ItemUI";
import {
  listItems, formatTaka, fmtQty, toMilli,
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
  UI text is ENGLISH ONLY (locked rule: চ্যাটে বাংলা, UI/code English).
*/

const WASTAGE_REASONS = ["Rotten", "Dried out", "Broken", "Expired", "Damaged in transit", "Other"];
const GIFT_REASONS = ["Marketing", "Relationship", "Corporate sample", "Compensation", "Other"];

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

/** shared multi-item line editor — CSS grid (the §১০.৫ .ipt flex trap) */
function LinesEditor({ lines, setLines, options, byId, showValue, showExpiry }: {
  lines: Line[];
  setLines: (l: Line[]) => void;
  options: { id: string; label: string; hint?: string; imageUrl?: string | null; tintSeed?: string }[];
  byId: Map<string, ApiItem>;
  showValue?: boolean;
  showExpiry?: boolean;
}) {
  const patch = (key: number, p: Partial<Line>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const cols = showValue
    ? "grid grid-cols-[minmax(220px,1fr)_120px_110px_36px] gap-2.5 items-center"
    : showExpiry
      ? "grid grid-cols-[minmax(220px,1fr)_120px_150px_36px] gap-2.5 items-center"
      : "grid grid-cols-[minmax(220px,1fr)_120px_36px] gap-2.5 items-center";

  return (
    <div>
      <div className={cols + " mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft"}>
        <span>Item</span><span>Qty</span>
        {showValue && <span className="text-right">Value</span>}
        {showExpiry && <span>Expiry (if any)</span>}
        <span />
      </div>
      {lines.map((l) => {
        const item = byId.get(l.itemId);
        const cost = item ? item.effectiveCostPaisa : 0;
        const value = Math.round(toMilli(l.qty || 0) * cost / 1000);
        return (
          <div key={l.key} className={cols + " mb-2"}>
            <QuickSelect
              value={l.itemId} options={options} placeholder="Pick an item…"
              onChange={(id) => patch(l.key, { itemId: id })} allowClear={false}
            />
            <input className="ipt" placeholder={item ? item.unit?.name ?? "Qty" : "Qty"}
              inputMode="decimal" value={l.qty}
              onChange={(e) => patch(l.key, { qty: e.target.value })} />
            {showValue && (
              <span className="text-right text-[13px] font-medium text-body">
                {item && l.qty ? formatTaka(value) : "—"}
              </span>
            )}
            {showExpiry && (
              item?.trackExpiry
                ? <input type="date" className="ipt" value={l.expiryDate ?? ""}
                    onChange={(e) => patch(l.key, { expiryDate: e.target.value })} />
                : <span className="text-[12px] text-body-soft">n/a</span>
            )}
            <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              className="text-body-soft hover:text-purple text-[17px]" title="Remove line">×</button>
          </div>
        );
      })}
      <button type="button" onClick={() => setLines([...lines, newLine()])}
        className="text-[12.5px] font-medium inline-flex items-center gap-1.5 mt-1"
        style={{ color: ACCENT }}>
        <Icon name="plus" size={12} /> Add line
      </button>
    </div>
  );
}

function validLines(lines: Line[]): { itemId: string; qtyMilli: number; expiryDate?: string }[] {
  return lines
    .filter((l) => l.itemId && toMilli(l.qty) > 0)
    .map((l) => ({ itemId: l.itemId, qtyMilli: toMilli(l.qty), ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}) }));
}

const SaveBtn = ({ onClick, busy, disabled, label }: { onClick: () => void; busy: boolean; disabled: boolean; label: string }) => (
  <button onClick={onClick} disabled={disabled || busy}
    className="text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40"
    style={{ background: ACCENT }}>
    {busy ? "Saving…" : label}
  </button>
);

/* ================================================================= OPENING */

export function InvOpeningView() {
  const { byId, options, whs, isDemo, reload } = useInvBase();
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => { if (!warehouseId && whs.length) setWarehouseId(whs[0].id); }, [whs, warehouseId]);

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
      setLines([newLine()]); setNote("");
    } catch (e) { setErr(msg(e, "Could not post opening stock")); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Opening stock"
        blurb="Count what is on the shelf, enter it item by item — these OPENING entries start the ledger (DEC-INV-006). An item already moving in a warehouse cannot be re-opened; use Adjust on the Stock board instead."
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[760px]">
        <Field label="Warehouse" required>
          <WhPills whs={whs} value={warehouseId} onChange={setWarehouseId} />
        </Field>
        <Field label="Counted items" required hint="Qty in the item's own unit — e.g. 120 stems, 2.5 kg">
          <LinesEditor lines={lines} setLines={setLines} options={options} byId={byId} showExpiry />
        </Field>
        <Field label="Note">
          <input className="ipt w-full" placeholder="e.g. First count, 23 Jul morning"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <SaveBtn onClick={save} busy={busy} disabled={!warehouseId || validLines(lines).length === 0} label="Post opening stock" />
      </div>
    </div>
  );
}

/* ================================================================ TRANSFER */

export function InvTransferView() {
  const { byId, options, whs, isDemo, reload } = useInvBase();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
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

  async function save() {
    const ls = validLines(lines);
    if (!ls.length || !fromId || !toId || fromId === toId) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const t = await postInvTransfer({ fromWarehouseId: fromId, toWarehouseId: toId, lines: ls, note: note || undefined });
      setOk(`${t.transferNo} posted — OUT and IN in one transaction (DEC-INV-004).`);
      setLines([newLine()]); setNote("");
      loadHistory();
    } catch (e) { setErr(msg(e, "Could not post transfer")); }
    finally { setBusy(false); }
  }

  const whName = (id: string) => whs.find((w) => w.id === id)?.name ?? "?";

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Transfer"
        blurb="Move stock between warehouses in ONE step — no send/receive handshake, both rooms are in the same building (DEC-INV-004)."
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[760px] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="From" required>
            <WhPills whs={whs} value={fromId} onChange={(id) => { setFromId(id); if (id === toId) setToId(""); }} />
          </Field>
          <Field label="To" required>
            <WhPills whs={whs} value={toId} onChange={setToId} exclude={fromId} />
          </Field>
        </div>
        <Field label="Items" required>
          <LinesEditor lines={lines} setLines={setLines} options={options} byId={byId} />
        </Field>
        <Field label="Note">
          <input className="ipt w-full" placeholder="e.g. Morning restock for the shop floor"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <SaveBtn onClick={save} busy={busy}
          disabled={!fromId || !toId || fromId === toId || validLines(lines).length === 0}
          label="Post transfer" />
      </div>

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
  const { byId, options, whs, isDemo, reload } = useInvBase();
  const [kind, setKind] = useState<"WASTAGE" | "GIFT">("WASTAGE");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
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

  async function loadHistory(k = histKind) {
    const [r, all] = await Promise.all([
      loadInvIssuesSafe(k || undefined),
      k ? loadInvIssuesSafe() : Promise.resolve(null),
    ]);
    setHistory(r.rows); setHistDemo(r.isDemo);
    setAllHistory(all ? all.rows : r.rows);
  }
  useEffect(() => { loadHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [histKind]);

  const reasons = kind === "WASTAGE" ? WASTAGE_REASONS : GIFT_REASONS;
  const totalPaisa = validLines(lines).reduce((s, l) => {
    const item = byId.get(l.itemId);
    return s + (item ? Math.round(l.qtyMilli * item.effectiveCostPaisa / 1000) : 0);
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
      setLines([newLine()]); setReason(""); setNote("");
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
        blurb="Flowers rot, gifts go out free — both cost money, so both are counted in taka at AVCO cost (DEC-INV-005). Enter any time; no forced day-end routine."
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[760px] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Type" required>
            <div className="flex gap-2">
              {(["WASTAGE", "GIFT"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setReason(""); }}
                  className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
                  style={kind === k
                    ? { background: k === "WASTAGE" ? "#c0392b" : "#cf43ea", color: "#fff", borderColor: "transparent" }
                    : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                  {k === "WASTAGE" ? "Wastage" : "Gift (free out)"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Warehouse" required>
            <WhPills whs={whs} value={warehouseId} onChange={setWarehouseId} />
          </Field>
        </div>
        <Field label="Reason" required>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors"
                style={reason === r
                  ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
                  : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                {r}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Items" required hint="Money is computed automatically at each item's AVCO cost">
          <LinesEditor lines={lines} setLines={setLines} options={options} byId={byId} showValue />
        </Field>
        <Field label="Note">
          <input className="ipt w-full" placeholder={kind === "WASTAGE" ? "e.g. Morning sorting" : "e.g. Sent to client office"}
            value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] text-body">
            Total write-off: <b style={{ color: kind === "WASTAGE" ? "#c0392b" : "#cf43ea" }}>{formatTaka(totalPaisa)}</b>
          </span>
          <SaveBtn onClick={save} busy={busy}
            disabled={!warehouseId || !reason || validLines(lines).length === 0}
            label={kind === "WASTAGE" ? "Post wastage" : "Post gift"} />
        </div>
      </div>

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
        blurb="Count the shelf, type what you found — the mismatch shows itself in qty AND taka, and one Apply posts every adjustment, linked to the session (DEC-INV-009). Applied sessions are immutable."
      />
      {isDemo && <DemoBar what="warehouses" onRetry={reload} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      {!counting && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[640px] mb-6">
          <Field label="Warehouse to count" required>
            <WhPills whs={whs} value={warehouseId} onChange={setWarehouseId} />
          </Field>
          <button onClick={startCounting} disabled={!warehouseId || busy}
            className="text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40"
            style={{ background: ACCENT }}>
            {busy ? "Loading…" : "Start counting"}
          </button>
        </div>
      )}

      {counting && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 mb-6">
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

          <div className="flex items-center justify-between mt-4">
            <span className="text-[13.5px] text-body">
              {filled.length} counted · net mismatch:{" "}
              <b style={{ color: totalDiffPaisa === 0 ? "#5c4a6b" : totalDiffPaisa > 0 ? "#0e7a3d" : "#c0392b" }}>
                {formatTaka(totalDiffPaisa)}
              </b>
            </span>
            <span className="flex items-center gap-2.5">
              <input className="ipt w-[220px]" placeholder="Note (e.g. Weekly count)"
                value={note} onChange={(e) => setNote(e.target.value)} />
              <SaveBtn onClick={save} busy={busy} disabled={filled.length === 0} label="Save session" />
            </span>
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

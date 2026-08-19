"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ACCENT_BG, ItemPageHead, ErrBar, DemoBar, Field, QuickSelect, ItemThumb, msg } from "./ItemUI";
import {
  loadItemsSafe, listUnits, createPurchase, isCostJumpRefusal,
  listSuppliers, createSupplier, listSupplierTypes,
  formatTaka, toMilli, uploadItemImage, PAY_METHODS, ITEM_TYPE_META,
  type ApiItem, type ApiUnit, type PayMethod, type PurchaseLineWrite, type ItemType,
  type ApiSupplier,
} from "../_data/api";

/*
  New purchase — ONE screen, Biznify-Direct-Bill style (the owner's 331-of-331 habit).
  Architecture: RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (22 Jul 2026) + DEC-PUR-006b.

  Owner's UI rulings (22 Jul):
  · "Add item" opens a SEPARATE full picker — you shop from the item list there,
    exactly like Biznify's Add Item page. No inline dropdown-only flow.
  · Every item shows its photo exactly as saved in the Item module (real photo,
    else the stable SKU-colour tile — DEC-ITM-012).
  · Adjustment has a +/− selector beside the amount, like Biznify.

  Two doors, one book (DEC-PUR-001):
    · normal save  → RECEIVED on the spot (the market-morning case)
    · advance mode → ADVANCE_PAID, goods arrive later; the advance is required
*/

type Line = {
  key: number;
  item: ApiItem;
  unitId: string;
  qty: string; // human units — toMilli on save
  priceTk: string; // taka per unit
};

let lineKey = 1;

const tkToPaisa = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/* ================================================================ item picker
   The separate "shop from your items" surface (owner: "alada akta page ase and
   sekhan theke iteam gula ney"). Full-screen overlay: search, type tabs, photo
   cards; tap to add, tap again to add more of the same. */

export function ItemPicker({
  items, onDone, onClose, single = false, title = "Pick items",
}: {
  items: ApiItem[];
  onDone: (picked: { item: ApiItem; qty: number }[]) => void;
  onClose: () => void;
  /** single = tap a card → chosen immediately (Assembly's transfer target etc.) */
  single?: boolean;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ItemType | "ALL">("ALL");
  const [sel, setSel] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) =>
    (tab === "ALL" || i.itemType === tab) &&
    (!needle || i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle)),
  );
  const count = [...sel.values()].reduce((s, n) => s + n, 0);

  const bump = (id: string, d: number) =>
    setSel((m) => {
      const n = new Map(m);
      const v = (n.get(id) ?? 0) + d;
      if (v <= 0) n.delete(id); else n.set(id, v);
      return n;
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-8" style={{ background: "rgba(40,20,50,.45)" }}>
      <div className="bg-white rounded-[18px] shadow-2xl flex flex-col min-h-0 overflow-hidden w-full max-w-[980px]"
        style={{ height: "min(82vh, 760px)" }}>
        {/* head */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-lavender-deep flex-wrap">
          <h2 className="font-display text-[19px] text-purple m-0 mr-1">{title}</h2>
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft pointer-events-none"><Icon name="search" size={15} /></span>
            <input autoFocus className="ipt ipt-icon w-full" placeholder="Search name or SKU…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["ALL", "RAW", "FINISHED", "PACKAGING", "CONSUMABLE"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="text-[12px] font-medium px-2.5 py-1.5 rounded-[9px] border"
                style={tab === t
                  ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                  : { background: "#fff", borderColor: "#e3d7ec", color: "#6b5878" }}>
                {t === "ALL" ? "All" : ITEM_TYPE_META[t].short}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-auto text-body-soft hover:text-purple text-[22px] leading-none px-1">×</button>
        </div>

        {/* the shelf */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ background: "#faf7fd" }}>
          {shown.length === 0 && (
            <p className="text-[13px] text-body-soft">Nothing matches. Items are created under <b>Items → New item</b>.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((i) => {
              const n = sel.get(i.id) ?? 0;
              return (
                <button key={i.id} type="button"
                  onClick={() => (single ? onDone([{ item: i, qty: 1 }]) : bump(i.id, +1))}
                  className="text-left bg-white rounded-[14px] border px-3.5 py-3 flex items-center gap-3 transition-all"
                  style={{ borderColor: n > 0 ? ACCENT : "#e9def2", boxShadow: n > 0 ? `0 0 0 2px ${ACCENT}22` : undefined }}>
                  {/* the photo, exactly as the Item module saved it (DEC-ITM-012) */}
                  <ItemThumb item={i} size={46} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-body truncate">{i.name}</span>
                    <span className="block text-[13px] text-body-soft truncate">
                      {i.sku} · {i.unit?.name ?? "—"}{i.standardCostPaisa > 0 ? ` · ${formatTaka(i.standardCostPaisa)}` : ""}
                    </span>
                  </span>
                  {n > 0 && (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span onClick={(e) => { e.stopPropagation(); bump(i.id, -1); }}
                        className="w-[22px] h-[22px] rounded-full border border-lavender-deep grid place-items-center text-body hover:border-orchid">−</span>
                      <b className="text-[13px] text-purple min-w-[16px] text-center">{n}</b>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* foot */}
        {single ? null : (
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-lavender-deep bg-white">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px]">Cancel</button>
            <button disabled={count === 0}
              onClick={() => onDone([...sel.entries()].map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty })))}
              className="text-white text-[13px] font-medium px-5 py-2 rounded-[10px] disabled:opacity-40" style={{ background: ACCENT }}>
              Add {count > 0 ? `${count} item${count > 1 ? "s" : ""}` : "items"}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================ the form */

export default function PurchaseNewView() {
  const router = useRouter();
  const [items, setItems] = useState<ApiItem[]>([]);
  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [costJump, setCostJump] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // DEC-SUP-007 — supplier now comes from the Supplier master (QuickSelect +
  // inline create). supplierName is saved as the snapshot text.
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [supplierPhone, setSupplierPhone] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptNo, setReceiptNo] = useState("");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [discountTk, setDiscountTk] = useState("");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(-1); // Biznify-style ± dropdown
  const [signOpen, setSignOpen] = useState(false);
  const [adjustTk, setAdjustTk] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [advance, setAdvance] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [payTk, setPayTk] = useState("");

  useEffect(() => {
    (async () => {
      const r = await loadItemsSafe();
      // PUR-R02 — only purchasable items may go on a purchase line (DEC-ITM-013)
      setItems(r.items.filter((i) => i.isPurchasable && i.isActive));
      setIsDemo(r.isDemo);
      try { setUnits(await listUnits()); } catch { setUnits([]); }
    })();
  }, []);

  useEffect(() => {
    listSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const chosenSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const supplierName = chosenSupplier?.name ?? "";

  // picking a supplier brings his phone along — one less thing to type
  useEffect(() => {
    if (chosenSupplier?.phone) setSupplierPhone(chosenSupplier.phone);
  }, [supplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** inline quick-create (DEC-SUP-007) — name only, first Product-Supplier type */
  async function quickCreateSupplier(label: string): Promise<string | null> {
    try {
      const types = await listSupplierTypes();
      const t = types.find((x) => x.name === "Product Supplier") ?? types[0];
      if (!t) { setErr("No supplier types exist yet — open Suppliers → Settings once."); return null; }
      const created = await createSupplier({ name: label, typeId: t.id });
      setSuppliers((p) => [...p, created]);
      return created.id;
    } catch (e) { setErr(msg(e, "Could not create that supplier.")); return null; }
  }

  /** picker result → merge into lines (same item picked again = qty goes up) */
  function addPicked(picked: { item: ApiItem; qty: number }[]) {
    setLines((ls) => {
      const next = [...ls];
      for (const p of picked) {
        const ex = next.find((l) => l.item.id === p.item.id);
        if (ex) {
          const cur = parseFloat(ex.qty);
          ex.qty = String((Number.isFinite(cur) ? cur : 0) + p.qty);
        } else {
          next.push({
            key: lineKey++,
            item: p.item,
            unitId: p.item.unitId,
            qty: String(p.qty),
            // starting price = current cost — one less thing to type
            priceTk: p.item.standardCostPaisa > 0 ? String(p.item.standardCostPaisa / 100) : "",
          });
        }
      }
      return next;
    });
    setPickerOpen(false);
  }

  const patchLine = (key: number, p: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const lineTotal = (l: Line) => Math.round((toMilli(l.qty) * tkToPaisa(l.priceTk)) / 1000);
  const subTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount = tkToPaisa(discountTk);
  const adjust = adjustSign * Math.abs(tkToPaisa(adjustTk));
  const grand = Math.max(subTotal - discount + adjust, 0);
  const pay = tkToPaisa(payTk);

  const ready =
    supplierName.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((l) => toMilli(l.qty) > 0 && tkToPaisa(l.priceTk) >= 0) &&
    discount <= subTotal &&
    pay <= grand &&
    (!advance || pay > 0);

  async function save(confirmCost = false) {
    setBusy(true); setErr(null); setCostJump(null);
    try {
      const created = await createPurchase({
        supplierName: supplierName.trim(),
        supplierId: supplierId || undefined, // DEC-SUP-007 — the FK link
        supplierPhone: supplierPhone.trim() || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        supplierReceiptNo: receiptNo.trim() || undefined,
        attachmentUrl: attachment ?? undefined,
        notes: notes.trim() || undefined,
        discountPaisa: discount,
        adjustmentPaisa: adjust,
        mode: (advance ? "ADVANCE" : "QUICK") as "QUICK" | "ADVANCE",
        lines: lines.map((l): PurchaseLineWrite => ({
          itemId: l.item.id,
          unitId: l.unitId || l.item.unitId,
          qtyMilli: toMilli(l.qty),
          unitPricePaisa: tkToPaisa(l.priceTk),
        })),
        payment: pay > 0 ? { amountPaisa: pay, method: payMethod } : undefined,
        confirmCost,
      });
      router.push(`/purchases/${created.id}`);
    } catch (e) {
      if (isCostJumpRefusal(e)) {
        setCostJump(msg(e, "The price is far from the current cost.").replace(/^COST_JUMP:/, ""));
      } else {
        setErr(msg(e, "Could not save the purchase."));
      }
    } finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title="New purchase"
      />
      {isDemo && <DemoBar what="sample items in the picker (saving needs the API)" onRetry={() => location.reload()} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}

      {costJump && (
        <div className="rounded-[14px] border-2 px-5 py-4 mb-4" style={{ background: "#fff4e6", borderColor: "#f0b95e" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#8a5209" }}>⚠ Price looks unusual</b>
          <p className="text-[13px] text-body m-0 mb-3">{costJump}</p>
          <div className="flex gap-2">
            <button onClick={() => setCostJump(null)} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px]">
              Let me fix the number
            </button>
            <button onClick={() => save(true)} disabled={busy}
              className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px]" style={{ background: "#b45309" }}>
              The price is right — save anyway
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div>
          {/* ---------------- header card ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              {/* DEC-SUP-007 — pick from the Supplier master; type a new name to create
                  him on the spot. supplierName is stored as the snapshot text. */}
              <Field label="Supplier" required>
                <QuickSelect
                  value={supplierId}
                  placeholder="Pick a supplier — or type a new name to create one"
                  onChange={setSupplierId}
                  onCreate={quickCreateSupplier}
                  createLabel="Create supplier"
                  options={suppliers.map((s) => ({
                    id: s.id,
                    label: s.nickname ? `${s.name} (${s.nickname})` : s.name,
                    hint: s.duePaisa > 0 ? `due ${formatTaka(s.duePaisa)}` : undefined,
                    imageUrl: s.photoUrl ?? undefined,
                    tintSeed: s.name,
                  }))}
                />
              </Field>
              <Field label="Phone">
                <input className="ipt w-full" placeholder="01…" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
              </Field>
              <Field label="Date" required>
                <input type="date" className="ipt w-full" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
              <Field label="Supplier receipt no">
                <input className="ipt w-full" placeholder="Their chalan / memo no — KM-4471" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
              </Field>
            </div>
            <Field label="Notes">
              <input className="ipt w-full" placeholder="Morning flowers, weekend stock…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex items-center gap-3">
              <label className="border border-dashed border-lavender-deep rounded-[12px] px-4 py-2.5 text-[12.5px] font-medium text-purple cursor-pointer hover:border-orchid inline-flex items-center gap-2">
                <Icon name="upload" size={14} />
                {receiptBusy ? "Uploading…" : attachment ? "Change receipt photo" : "Add receipt photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={receiptBusy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setReceiptBusy(true);
                    /* a receipt is read, not admired — 1200px is enough to make
                       the handwriting legible without sending a 6MB photograph */
                    try { setAttachment(await uploadItemImage(f, "purchases", 1200)); }
                    catch (er) { setErr(msg(er, "Could not upload that image.")); }
                    finally { setReceiptBusy(false); }
                  }} />
              </label>
              {attachment && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment} alt="receipt" className="h-[44px] rounded-[8px] border border-lavender-deep" />
                  <button type="button" className="text-[13px] text-body-soft underline" onClick={() => setAttachment(null)}>remove</button>
                </>
              )}
            </div>
          </div>

          {/* ---------------- lines ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-5">
            <div style={{ background: ACCENT }} className="grid grid-cols-[minmax(0,1fr)_120px_90px_110px_100px_40px] gap-2 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
              <span>Item</span><span>Unit</span><span>Qty</span><span>Price (৳/unit)</span><span className="text-right">Total</span><span />
            </div>
            <div className="divide-y divide-lavender-deep">
              {lines.length === 0 && (
                <div className="px-4 py-8 text-center text-[13px] text-body-soft">
                  Nothing on the bill yet — press <b>Add items</b> and pick from your shelf.
                </div>
              )}
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_120px_90px_110px_100px_40px] gap-2 px-4 py-2.5 items-center">
                  {/* the item as the Item module saved it — photo first (owner's rule) */}
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ItemThumb item={l.item} size={36} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-body truncate">{l.item.name}</span>
                      <span className="block text-[13px] text-body-soft truncate">{l.item.sku}</span>
                    </span>
                  </span>
                  <QuickSelect
                    value={l.unitId}
                    placeholder={l.item.unit?.name ?? "Unit"}
                    allowClear={false}
                    options={units
                      .filter((u) => u.isActive || u.id === l.unitId) // hidden units: no NEW picks (19 Aug)
                      .map((u) => ({ id: u.id, label: u.name }))}
                    onChange={(id) => patchLine(l.key, { unitId: id })}
                  />
                  <input className="ipt w-full" placeholder="0" inputMode="decimal"
                    value={l.qty} onChange={(e) => patchLine(l.key, { qty: e.target.value })} />
                  <input className="ipt w-full" placeholder="0.00" inputMode="decimal"
                    value={l.priceTk} onChange={(e) => patchLine(l.key, { priceTk: e.target.value })} />
                  <span className="text-[13px] font-medium text-right">{formatTaka(lineTotal(l))}</span>
                  <button type="button" title="Remove line" className="icon-btn justify-self-end"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setPickerOpen(true)}
              className="w-full text-left px-4 py-3 text-[12.5px] font-medium flex items-center gap-2 border-t border-lavender-deep"
              style={{ background: ACCENT_BG, color: ACCENT }}>
              <Icon name="plus" size={13} /> Add items
            </button>
          </div>
        </div>

        {/* ---------------- totals + payment rail ---------------- */}
        <div className="xl:sticky xl:top-4 space-y-4">
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
            <div className="flex justify-between text-[13px] py-1"><span className="text-body-soft">Subtotal</span><b>{formatTaka(subTotal)}</b></div>
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-body-soft">Discount (৳)</span>
              <input className="ipt w-[110px] text-right" placeholder="0" inputMode="decimal"
                value={discountTk} onChange={(e) => setDiscountTk(e.target.value)} />
            </div>
            {/* Biznify-style ± dropdown (owner, 22 Jul rev-2: "drop down kre daw").
                Custom, not a native <select> (conventions sec 13.3). */}
            <div className="flex justify-between items-center text-[13px] py-1 gap-2">
              <span className="text-body-soft" title="Round figure: 39,920 → 39,900 = − 20">Adjustment</span>
              <span className="flex items-center gap-1.5">
                <span className="relative">
                  <button type="button" onClick={() => setSignOpen((v) => !v)}
                    className="ipt flex items-center gap-1.5 font-bold"
                    style={{ minHeight: 36, width: 58, color: adjustSign === 1 ? "#0e7a3d" : "#c0392b" }}>
                    {adjustSign === 1 ? "+" : "−"}
                    <Icon name="chevronDown" size={12} className="ml-auto opacity-60" />
                  </button>
                  {signOpen && (
                    <>
                      <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setSignOpen(false)} aria-hidden />
                      <div className="absolute z-20 right-0 mt-1 w-[120px] bg-white border border-lavender-deep rounded-[10px] shadow-soft overflow-hidden">
                        <button type="button" onClick={() => { setAdjustSign(1); setSignOpen(false); }}
                          className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-lavender/40 flex items-center gap-2">
                          <b style={{ color: "#0e7a3d" }}>+</b> <span className="text-body">Add</span>
                          {adjustSign === 1 && <Icon name="check" size={12} className="ml-auto text-purple" />}
                        </button>
                        <button type="button" onClick={() => { setAdjustSign(-1); setSignOpen(false); }}
                          className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-lavender/40 flex items-center gap-2 border-t border-lavender-deep/60">
                          <b style={{ color: "#c0392b" }}>−</b> <span className="text-body">Subtract</span>
                          {adjustSign === -1 && <Icon name="check" size={12} className="ml-auto text-purple" />}
                        </button>
                      </div>
                    </>
                  )}
                </span>
                <input className="ipt w-[86px] text-right" placeholder="0" inputMode="decimal"
                  value={adjustTk} onChange={(e) => setAdjustTk(e.target.value)} />
              </span>
            </div>
            {adjust !== 0 && (
              <p className="text-[11.5px] text-body-soft text-right m-0">
                {adjustSign === 1 ? "+" : "−"} {formatTaka(Math.abs(adjust))} adjusted
              </p>
            )}
            <div className="flex justify-between text-[14.5px] py-2 border-t border-lavender-deep mt-1">
              <b className="text-purple">Grand total</b><b className="text-purple">{formatTaka(grand)}</b>
            </div>

            <div className="border-t border-lavender-deep pt-3 mt-1">
              <label className="flex items-center gap-2.5 text-[13px] font-medium text-body mb-3 cursor-pointer">
                <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} className="w-4 h-4 accent-[#b45309]" />
                Advance order — goods arrive later
              </label>
              <Field label={advance ? "Advance paid now" : "Paid now"} required={advance}
                hint={pay < grand && pay > 0 ? `Due will be ${formatTaka(grand - pay)}` : undefined}>
                {/* no native select (conventions sec 13.3) — method chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PAY_METHODS.map((m) => (
                    <button key={m.id} type="button" onClick={() => setPayMethod(m.id)}
                      className="text-[12px] font-medium px-2.5 py-1.5 rounded-[9px] border"
                      style={payMethod === m.id
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#e3d7ec", color: "#6b5878" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <input className="ipt w-full text-right" placeholder="0" inputMode="decimal"
                  value={payTk} onChange={(e) => setPayTk(e.target.value)} />
              </Field>
              {pay > grand && <p className="text-[12px] text-[#c0392b] -mt-2 mb-2">Payment cannot exceed the grand total (PUR-R04).</p>}
            </div>

            <button disabled={!ready || busy} onClick={() => save(false)}
              className="w-full text-white text-[14px] font-medium px-4 py-3 rounded-[11px] disabled:opacity-40 mt-1"
              style={{ background: advance ? "#b45309" : ACCENT }}>
              {busy ? "Saving…" : advance ? "Save advance order" : "Save purchase (received)"}
            </button>
          </div>

        </div>
      </div>

      {pickerOpen && <ItemPicker items={items} onDone={addPicked} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

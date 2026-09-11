"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ACCENT_BG, ItemPageHead, ErrBar, DemoBar, Field, QuickSelect, ItemThumb, msg } from "./ItemUI";
import {
  loadItemsSafe, listUnits, createPurchase, addPurchasePayment, isCostJumpRefusal,
  listSuppliers, createSupplier, listSupplierTypes,
  formatTaka, toMilli, uploadItemImage, ITEM_TYPE_META,
  type ApiItem, type ApiUnit, type PayMethod, type PurchaseLineWrite, type ItemType,
  type ApiSupplier,
} from "../_data/api";
import { MoneyBlock, MoneyResult, PaymentLines, computeMoney, chargeNote, usePayRows, usePaymentMethods, BILL_TENDERS, type ChargeRow, type DiscountMode } from "./MoneyBlock";
import QtyStepper from "./QtyStepper";

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
  const setPicked = (id: string, qty: number) =>
    setSel((m) => {
      const n = new Map(m);
      if (qty <= 0) n.delete(id); else n.set(id, qty);
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
            <p className="text-[13px] text-body-soft">Nothing matches.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((i) => {
              const n = sel.get(i.id) ?? 0;
              return (
                /*  ⚠️ NOT a <button> — the quantity is a typeable field now
                    (26 Aug 2026), and an <input> inside a <button> cannot be
                    typed into. Click-to-add stays, by hand.  */
                <div key={i.id} role="button" tabIndex={0}
                  onClick={() => { if (single) onDone([{ item: i, qty: 1 }]); else if (n === 0) bump(i.id, +1); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (single) onDone([{ item: i, qty: 1 }]); else if (n === 0) bump(i.id, +1); } }}
                  className={`text-left bg-white rounded-[14px] border px-3.5 py-3 transition-all ${n > 0 ? "cursor-default" : "cursor-pointer"}`}
                  style={{ borderColor: n > 0 ? ACCENT : "#e9def2", boxShadow: n > 0 ? `0 0 0 2px ${ACCENT}22` : undefined }}>
                  <span className="flex items-center gap-3">
                    {/* the photo, exactly as the Item module saved it (DEC-ITM-012) */}
                    <ItemThumb item={i} size={46} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-body truncate">{i.name}</span>
                      <span className="block text-[13px] text-body-soft truncate">
                        {i.sku} · {i.unit?.name ?? "—"}{(i.standardCostPaisa ?? 0) > 0 ? ` · ${formatTaka(i.standardCostPaisa ?? 0)}` : ""}
                      </span>
                    </span>
                  </span>
                  {/*  the tile is narrow — the stepper takes its own line rather
                       than squeezing the name down to two letters  */}
                  {n > 0 && (
                    <span className="block mt-2" onClick={(e) => e.stopPropagation()}>
                      <QtyStepper grow size="sm" value={n} min={0} onChange={(q) => setPicked(i.id, q)} />
                    </span>
                  )}
                </div>
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

/* DEC-PUR-012 — supplier VAT rates; same set the counter offers (DEC-POS-016) */
const PURCHASE_TAX_RATES = [
  { label: "No VAT", value: 0 },
  { label: "VAT 5%", value: 5 },
  { label: "VAT 7.5%", value: 7.5 },
  { label: "VAT 15%", value: 15 },
];

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
  /*  CLAUDE.md §14 — the one money screen. Same block as the counter, in white.  */
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amt");
  const [discountInput, setDiscountInput] = useState(0);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [adjSign, setAdjSign] = useState<1 | -1>(-1);
  const [adjustmentTaka, setAdjustmentTaka] = useState(0);
  const [taxRate, setTaxRate] = useState(0); // DEC-PUR-012 — supplier VAT
  const [lines, setLines] = useState<Line[]>([]);
  const [advance, setAdvance] = useState(false);

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
            priceTk: (p.item.standardCostPaisa ?? 0) > 0 ? String((p.item.standardCostPaisa ?? 0) / 100) : "",
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
  const sum = computeMoney({ subtotalPaisa: subTotal, discountMode, discountInput, charges, adjSign, adjustmentTaka, taxRate });
  const discount = sum.discountPaisa;
  const adjust = sum.extraPaisa; // named charges + the nameless round-off, as one number
  const grand = sum.totalPaisa;
  const billMethods = usePaymentMethods(BILL_TENDERS); // DEC-GBL-001
  const payRows = usePayRows(grand, "CASH");
  const pay = payRows.paidPaisa;

  const ready =
    supplierName.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((l) => toMilli(l.qty) > 0 && tkToPaisa(l.priceTk) >= 0) &&
    discount <= subTotal &&
    pay <= grand &&
    (!advance || pay > 0);

  async function save(confirmCost = false) {
    setBusy(true); setErr(null); setCostJump(null);
    const paidRows = payRows.pays.filter((r) => r.amountPaisa > 0);
    try {
      const created = await createPurchase({
        supplierName: supplierName.trim(),
        supplierId: supplierId || undefined, // DEC-SUP-007 — the FK link
        supplierPhone: supplierPhone.trim() || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        supplierReceiptNo: receiptNo.trim() || undefined,
        attachmentUrl: attachment ?? undefined,
        notes: [notes.trim(), chargeNote(charges, sum.adjustmentPaisa)].filter(Boolean).join(" · ") || undefined,
        discountPaisa: discount,
        adjustmentPaisa: adjust,
        taxRateBps: Math.round(taxRate * 100),
        mode: (advance ? "ADVANCE" : "QUICK") as "QUICK" | "ADVANCE",
        lines: lines.map((l): PurchaseLineWrite => ({
          itemId: l.item.id,
          unitId: l.unitId || l.item.unitId,
          qtyMilli: toMilli(l.qty),
          unitPricePaisa: tkToPaisa(l.priceTk),
        })),
        payment: paidRows.length ? { amountPaisa: paidRows[0].amountPaisa, method: paidRows[0].method as PayMethod } : undefined,
        confirmCost,
      });
      /*  the API takes one payment on create; the rest of the methods go on
          straight after, so a split bill is still one press for the buyer  */
      for (const r of paidRows.slice(1)) {
        await addPurchasePayment(created.id, { amountPaisa: r.amountPaisa, method: r.method as PayMethod, accountId: r.accountId });
      }
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
            <div style={{ background: ACCENT }} className="grid grid-cols-[minmax(0,1fr)_110px_112px_104px_96px_40px] gap-2 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
              <span>Item</span><span>Unit</span><span>Qty</span><span>Price (৳/unit)</span><span className="text-right">Total</span><span />
            </div>
            <div className="divide-y divide-lavender-deep">
              {lines.length === 0 && (
                <div className="px-4 py-8 text-center text-[13px] text-body-soft">
                  Nothing on the bill yet.
                </div>
              )}
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_110px_112px_104px_96px_40px] gap-2 px-4 py-2.5 items-center">
                  {/* the item as the Item module saved it — photo first (owner's rule) */}
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ItemThumb item={l.item} size={36} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-body truncate">{l.item.name}</span>
                      <span className="block text-[13px] text-body-soft truncate">{l.item.sku}</span>
                    </span>
                  </span>
                  {/*  DEC-PUR-013 (owner, 26 Aug 2026) — a purchase line may only be
                       counted in the item's own unit or its base. The full unit list
                       here let staff pick a foreign measure (Kg on a rose) and stock
                       arithmetic swallowed it without complaint. Same family = the
                       conversion is exact; anything else does not belong on this line.
                       Changing what an item is counted in happens on the Item itself
                       (DEC-ITM-026), never mid-purchase.  */}
                  <QuickSelect
                    value={l.unitId}
                    placeholder={l.item.unit?.name ?? "Unit"}
                    allowClear={false}
                    options={(() => {
                      const mine = units.find((u) => u.id === l.item.unitId);
                      const base = mine?.baseUnitId ? units.find((u) => u.id === mine.baseUnitId) : undefined;
                      const picked = l.unitId ? units.find((u) => u.id === l.unitId) : undefined;
                      const list = [mine, base];
                      if (picked && !list.some((u) => u?.id === picked.id)) list.push(picked); // old drafts keep their unit visible
                      return list
                        .filter((u): u is NonNullable<typeof u> => !!u)
                        .map((u) => ({ id: u.id, label: u.name }));
                    })()}
                    onChange={(id) => patchLine(l.key, { unitId: id })}
                  />
                  {/*  the same stepper the counter uses; one shape for a
                       quantity everywhere (owner, 21 Aug: "atai standard").
                       Decimal, because a purchase can be 1.5 kg.  */}
                  <QtyStepper grow size="sm" decimal min={0} label="Quantity"
                    value={parseFloat(l.qty) || 0}
                    onChange={(n) => patchLine(l.key, { qty: String(n) })} />
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

        {/* ---------------- the money rail — CLAUDE.md §14, the same block, the same
                              purple, the same order as the till (owner, 21 Aug) --- */}
        <div className="xl:sticky xl:top-4">
          <div className="rounded-[16px] text-white shadow-lift flex flex-col overflow-hidden"
            style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)", height: "calc(100vh - 100px)" }}>

            <div className="p-4 pb-2 shrink-0">
              <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">This purchase</div>
            </div>

            <div className="px-4 shrink-0">
              {/*  no VAT door was possible until DEC-PUR-012; now the supplier bill
                   carries tax like any other, so all four doors are here.  */}
              <MoneyBlock
                subtotalPaisa={subTotal}
                discountMode={discountMode} discountInput={discountInput}
                charges={charges} adjSign={adjSign} adjustmentTaka={adjustmentTaka}
                taxRate={taxRate} taxRates={PURCHASE_TAX_RATES} sum={sum}
                onDiscount={setDiscountInput} onDiscountMode={setDiscountMode}
                onCharges={setCharges} onAdjSign={setAdjSign}
                onAdjustment={setAdjustmentTaka} onTaxRate={setTaxRate} />
            </div>

            <div className="flex-1 min-h-[8px]" />

            <div className="px-4 shrink-0 pb-1">
              <div className="rounded-[12px] px-3 py-3" style={{ background: "rgba(255,255,255,.07)" }}>
                <label className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#e7d8f2] mb-2.5 cursor-pointer">
                  <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} className="w-4 h-4 accent-[#f0b46a]" />
                  Advance order — goods arrive later
                </label>
                <PaymentLines pay={payRows} methods={billMethods}
                  title={advance ? "Advance paid now" : "Paid now"} maxHeight={168} />
              </div>
            </div>

            <div className="p-4 pt-3 border-t border-white/15 shrink-0">
              <MoneyResult pay={payRows} totalPaisa={grand}
                dueLabel="Still owed" settledLabel="Nothing owed" />

              {pay > grand && <p className="text-[12px] text-[#ff9b9b] mt-2 mb-0">Payment cannot exceed the grand total.</p>}
              {advance && pay === 0 && <p className="text-[12px] text-[#f0b46a] mt-2 mb-0">An advance order needs money now.</p>}

              <button disabled={!ready || busy} onClick={() => save(false)}
                className="w-full bg-white hover:bg-[#f4ecf9] text-[14.5px] font-semibold px-4 py-3 rounded-[12px] shadow-soft disabled:opacity-40 mt-3 inline-flex items-center justify-center gap-2"
                style={{ color: advance ? "#b45309" : "#4a1268" }}>
                <Icon name="check" size={17} />
                {busy ? "Saving…" : advance ? "Save advance order" : `Save purchase${grand > 0 ? " · " + formatTaka(grand) : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pickerOpen && <ItemPicker items={items} onDone={addPicked} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}

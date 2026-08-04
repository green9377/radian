"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrder, adaptOrder, editOrder, formatTaka, genBg, getAddOns, type ApiProduct, type ApiAddOn } from "../_data/api";
import { TONE, Panel, type Tone } from "./OrderViews";
import ProductPicker from "./ProductPicker";
import Icon from "./Icon";

/*
  Order Edit — one page, every edit option, price always visible on the right.
  Saves via PATCH /orders/:id, honouring the order's own editable-gates.

  What is editable, and why:
  · Items (add / quantity / remove) — only while Delivery hasn't started
    preparing. After that stock is committed (DEC-MOD-003), so composition locks.
  · Money (line discount · delivery charge · extra charges) — open until the
    order closes. Product price itself is never rewritten (Product owns price);
    concessions are recorded as discounts and charges, and land in the audit log.
*/

type Gates = { items: boolean; addItems?: boolean; recipient: boolean; delivery: boolean; notes: boolean };
type Line = {
  id: string;
  productId: string;
  name: string;
  bg: string;
  qty: number;
  unitPaisa: number;
  linePaisa: number;
  discountPaisa: number;
  productType: "crafted" | "readymade";
};
type OrderX = {
  id: string;
  orderNo?: string;
  isGift: boolean;
  customerId: string;
  sender: { name: string; phone: string };
  recipient: { name: string; phone: string } | null;
  giftMessage: string;
  address: string;
  date: string | null;
  slotLabel: string | null;
  deliveryNotes: string;
  internalNote: string;
  methodLabel: string;
  zone: "dhaka" | "bangladesh";
  salesStatus: string;
  deliveryStatus: string;
  lines: Line[];
  discountPaisa: number;
  couponCode: string | null;
  deliveryPaisa: number;
  payment: { method: string; paidPaisa: number; refundPaisa: number };
  editableGates?: Gates;
};

/** a new item being added in this edit (no line id yet) */
interface NewLine { key: string; productId: string; name: string; bg: string; unitPaisa: number; qty: number; crafted: boolean }
/** an extra charge or goodwill discount — label + signed amount */
interface Charge { key: string; label: string; paisa: number }

const labelCls = "text-[13px] text-body-soft font-medium mb-1 block";
const CHARGE_PRESETS = ["Gift wrap", "Urgent handling", "Extra ribbon", "Goodwill discount", "Loyalty discount"];

function Lock({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] rounded-[10px] px-3 py-2 mb-3 border" style={{ background: TONE.amber.bg, borderColor: TONE.amber.border, color: TONE.amber.text }}>
      <Icon name="shield" size={15} /> {text}
    </div>
  );
}

export default function OrderEditForm({ id }: { id: string }) {
  const router = useRouter();
  const [o, setO] = useState<OrderX | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [address, setAddress] = useState("");
  const [dateVal, setDateVal] = useState("");
  const [slotVal, setSlotVal] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, number>>({});

  /* item edits */
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewLine[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickTab, setPickTab] = useState<"product" | "addon">("product");
  const [addons, setAddons] = useState<ApiAddOn[]>([]);
  const [addonQ, setAddonQ] = useState("");

  /* money edits */
  const [deliveryPaisa, setDeliveryPaisa] = useState(0);
  const [charges, setCharges] = useState<Charge[]>([]);

  useEffect(() => {
    setLoading(true);
    getOrder(id)
      .then((raw) => {
        const a = adaptOrder(raw) as unknown as OrderX;
        setO(a);
        setRecipientName(a.recipient?.name ?? "");
        setRecipientPhone(a.recipient?.phone ?? "");
        setGiftMessage(a.giftMessage ?? "");
        setAddress(a.address ?? "");
        setDateVal(a.date ?? "");
        setSlotVal(a.slotLabel ?? "");
        setDeliveryNotes(a.deliveryNotes ?? "");
        setInternalNote(a.internalNote ?? "");
        setDeliveryPaisa(a.deliveryPaisa ?? 0);
        setLineDiscounts(Object.fromEntries((a.lines ?? []).map((l) => [l.id, l.discountPaisa ?? 0])));
        setQtyById(Object.fromEntries((a.lines ?? []).map((l) => [l.id, l.qty])));
      })
      .catch(() => setO(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="px-8 pt-10"><p className="text-body-soft">Loading order…</p></div>;
  if (!o) return <div className="px-8 pt-10"><p className="text-body-soft">Order not found. <Link href="/orders" className="text-purple underline">Back to orders</Link></p></div>;

  const terminal = o.salesStatus === "cancelled" || o.salesStatus === "completed";
  if (terminal) {
    return (
      <div className="px-8 pt-10 max-w-[560px]">
        <h1 className="font-display text-[22px] text-purple">This order is closed</h1>
        <p className="text-body-soft text-[14px]">A {o.salesStatus} order can’t be edited. <Link href={`/orders/${o.id}`} className="text-purple underline">Back to the order</Link></p>
      </div>
    );
  }

  const gates: Gates = o.editableGates ?? { items: false, recipient: false, delivery: false, notes: false };
  /* adding a new item stays open longer than changing an existing one */
  const canAdd = gates.addItems ?? gates.items;
  const liveLines = (o.lines ?? []).filter((l) => !removed.includes(l.id));

  /* ---- money ---- */
  const existingSubtotal = liveLines.reduce((s, l) => s + l.unitPaisa * (qtyById[l.id] ?? l.qty), 0);
  const addedSubtotal = added.reduce((s, a) => s + a.unitPaisa * a.qty, 0);
  const subtotal = existingSubtotal + addedSubtotal;
  const lineDiscTotal = liveLines.reduce((s, l) => s + Math.min(lineDiscounts[l.id] ?? 0, l.unitPaisa * (qtyById[l.id] ?? l.qty)), 0);
  const chargeTotal = charges.reduce((s, c) => s + c.paisa, 0);
  const total = Math.max(0, subtotal - o.discountPaisa - lineDiscTotal + chargeTotal) + deliveryPaisa;
  const paidNet = (o.payment?.paidPaisa ?? 0) - (o.payment?.refundPaisa ?? 0);
  const due = Math.max(0, total - paidNet);
  const refund = Math.max(0, paidNet - total);

  const setQty = (lid: string, q: number) => setQtyById((m) => ({ ...m, [lid]: Math.max(1, q) }));
  const addProduct = (p: ApiProduct) => {
    setAdded((ls) => {
      const hit = ls.find((x) => x.productId === p.id);
      if (hit) return ls.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...ls, { key: `${p.id}-${Date.now()}`, productId: p.id, name: p.name, bg: genBg(p.slug), unitPaisa: p.offerPricePaisa, qty: 1, crafted: p.productType === "CRAFTED" }];
    });
    setShowPicker(false);
  };
  const addCharge = (label = "", paisa = 0) => setCharges((c) => [...c, { key: `c-${Date.now()}-${Math.random()}`, label, paisa }]);
  /* an add-on is priced but is not a Product, so it lands as a named charge line
     (⇄ next schema step: OrderLine.addOnId so add-ons become first-class lines) */
  const addAddOn = (a: ApiAddOn) => {
    addCharge(`Add-on: ${a.name}`, a.pricePaisa);
    setShowPicker(false);
  };
  const patchCharge = (key: string, patch: Partial<Charge>) => setCharges((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function save() {
    if (!o) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const dto: Record<string, unknown> = {};
      if (o.isGift && gates.recipient) {
        dto.recipientName = recipientName;
        dto.recipientPhone = recipientPhone;
        dto.giftMessage = giftMessage;
      }
      if (gates.delivery) {
        dto.address = address;
        dto.date = dateVal || undefined;
        dto.slotLabel = slotVal || undefined;
        dto.deliveryNotes = deliveryNotes;
      }
      if (gates.items) {
        if (removed.length) dto.removeLineIds = removed;
        const changedQty = liveLines.filter((l) => (qtyById[l.id] ?? l.qty) !== l.qty).map((l) => ({ lineId: l.id, qty: qtyById[l.id] }));
        if (changedQty.length) dto.lineQty = changedQty;
      }
      // adding stays open longer than changing (see editableFields on the API)
      if (canAdd && added.length) dto.addLines = added.map((a) => ({ productId: a.productId, qty: a.qty }));
      if (gates.notes) {
        dto.internalNote = internalNote;
        dto.deliveryPaisa = deliveryPaisa;
        dto.adjustmentPaisa = chargeTotal;
        if (charges.length) dto.adjustmentNote = charges.map((c) => `${c.label || "charge"} ${formatTaka(c.paisa)}`).join(" · ");
        dto.lineDiscounts = liveLines.map((l) => ({ lineId: l.id, discountPaisa: Math.min(lineDiscounts[l.id] ?? 0, l.unitPaisa * (qtyById[l.id] ?? l.qty)) }));
      }
      await editOrder(o.id, dto);
      router.push(`/orders/${o.id}`);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const itemsChanged = removed.length > 0 || added.length > 0 || liveLines.some((l) => (qtyById[l.id] ?? l.qty) !== l.qty);

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1240px]">
      {/* header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href={`/orders/${o.id}`} className="border border-lavender-deep bg-white text-body-soft hover:text-purple w-[40px] h-[40px] rounded-[12px] grid place-items-center shrink-0"><Icon name="chevronLeft" size={20} /></Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[24px] text-purple m-0 leading-none">Edit order {o.orderNo ?? ""}</h1>
          <p className="text-body-soft text-[13px] m-0 mt-1">Items, charges, delivery and notes — the price updates on the right as you go.</p>
        </div>
        <Link href={`/orders/${o.id}`} className="border border-lavender-deep bg-white text-[13.5px] px-4 py-2.5 rounded-[12px] font-medium hover:text-purple text-body-soft">Cancel</Link>
        <button type="button" disabled={saving} onClick={save} className="bg-purple hover:bg-purple-deep disabled:opacity-50 text-white text-[13.5px] px-5 py-2.5 rounded-[12px] font-medium inline-flex items-center gap-2 shadow-soft">
          <Icon name="check" size={17} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {saveErr && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] border" style={{ background: TONE.rose.bg, borderColor: TONE.rose.border, color: TONE.rose.text }}>{saveErr}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="min-w-0">
          {/* recipient */}
          {o.isGift ? (
            <Panel title="Recipient & gift" icon="pin" tone="gold">
              <div className="p-5">
                {!gates.recipient && <Lock text="Recipient is locked — the order is already out for delivery." />}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div><label className={labelCls}>Recipient name</label><input className="ipt h-[42px]" value={recipientName} disabled={!gates.recipient} onChange={(e) => setRecipientName(e.target.value)} /></div>
                  <div><label className={labelCls}>Recipient phone (rider calls this)</label><input className="ipt h-[42px]" value={recipientPhone} disabled={!gates.recipient} onChange={(e) => setRecipientPhone(e.target.value)} /></div>
                </div>
                <div className="mt-3"><label className={labelCls}>Gift message (on the card)</label><textarea className="ipt" rows={2} value={giftMessage} disabled={!gates.recipient} onChange={(e) => setGiftMessage(e.target.value)} /></div>
              </div>
            </Panel>
          ) : (
            <Panel title="Customer" icon="user" tone="purple">
              <div className="p-5 text-[13px] text-body-soft">
                Self order for <Link href={`/customers/${o.customerId}`} className="text-purple underline font-medium">{o.sender.name}</Link> · {o.sender.phone}. Name and phone are edited in the customer profile.
              </div>
            </Panel>
          )}

          {/* delivery */}
          <Panel title="Delivery" icon="truck" tone="blue">
            <div className="p-5">
              {!gates.delivery && <Lock text="Address and slot are locked — the order is out for delivery." />}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <div className="col-span-full"><label className={labelCls}>Delivery address</label><input className="ipt h-[42px]" value={address} disabled={!gates.delivery} onChange={(e) => setAddress(e.target.value)} /></div>
                <div><label className={labelCls}>Date</label><input className="ipt h-[42px]" value={dateVal} disabled={!gates.delivery} onChange={(e) => setDateVal(e.target.value)} placeholder="2026-07-17" /></div>
                <div><label className={labelCls}>Time slot</label><input className="ipt h-[42px]" value={slotVal} disabled={!gates.delivery} onChange={(e) => setSlotVal(e.target.value)} placeholder="10 AM – 1 PM" /></div>
                <div className="col-span-full"><label className={labelCls}>Delivery note (rider)</label><input className="ipt h-[42px]" value={deliveryNotes} disabled={!gates.delivery} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="Call on arrival, gate code…" /></div>
              </div>
              <p className="text-[13px] text-body-soft mt-2 mb-0">Method &amp; zone: {o.methodLabel} · {o.zone === "dhaka" ? "Inside Dhaka" : "Nationwide"} — changing the method is a Delivery-side action.</p>
            </div>
          </Panel>

          {/* items */}
          <Panel title="Items & prices" icon="bag" tone="purple" count={liveLines.length + added.length}>
            <div className="p-5">
              {!gates.items && (
                <Lock
                  text={
                    canAdd
                      ? "Preparing has started, so existing items can't be changed or removed (stock is committed, DEC-MOD-003). You can still add something and apply discounts."
                      : "The order is out for delivery — items are locked. Discounts and charges are still open."
                  }
                />
              )}

              <div className="flex flex-col gap-2.5">
                {liveLines.map((l) => {
                  const q = qtyById[l.id] ?? l.qty;
                  const lineTotal = l.unitPaisa * q;
                  const disc = Math.min(lineDiscounts[l.id] ?? 0, lineTotal);
                  const t = l.productType === "crafted" ? TONE.amber : TONE.purple;
                  return (
                    <div key={l.id} className="border rounded-[12px] p-3" style={{ borderColor: t.border, background: t.bg }}>
                      <div className="grid grid-cols-[44px_minmax(0,1fr)_112px_100px_34px] gap-3 items-center">
                        <div className="w-[44px] h-[44px] rounded-[10px]" style={{ background: l.bg }} />
                        <div className="min-w-0">
                          <Link href={`/products/${l.productId}`} className="block truncate font-medium text-purple text-[13.5px] hover:underline">{l.name}</Link>
                          <div className="text-[11.5px]" style={{ color: t.text }}>{formatTaka(l.unitPaisa)} each · {l.productType === "crafted" ? "crafted (advance)" : "readymade"}</div>
                        </div>
                        {gates.items ? (
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setQty(l.id, q - 1)} className="w-8 h-8 rounded-[9px] border bg-white text-purple font-medium" style={{ borderColor: t.border }}>−</button>
                            <span className="w-8 text-center text-[13.5px] font-medium">{q}</span>
                            <button type="button" onClick={() => setQty(l.id, q + 1)} className="w-8 h-8 rounded-[9px] border bg-white text-purple font-medium" style={{ borderColor: t.border }}>+</button>
                          </div>
                        ) : (
                          <div className="text-[13px] text-body-soft text-center">× {q}</div>
                        )}
                        <div className="text-right text-[13.5px] font-medium text-purple">{formatTaka(lineTotal)}</div>
                        {gates.items ? (
                          <button type="button" onClick={() => setRemoved((r) => [...r, l.id])} className="w-[34px] h-[34px] grid place-items-center rounded-[9px] border bg-white" style={{ borderColor: t.border, color: TONE.rose.text }} title="Remove"><Icon name="trash" size={15} /></button>
                        ) : <span />}
                      </div>
                      <div className="flex items-center gap-2 mt-2 pl-[56px] flex-wrap">
                        <span className="text-[12px]" style={{ color: t.text }}>Discount ৳</span>
                        <div className="w-[100px]"><input type="number" min={0} className="ipt h-[34px]" value={Math.round(disc / 100)} onChange={(e) => setLineDiscounts((m) => ({ ...m, [l.id]: Math.max(0, Number(e.target.value)) * 100 }))} /></div>
                        {disc > 0 && <span className="text-[12px]" style={{ color: TONE.green.text }}>line now {formatTaka(Math.max(0, lineTotal - disc))}</span>}
                      </div>
                    </div>
                  );
                })}

                {/* newly added */}
                {added.map((a) => (
                  <div key={a.key} className="border rounded-[12px] p-3" style={{ borderColor: TONE.green.border, background: TONE.green.bg }}>
                    <div className="grid grid-cols-[44px_minmax(0,1fr)_112px_100px_34px] gap-3 items-center">
                      <div className="w-[44px] h-[44px] rounded-[10px]" style={{ background: a.bg }} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-purple text-[13.5px]">{a.name} <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: TONE.green.soft, color: TONE.green.text }}>new</span></div>
                        <div className="text-[11.5px]" style={{ color: TONE.green.text }}>{formatTaka(a.unitPaisa)} each · {a.crafted ? "crafted (advance)" : "readymade"}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setAdded((ls) => ls.map((x) => (x.key === a.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="w-8 h-8 rounded-[9px] border bg-white text-purple font-medium" style={{ borderColor: TONE.green.border }}>−</button>
                        <span className="w-8 text-center text-[13.5px] font-medium">{a.qty}</span>
                        <button type="button" onClick={() => setAdded((ls) => ls.map((x) => (x.key === a.key ? { ...x, qty: x.qty + 1 } : x)))} className="w-8 h-8 rounded-[9px] border bg-white text-purple font-medium" style={{ borderColor: TONE.green.border }}>+</button>
                      </div>
                      <div className="text-right text-[13.5px] font-medium text-purple">{formatTaka(a.unitPaisa * a.qty)}</div>
                      <button type="button" onClick={() => setAdded((ls) => ls.filter((x) => x.key !== a.key))} className="w-[34px] h-[34px] grid place-items-center rounded-[9px] border bg-white" style={{ borderColor: TONE.green.border, color: TONE.rose.text }}><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                ))}

                {/* removed (undo) */}
                {removed.map((rid) => {
                  const l = (o.lines ?? []).find((x) => x.id === rid);
                  if (!l) return null;
                  return (
                    <div key={rid} className="border rounded-[12px] px-3 py-2 flex items-center gap-3" style={{ borderColor: TONE.rose.border, background: TONE.rose.bg }}>
                      <Icon name="trash" size={15} />
                      <span className="text-[12.5px] flex-1 min-w-0 truncate" style={{ color: TONE.rose.text }}>{l.name} — will be removed</span>
                      <button type="button" onClick={() => setRemoved((r) => r.filter((x) => x !== rid))} className="text-[12px] font-medium underline" style={{ color: TONE.rose.text }}>Undo</button>
                    </div>
                  );
                })}
              </div>

              {canAdd && (
                <div className="mt-4">
                  {showPicker ? (
                    <div className="border rounded-[12px] p-3" style={{ borderColor: TONE.purple.border, background: TONE.purple.bg }}>
                      {/* tabs — a product becomes a real order line, an add-on becomes a priced charge */}
                      <div className="flex gap-2 mb-3">
                        {([["product", "Products"], ["addon", "Add-ons"]] as [typeof pickTab, string][]).map(([v, label]) => {
                          const on = pickTab === v;
                          return (
                            <button key={v} type="button" onClick={() => setPickTab(v)} className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border"
                              style={on ? { background: TONE.purple.solid, color: "#fff", borderColor: TONE.purple.solid } : { background: "#fff", color: TONE.purple.text, borderColor: TONE.purple.border }}>
                              {label}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setShowPicker(false)} className="ml-auto text-[13px] text-body-soft underline">Close</button>
                      </div>

                      {pickTab === "product" ? (
                        <ProductPicker onAdd={(_slug, p) => addProduct(p)} zone={o.zone} />
                      ) : (
                        <div>
                          <label className={labelCls}>Add an add-on</label>
                          <input className="ipt h-[42px]" placeholder="Search add-ons…" value={addonQ} onChange={(e) => setAddonQ(e.target.value)} />
                          <div className="mt-2 border rounded-[12px] max-h-[240px] overflow-auto bg-white" style={{ borderColor: TONE.purple.border }}>
                            {addons.filter((a) => a.isActive && a.name.toLowerCase().includes(addonQ.toLowerCase())).map((a) => (
                              <button key={a.id} type="button" onClick={() => addAddOn(a)} className="w-full flex items-center gap-3 px-3 py-2 text-left border-b border-lavender-deep last:border-0 hover:bg-lavender/60">
                                <div className="w-[36px] h-[36px] rounded-[9px] shrink-0" style={{ background: genBg(a.id) }} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-medium text-purple truncate">{a.name}</div>
                                  <div className="text-[13px] text-body-soft">{formatTaka(a.pricePaisa)}</div>
                                </div>
                                <span className="text-[12px] font-medium inline-flex items-center gap-1 shrink-0" style={{ color: TONE.purple.text }}><Icon name="plus" size={14} /> Add</span>
                              </button>
                            ))}
                            {addons.filter((a) => a.isActive && a.name.toLowerCase().includes(addonQ.toLowerCase())).length === 0 && (
                              <div className="px-3 py-4 text-[13px] text-body-soft">No add-ons found. Create them under Products → Add-ons.</div>
                            )}
                          </div>
                          <p className="text-[13px] text-body-soft mt-2 mb-0">An add-on is added as a named, priced charge — it shows on the summary and changes the total.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setShowPicker(true); if (addons.length === 0) getAddOns().then((b) => setAddons(b.addons)).catch(() => {}); }} className="text-white text-[13px] px-4 py-2.5 rounded-[11px] font-medium inline-flex items-center gap-1.5" style={{ background: TONE.purple.solid }}>
                      <Icon name="plus" size={15} /> Add product or add-on
                    </button>
                  )}
                </div>
              )}
            </div>
          </Panel>

          {/* charges */}
          <Panel title="Charges & adjustments" icon="cash" tone="gold" hint="delivery charge, extra charges, or a goodwill discount">
            <div className="p-5">
              <div className="max-w-[280px]">
                <label className={labelCls}>Delivery charge ৳</label>
                <input type="number" min={0} className="ipt h-[42px]" value={Math.round(deliveryPaisa / 100)} disabled={!gates.notes} onChange={(e) => setDeliveryPaisa(Math.max(0, Number(e.target.value)) * 100)} />
              </div>

              <div className="mt-4">
                <label className={labelCls}>Extra charges &amp; discounts</label>
                {charges.length === 0 && <p className="text-[13px] text-body-soft mt-0 mb-2">None yet. Add a charge (＋) or a goodwill discount (−).</p>}
                <div className="flex flex-col gap-2">
                  {charges.map((c) => (
                    <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_130px_34px] gap-2 items-center">
                      <input className="ipt h-[38px]" list="charge-presets" placeholder="What is it for?" value={c.label} onChange={(e) => patchCharge(c.key, { label: e.target.value })} />
                      <input type="number" className="ipt h-[38px]" placeholder="৳" value={Math.round(c.paisa / 100)} onChange={(e) => patchCharge(c.key, { paisa: Math.round(Number(e.target.value)) * 100 })} />
                      <button type="button" onClick={() => setCharges((x) => x.filter((y) => y.key !== c.key))} className="w-[34px] h-[34px] grid place-items-center rounded-[9px] border bg-white" style={{ borderColor: TONE.rose.border, color: TONE.rose.text }}><Icon name="trash" size={15} /></button>
                    </div>
                  ))}
                </div>
                <datalist id="charge-presets">{CHARGE_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <button type="button" onClick={() => addCharge()} className="text-[12.5px] px-3 py-1.5 rounded-[9px] font-medium border bg-white" style={{ borderColor: TONE.gold.border, color: TONE.gold.text }}>＋ Add charge</button>
                  {CHARGE_PRESETS.slice(0, 3).map((p) => (
                    <button key={p} type="button" onClick={() => addCharge(p)} className="text-[12px] px-3 py-1.5 rounded-full border bg-white text-body-soft hover:border-orchid">{p}</button>
                  ))}
                </div>
                {chargeTotal !== 0 && (
                  <div className="mt-3 text-[12.5px] rounded-[10px] px-3 py-2 border inline-block" style={{ background: chargeTotal > 0 ? TONE.gold.bg : TONE.green.bg, borderColor: chargeTotal > 0 ? TONE.gold.border : TONE.green.border, color: chargeTotal > 0 ? TONE.gold.text : TONE.green.text }}>
                    Net adjustment: {chargeTotal > 0 ? "+" : "−"} {formatTaka(Math.abs(chargeTotal))}
                  </div>
                )}
              </div>

              <div className="mt-4"><label className={labelCls}>Internal staff note (private)</label><textarea className="ipt" rows={2} value={internalNote} disabled={!gates.notes} onChange={(e) => setInternalNote(e.target.value)} placeholder="Never shown to the customer" /></div>
            </div>
          </Panel>
        </div>

        {/* summary */}
        <aside className="lg:sticky lg:top-4">
          <div className="bg-white border rounded-[18px] shadow-lift overflow-hidden" style={{ borderColor: TONE.purple.border }}>
            <div className="px-5 py-3 flex items-center gap-2.5" style={{ background: TONE.purple.bg, borderBottom: `1px solid ${TONE.purple.border}` }}>
              <span className="w-7 h-7 rounded-[9px] grid place-items-center text-white" style={{ background: TONE.purple.solid }}><Icon name="cash" size={15} /></span>
              <h3 className="font-display text-[15px] m-0" style={{ color: TONE.purple.text }}>Order summary</h3>
            </div>
            <div className="p-5">
              <div className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft">Sub-total</span><span>{formatTaka(subtotal)}</span></div>
              {lineDiscTotal > 0 && <div className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft">Line discounts</span><span style={{ color: TONE.green.text }}>− {formatTaka(lineDiscTotal)}</span></div>}
              {o.discountPaisa > 0 && <div className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft">Coupon {o.couponCode}</span><span>− {formatTaka(o.discountPaisa)}</span></div>}
              {charges.map((c) => c.paisa !== 0 && (
                <div key={c.key} className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft truncate">{c.label || "Charge"}</span><span>{c.paisa < 0 ? "− " : "+ "}{formatTaka(Math.abs(c.paisa))}</span></div>
              ))}
              <div className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft">Delivery</span><span>{formatTaka(deliveryPaisa)}</span></div>

              <div className="flex justify-between items-baseline py-2.5 mt-1 border-t" style={{ borderColor: TONE.purple.border }}>
                <span className="text-purple font-medium">Total</span>
                <span className="font-display text-[24px] text-purple leading-none">{formatTaka(total)}</span>
              </div>
              <div className="flex justify-between py-1 text-[13.5px]"><span className="text-body-soft">Already paid</span><span>{formatTaka(paidNet)}</span></div>
              {due > 0 && (
                <div className="flex justify-between py-2 px-3 mt-1 rounded-[10px]" style={{ background: TONE.gold.bg }}>
                  <span className="font-medium" style={{ color: TONE.gold.text }}>{o.payment.method === "cod" ? "Collect on delivery" : "To charge"}</span>
                  <span className="font-medium text-[15px]" style={{ color: TONE.gold.text }}>{formatTaka(due)}</span>
                </div>
              )}
              {refund > 0 && (
                <div className="flex justify-between py-2 px-3 mt-1 rounded-[10px]" style={{ background: TONE.rose.bg }}>
                  <span className="font-medium" style={{ color: TONE.rose.text }}>To refund</span>
                  <span className="font-medium text-[15px]" style={{ color: TONE.rose.text }}>{formatTaka(refund)}</span>
                </div>
              )}
              {due === 0 && refund === 0 && <div className="text-[12.5px] font-medium mt-1" style={{ color: TONE.green.text }}>Fully paid — nothing to collect.</div>}

              {itemsChanged && (
                <div className="mt-3 text-[12px] rounded-[10px] px-3 py-2 border" style={{ background: TONE.blue.bg, borderColor: TONE.blue.border, color: TONE.blue.text }}>
                  Items changed — the customer will be charged or refunded the difference on save.
                </div>
              )}

              <button type="button" disabled={saving} onClick={save} className="w-full mt-4 bg-purple hover:bg-purple-deep disabled:opacity-50 text-white text-[14px] py-3 rounded-[12px] font-medium inline-flex items-center justify-center gap-2 shadow-soft">
                <Icon name="check" size={17} /> {saving ? "Saving…" : "Save changes"}
              </button>
              <Link href={`/orders/${o.id}`} className="block text-center text-[13px] text-body-soft mt-2 hover:text-purple">Cancel without saving</Link>
              <p className="text-[13px] text-body-soft mt-3 mb-0">Items lock once preparing starts (stock committed). Discounts and charges stay open until the order closes — every change is written to the activity log.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

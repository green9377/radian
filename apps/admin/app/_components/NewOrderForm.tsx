"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiPost,
  listProducts,
  listCustomers,
  listChannels,
  createCustomer,
  createOrder,
  addOrderPayment,
  formatTaka,
  genBg,
  quoteOffers,
  deliveryConfigSafe,
  type ApiProduct,
  type ApiCustomer,
  type ApiChannel,
  type ApiQuoteResult,
  type ApiDeliveryMethod,
} from "../_data/api";
import Icon from "./Icon";
import ProductPicker from "./ProductPicker";
import CustomerSelect from "./CustomerSelect";

/*
  New order — staff-created (phone / Facebook / WhatsApp). Same Sales model as a
  website order; only the channel differs. Fully working mock in local state.
  ⇄ SWAP HERE: POST /orders (staff-created) when the Sales API lands.

  Rules enforced in the form (locked):
  - Customer is found by phone (identity key) or created new.
  - Self vs gift is an order attribute; gift needs a recipient.
  - COD only for self orders with no crafted (made-to-order / prepaidOnly) item.
  - Money = paisa; totals computed live, never typed by hand.
*/

/* delivery methods — mirror of the storefront config, static for the mock.
   ⇄ SWAP HERE: Delivery module supplies methods, zones, slots, fees. */
type Zone = "dhaka" | "bangladesh";
const METHODS = [
  { id: "express", label: "2-Hour Express", zone: "dhaka", feePaisa: 15000, slots: false, date: false },
  { id: "sameday", label: "Same Day", zone: "dhaka", feePaisa: 6000, slots: true, date: false },
  { id: "midnight", label: "Midnight Surprise", zone: "dhaka", feePaisa: 26000, slots: false, date: true },
  { id: "scheduled", label: "Schedule It", zone: "dhaka", feePaisa: 6000, slots: true, date: true },
  { id: "courier", label: "Nationwide Courier", zone: "bangladesh", feePaisa: 12000, slots: false, date: false },
] as const;
const SLOTS = ["10 AM – 1 PM", "3 PM – 6 PM", "6 PM – 9 PM"];
/* channel dropdown — fixed options, with "Custom…" last so admin can name their own.
   ⇄ SWAP HERE: a Channel master (admin add/remove) supplies this list. */
const CHANNELS = ["Phone", "WhatsApp", "Call", "Shop", "Facebook", "Instagram"];

const isCrafted = (p?: ApiProduct) => p?.productType === "CRAFTED";

interface Line {
  key: string;
  slug: string;
  qty: number;
}

const cardCls = "bg-white border border-lavender-deep rounded-[16px] shadow-soft p-6 mb-5";
const labelCls = "text-[13px] text-body-soft font-medium mb-1 block";

export default function NewOrderForm() {
  const router = useRouter();
  const [apiCustomers, setApiCustomers] = useState<ApiCustomer[]>([]);
  const [apiProducts, setApiProducts] = useState<ApiProduct[]>([]);
  const [apiChannels, setApiChannels] = useState<ApiChannel[]>([]);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  /* DEC-DLV-002 / P3 — methods from the Delivery master; static METHODS is the
     offline fallback. Shape-mapped into the form's existing method model. */
  const [apiMethods, setApiMethods] = useState<ApiDeliveryMethod[] | null>(null);
  useEffect(() => {
    listCustomers().then((r) => setApiCustomers(r.items)).catch(() => {});
    listProducts().then((r) => setApiProducts(r.items)).catch(() => {});
    listChannels().then(setApiChannels).catch(() => {});
    deliveryConfigSafe().then(setApiMethods).catch(() => {});
  }, []);

  const [channelSel, setChannelSel] = useState("Phone");
  const [customChannel, setCustomChannel] = useState("");
  const channel = channelSel === "__custom" ? customChannel.trim() || "Custom" : channelSel;

  // customer — pick from dropdown, or create new
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const selected = selectedId ? apiCustomers.find((c) => c.id === selectedId) ?? null : null;
  const custName = selected ? selected.name : name;
  const custPhone = selected ? selected.phone : phone;

  // self / gift
  const [isGift, setIsGift] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  // items
  const [lines, setLines] = useState<Line[]>([]);

  // delivery — live master when the API is up, static METHODS otherwise
  const [zone, setZone] = useState<Zone>("dhaka");
  type FormMethod = { id: string; label: string; zone: Zone; feePaisa: number; slots: boolean; date: boolean; slotList: string[]; slotIds: Record<string, string>; live: boolean };
  const allMethods: FormMethod[] = apiMethods && apiMethods.length
    ? apiMethods.map((m) => ({
        id: m.id,
        label: m.label,
        zone: (m.zone === "DHAKA" ? "dhaka" : "bangladesh") as Zone,
        feePaisa: m.feePaisa,
        slots: m.slots.length > 0,
        date: true, // live master: date always settable (scheduled orders)
        slotList: m.slots.map((s) => s.label),
        slotIds: Object.fromEntries(m.slots.map((s) => [s.label, s.id])),
        live: true,
      }))
    : METHODS.map((m) => ({ id: m.id, label: m.label, zone: m.zone as Zone, feePaisa: m.feePaisa, slots: m.slots, date: m.date, slotList: [...SLOTS], slotIds: {}, live: false }));
  const methods = allMethods.filter((m) => m.zone === zone);
  const [method, setMethod] = useState(allMethods[0]?.id ?? "express");
  const activeMethod = allMethods.find((m) => m.id === method) ?? methods[0] ?? allMethods[0];
  // API config এলে বাছা method zone-এ না থাকলে প্রথমটায় ফেরত
  useEffect(() => {
    if (methods.length && !methods.some((m) => m.id === method)) setMethod(methods[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMethods, zone]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState(SLOTS[0]);
  const [address, setAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  // payment
  const [payment, setPayment] = useState<"online" | "cod">("online");

  const addLine = (slug: string) => {
    setLines((ls) => {
      const hit = ls.find((l) => l.slug === slug);
      if (hit) return ls.map((l) => (l.slug === slug ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: `${slug}-${Date.now()}`, slug, qty: 1 }];
    });
  };
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));
  const setLineQty = (key: string, qty: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)));

  const prod = (slug: string) => apiProducts.find((p) => p.slug === slug);
  const subtotal = lines.reduce((s, l) => s + (prod(l.slug)?.offerPricePaisa ?? 0) * l.qty, 0);
  const deliveryFee = lines.length ? activeMethod.feePaisa : 0;

  /* DEC-OFR-003 — live offer/coupon preview from the quote engine (OFR-R10:
     the server re-runs this at create; the preview is display only). */
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<ApiQuoteResult | null>(null);
  const offerDiscount = quote?.discountPaisa ?? 0;
  const offerWaived = quote?.deliveryWaivedPaisa ?? 0;
  const total = Math.max(0, subtotal - offerDiscount + deliveryFee - offerWaived);
  const hasCrafted = lines.some((l) => isCrafted(prod(l.slug)));
  const codAllowed = !isGift && !hasCrafted;
  // effective payment — auto-fall back to online when COD isn't allowed (derived, no setState-in-render)
  const effPayment: "online" | "cod" = payment === "cod" && !codAllowed ? "online" : payment;
  /* cash taken in hand right now (counter / phone order) — recorded as an advance */
  const [cashPaisa, setCashPaisa] = useState(0);

  // debounce the quote — every cart/payment/coupon change re-prices via the engine
  useEffect(() => {
    const lineInputs = lines
      .map((l) => ({ productId: prod(l.slug)?.id, qty: l.qty }))
      .filter((x): x is { productId: string; qty: number } => !!x.productId);
    if (!lineInputs.length) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        setQuote(
          await quoteOffers({
            customerId: selected?.id,
            lines: lineInputs,
            deliveryPaisa: deliveryFee,
            paymentMethod: effPayment,
            couponCode: couponCode.trim() || undefined,
          }),
        );
      } catch { setQuote(null); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, deliveryFee, effPayment, couponCode, selected?.id, apiProducts]);

  const changeZone = (z: Zone) => {
    setZone(z);
    const first = allMethods.find((m) => m.zone === z);
    if (first) setMethod(first.id);
  };

  const errors: string[] = [];
  if (!selected && !newMode) errors.push("Choose a customer or create a new one.");
  if (!custName.trim()) errors.push("Add a customer name.");
  if (!custPhone.trim()) errors.push("Add a customer phone.");
  if (lines.length === 0) errors.push("Add at least one item.");
  if (isGift && !recipientName.trim()) errors.push("Gift order needs a recipient name.");
  if (!address.trim()) errors.push("Add a delivery address.");

  async function resolveChannelId(nameOrCustom: string): Promise<string> {
    const found = apiChannels.find(
      (c) => c.name.toLowerCase() === nameOrCustom.toLowerCase() || c.slug === nameOrCustom.toLowerCase(),
    );
    if (found) return found.id;
    // admin-configurable channel (DEC-SAL-001) — create on the fly
    const base = nameOrCustom.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
    // through the shared client — carries the session token like every other call
    const created = await apiPost<{ id: string }>("/channels", {
      slug: `${base}-${Date.now().toString().slice(-4)}`,
      name: nameOrCustom,
    });
    return created.id;
  }

  async function create() {
    setPlaceErr(null);
    if (errors.length) {
      setPlaceErr(errors.join(" · "));
      return;
    }
    setPlacing(true);
    try {
      let customerId: string;
      if (selected) customerId = selected.id;
      else {
        const c = await createCustomer({ name: custName, phone: custPhone, whatsappVerified: true });
        customerId = c.id;
      }
      const channelId = await resolveChannelId(channel);
      const order = await createOrder({
        customerId,
        channelId,
        isGift,
        recipientName: isGift ? recipientName : undefined,
        recipientPhone: isGift ? recipientPhone : undefined,
        giftMessage: isGift ? giftMessage : undefined,
        zone: zone === "dhaka" ? "DHAKA" : "BANGLADESH",
        address,
        deliveryNotes: deliveryNote || undefined,
        methodLabel: activeMethod.label,
        slotLabel: activeMethod.slots ? slot : undefined,
        date: activeMethod.date ? date || undefined : undefined,
        // DEC-DLV-002 — FK when the live master supplied the method
        deliveryMethodId: activeMethod.live ? activeMethod.id : undefined,
        deliverySlotId: activeMethod.live && activeMethod.slots ? activeMethod.slotIds[slot] : undefined,
        paymentMethod: effPayment,
        deliveryPaisa: deliveryFee,
        couponCode: couponCode.trim() || undefined, // server re-validates (OFR-R10)
        internalNote: internalNote || undefined,
        lines: lines.map((l) => ({ productId: prod(l.slug)?.id, qty: l.qty })).filter((x) => x.productId),
      });
      // cash taken in hand at the counter / on the phone — recorded straight away
      if (cashPaisa > 0) {
        await addOrderPayment(order.id, { kind: "ADVANCE", amountPaisa: Math.min(cashPaisa, total), note: "Cash collected at order creation" });
      }
      router.push(`/orders/${order.id}`);
    } catch (e) {
      setPlaceErr(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="px-6 md:px-8 pt-6 pb-24 max-w-[1500px]">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-lavender/85 backdrop-blur border-b border-lavender-deep flex items-center gap-3 mb-6">
        <Link
          href="/orders"
          className="border border-lavender-deep bg-white text-body-soft hover:text-purple w-[38px] h-[38px] rounded-[11px] grid place-items-center shrink-0"
          title="Back"
        >
          <Icon name="chevronLeft" size={19} />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-[22px] text-purple m-0 leading-tight">New order</h1>
          <p className="text-body-soft text-[12.5px] m-0">
            Staff-taken order — same Sales record as a website order.
          </p>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={placing}
          className="bg-purple hover:bg-purple-deep text-white text-[13.5px] px-5 py-2.5 rounded-[11px] font-medium inline-flex items-center gap-2 shadow-soft disabled:opacity-50"
        >
          <Icon name="check" size={17} /> {placing ? "Placing…" : "Create order"}
        </button>
      </div>

      {placeErr && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {placeErr}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="min-w-0">
          {/* CHANNEL + CUSTOMER */}
          <div className={cardCls}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-3">Channel &amp; customer</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div>
                <label className={labelCls}>Channel</label>
                <select className="ipt h-[44px]" value={channelSel} onChange={(e) => setChannelSel(e.target.value)}>
                  {CHANNELS.map((c) => (<option key={c} value={c}>{c}</option>))}
                  <option value="__custom">Custom…</option>
                </select>
                {channelSel === "__custom" && (
                  <input className="ipt h-[40px] mt-2" placeholder="Name your channel (e.g. TikTok, Reseller)" value={customChannel} onChange={(e) => setCustomChannel(e.target.value)} />
                )}
              </div>
            </div>

            {/* customer — dropdown to pick, or create new */}
            <div className="mt-4">
              <label className={labelCls}>Customer</label>
              {newMode ? (
                <>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div><input className="ipt h-[44px]" placeholder="New customer name" value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <div><input className="ipt h-[44px]" placeholder="Phone (+8801… — identity)" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                  </div>
                  <button type="button" onClick={() => { setNewMode(false); setName(""); setPhone(""); }} className="text-[12.5px] text-purple font-medium mt-2 inline-flex items-center gap-1 hover:underline"><Icon name="chevronLeft" size={13} /> Pick an existing customer instead</button>
                </>
              ) : (
                <>
                  <CustomerSelect selected={selected} onSelect={(c) => { setSelectedId(c.id); setNewMode(false); }} onCreateNew={() => { setNewMode(true); setSelectedId(null); }} />
                  {selected && (
                    <div className="mt-2 flex items-center gap-2.5 flex-wrap bg-[#e6f4ec] border border-[#bfe3cd] rounded-[10px] px-3 py-2.5">
                      <Icon name="check" size={16} />
                      <span className="text-[12.5px] text-[#2e7d5b]"><b className="font-medium">{selected.name}</b> · {selected.ordersCount} orders · LTV {formatTaka(selected.ltvPaisa)}</span>
                      <div className="flex items-center gap-2 ml-auto">
                        <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1.5 bg-white border border-[#bfe3cd] text-[#2e7d5b] text-[12.5px] px-3 py-1.5 rounded-[9px] font-medium hover:bg-[#dff0e6]"><Icon name="phone" size={14} /> Call</a>
                        <Link href={`/customers/${selected.id}`} className="inline-flex items-center gap-1.5 bg-white border border-lavender-deep text-purple text-[12.5px] px-3 py-1.5 rounded-[9px] font-medium hover:border-orchid"><Icon name="user" size={14} /> Profile</Link>
                        <button type="button" onClick={() => setSelectedId(null)} className="text-[13px] text-body-soft underline">Change</button>
                      </div>
                    </div>
                  )}
                  {!selected && <p className="text-[13px] text-body-soft mt-2 mb-0">Pick an existing customer from the list (search + Call inside), or choose “Create new customer”.</p>}
                </>
              )}
            </div>
          </div>

          {/* SELF / GIFT */}
          <div className={cardCls}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-3">Who is it for</h3>
            <div className="inline-flex bg-lavender rounded-[11px] p-[4px] gap-[4px] mb-2">
              {[
                ["self", "Self"],
                ["gift", "Gift"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setIsGift(v === "gift")}
                  className={
                    "text-[13px] px-5 py-2 rounded-[8px] font-medium transition-colors " +
                    ((v === "gift") === isGift ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple")
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            {isGift && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mt-2">
                <div>
                  <label className={labelCls}>Recipient name</label>
                  <input className="ipt h-[44px]" placeholder="Tania Akter" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Recipient phone (Bangladesh)</label>
                  <input className="ipt h-[44px]" placeholder="01XXXXXXXXX" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                </div>
                <div className="col-span-full">
                  <label className={labelCls}>Gift message</label>
                  <textarea className="ipt" rows={2} placeholder="Happy Anniversary, my love." value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* ITEMS */}
          <div className={cardCls}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-3">Items</h3>

            {lines.length === 0 ? (
              <p className="text-[13px] text-body-soft mb-4">No items yet. Search and add products below.</p>
            ) : (
              <div className="flex flex-col gap-2.5 mb-4">
                {lines.map((l) => {
                  const p = prod(l.slug);
                  if (!p) return null;
                  return (
                    <div key={l.key} className="grid grid-cols-[44px_minmax(0,1fr)_86px_100px_34px] gap-3 items-center border border-lavender-deep rounded-[12px] p-3 bg-lavender/40">
                      <div className="w-[44px] h-[44px] rounded-[10px]" style={{ background: genBg(p.slug) }} />
                      <div className="min-w-0">
                        <div className="font-medium text-purple text-[13.5px] truncate">{p.name}</div>
                        <div className="text-[13px] text-body-soft">{formatTaka(p.offerPricePaisa)} each{isCrafted(p) ? " · crafted (advance)" : " · readymade"}</div>
                      </div>
                      <input type="number" min={1} className="ipt h-[38px] text-center" value={l.qty} onChange={(e) => setLineQty(l.key, Number(e.target.value))} />
                      <div className="text-right text-[13.5px] font-medium">{formatTaka(p.offerPricePaisa * l.qty)}</div>
                      <button type="button" onClick={() => removeLine(l.key)} className="text-body-soft hover:text-[#c0392b] w-[34px] h-[34px] grid place-items-center rounded-[9px] border border-lavender-deep" title="Remove">
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <ProductPicker onAdd={addLine} zone={zone} />
          </div>

          {/* DELIVERY */}
          <div className={cardCls}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-3">Delivery</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div>
                <label className={labelCls}>Zone</label>
                <select className="ipt h-[44px]" value={zone} onChange={(e) => changeZone(e.target.value as Zone)}>
                  <option value="dhaka">Inside Dhaka</option>
                  <option value="bangladesh">Nationwide</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Method</label>
                <select className="ipt h-[44px]" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {formatTaka(m.feePaisa)}
                    </option>
                  ))}
                </select>
              </div>
              {activeMethod.date && (
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" className="ipt h-[44px]" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              )}
              {activeMethod.slots && (
                <div>
                  <label className={labelCls}>Time slot</label>
                  <select className="ipt h-[44px]" value={slot} onChange={(e) => setSlot(e.target.value)}>
                    {activeMethod.slotList.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-full">
                <label className={labelCls}>Delivery address</label>
                <input className="ipt h-[44px]" placeholder="House, road, area, city" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="col-span-full">
                <label className={labelCls}>Delivery note (rider)</label>
                <input className="ipt h-[44px]" placeholder="Call on arrival, gate code…" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
              </div>
            </div>
          </div>

          {/* PAYMENT + NOTE */}
          <div className={cardCls}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-3">Payment &amp; note</h3>
            <div className="flex gap-2.5 flex-wrap mb-3">
              {[
                ["online", "Online (SSLCommerz link)"],
                ["cod", "Cash on delivery"],
              ].map(([v, l]) => {
                const disabled = v === "cod" && !codAllowed;
                const on = effPayment === v;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPayment(v as "online" | "cod")}
                    className={
                      "text-[13px] px-4 py-2.5 rounded-[11px] border font-medium transition-colors " +
                      (disabled
                        ? "border-lavender-deep text-body-soft/50 cursor-not-allowed bg-lavender/40"
                        : on
                          ? "bg-purple border-purple text-white"
                          : "bg-white border-lavender-deep text-body hover:border-orchid-mid")
                    }
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            {/* cash in hand right now — counter or phone order */}
            <div className="rounded-[12px] border p-3.5 mb-3" style={{ background: "#e9f9ef", borderColor: "#c2ecd3" }}>
              <label className={labelCls} style={{ color: "#0e7a3d" }}>Cash collected now ৳ (optional)</label>
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-[150px]">
                  <input type="number" min={0} className="ipt h-[42px]" value={cashPaisa ? Math.round(cashPaisa / 100) : ""} placeholder="0" onChange={(e) => setCashPaisa(Math.max(0, Number(e.target.value)) * 100)} />
                </div>
                <button type="button" onClick={() => setCashPaisa(total)} className="text-[12.5px] px-3 py-1.5 rounded-[9px] border bg-white font-medium" style={{ color: "#0e7a3d", borderColor: "#c2ecd3" }}>
                  Full amount ({formatTaka(total)})
                </button>
                {cashPaisa > 0 && (
                  <span className="text-[12.5px] font-medium" style={{ color: "#0e7a3d" }}>
                    Due after cash: {formatTaka(Math.max(0, total - cashPaisa))}
                  </span>
                )}
              </div>
              <p className="text-[11.5px] mt-1.5 mb-0" style={{ color: "#0e7a3d" }}>
                Money taken in hand at the counter or against a phone order — recorded on the order straight away.
              </p>
            </div>

            {!codAllowed && (
              <p className="text-[12px] text-[#b45309] mt-0 mb-3">
                Cash on delivery is off — {isGift ? "gift orders can't be COD" : "this cart has a crafted item that needs advance payment"}.
              </p>
            )}
            <label className={labelCls}>Internal staff note (private)</label>
            <textarea className="ipt" rows={2} placeholder="e.g. VIP — use premium ribbon, no invoice inside." value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
          </div>
        </div>

        {/* summary */}
        <aside className="lg:sticky lg:top-[84px]">
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-lift p-5">
            <div className="text-[13px] text-body-soft font-medium uppercase tracking-[0.06em] mb-3">Order summary</div>
            <div className="flex justify-between py-1.5 text-[13.5px]">
              <span className="text-body-soft">{lines.reduce((n, l) => n + l.qty, 0)} item(s)</span>
              <span>{formatTaka(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-[13.5px]">
              <span className="text-body-soft">Delivery · {activeMethod.label}</span>
              <span>{offerWaived > 0 ? <><s className="text-body-soft">{formatTaka(deliveryFee)}</s> <span className="text-[#0f7d55] font-semibold">Free</span></> : formatTaka(deliveryFee)}</span>
            </div>
            {/* DEC-OFR-003 — coupon + live engine preview */}
            <div className="py-1.5 border-t border-lavender-deep mt-1">
              <div className="flex gap-2 items-center pt-1.5">
                <input
                  className="ipt h-[38px] font-mono font-bold uppercase flex-1"
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                />
                {couponCode && (
                  <button type="button" onClick={() => setCouponCode("")} className="text-[12px] font-semibold text-body-soft hover:text-[#c0392b]">×</button>
                )}
              </div>
              {quote?.couponError && <div className="text-[11.5px] text-[#b91c1c] font-semibold mt-1.5">{quote.couponError}</div>}
              {quote?.applied.map((a) => (
                <div key={a.offerId} className="flex justify-between text-[12.5px] mt-1.5">
                  <span className="text-[#0f7d55] font-medium">✓ {a.name}{a.code ? ` (${a.code})` : ""}</span>
                  <span className="text-[#0f7d55] font-semibold">{a.freeDelivery ? "free delivery" : `−${formatTaka(a.discountPaisa)}`}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between py-2.5 border-t border-lavender-deep">
              <span className="text-purple font-medium">Total</span>
              <span className="text-purple font-medium text-[16px] font-display">{formatTaka(total)}</span>
            </div>
            <div className="text-[13px] text-body-soft border-t border-lavender-deep pt-2.5 space-y-1">
              <div>{isGift ? `Gift → ${recipientName || "recipient"}` : "Self order"}</div>
              <div>{custName || "customer"} · {channel}</div>
              <div>{effPayment === "online" ? "Online payment" : "Cash on delivery"}</div>
            </div>
            <button
              type="button"
              onClick={create}
              className="w-full mt-4 bg-purple hover:bg-purple-deep text-white text-[14px] py-3 rounded-[12px] font-medium inline-flex items-center justify-center gap-2 shadow-soft"
            >
              <Icon name="check" size={17} /> Create order
            </button>
            {errors.length > 0 && (
              <ul className="text-[11.5px] text-[#b45309] mt-3 list-disc pl-4 space-y-0.5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

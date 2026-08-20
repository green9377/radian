"use client";

import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "./backdropClose";
import Icon from "./Icon";
import { posCatalogue, listCustomers, formatTaka, genBg, posCurrentShift, posOpenShift, posCreateSale, type ApiPosCatalogueRow, type ApiCustomer, type ApiPosShift } from "../_data/api";
/*
  POS Sell screen — the counter (RADIAN_POS_MODULE_ARCHITECTURE.md).
  Live from :4000 only — demo fallbacks removed 6 Aug 2026 (owner's order).

  Decisions shown here (locked, POS kickoff 23 Jul):
  - DEC-POS-001  a completed sale = an Order (channel=POS); no separate ledger.
  - DEC-POS-006  the discount cap lives on the SERVER (per item or item category);
                 this screen no longer guesses one.
  - DEC-POS-007  customer optional (walk-in); credit needs an identified customer.
  - DEC-POS-009  split payment: many methods in one sale; cash excess = change.
  - DEC-POS-011  Hold / resume parked carts (rush time).
  - DEC-POS-012  gift → price-hidden receipt.
  - DEC-POS-015  Adjustment: manual ± amount on the bill (round-off / extra charge) + note.
  - DEC-POS-016  VAT/Tax: rate from Tax module; base = subtotal − discount ± adjustment.
  - DEC-POS-017  RETIRED 20 Aug — there is no Full/Partial choice. Money is taken,
                 as many ways as the customer likes; whatever is left over is the
                 due, and a due is what asks for a name and a number.
  - DEC-POS-018  the counter sells ITEMS, never Products (20 Aug).
*/

const cardCls = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";
const labelCls = "text-[12.5px] text-body-soft font-medium mb-1 block";

/*  DEC-POS-006 — the discount cap is the SERVER's (PosDiscountRule, per item or
    item category). A hardcoded map of website category names used to live here and
    quietly capped everything at 10% because nothing matched it (owner, 20 Aug).  */
const MANAGER_PIN = "1234"; // demo only — real gate = Roles & Permissions (POS-R13)

/* DEC-POS-016 — VAT rates come from the Tax module (admin-configurable). Demo set. */
const TAX_RATES = [
  { label: "No VAT", value: 0 },
  { label: "VAT 5%", value: 5 },
  { label: "VAT 7.5%", value: 7.5 },
  { label: "VAT 15%", value: 15 },
];

type PayMethod = "Cash" | "bKash" | "Nagad" | "Card";
const PAY_METHODS: PayMethod[] = ["Cash", "bKash", "Nagad", "Card"];

interface CartLine {
  key: string;
  /** DEC-POS-018 — the counter sells items, so a cart line IS an item */
  product: ApiPosCatalogueRow;
  qty: number;
  /**
   * POS-R15 (owner, 20 Aug) — the price is negotiable at the counter: a ৳200 thing
   * may go for ৳100 if that is the deal. Starts at the item's price and can be
   * typed over; the item's floor is the only wall.
   */
  unitPaisa: number;
}
interface PayRow {
  id: string;
  method: PayMethod;
  amountPaisa: number;
  /*  typed by the cashier. A row nobody has typed into carries whatever is
      still unpaid, so the numbers always add up to the bill by themselves.  */
  touched?: boolean;
}
interface HeldCart {
  id: string;
  label: string;
  lines: CartLine[];
  customerName: string;
  customerPhone: string;
  isGift: boolean;
  discountTaka: number;
  adjustmentTaka: number;
  adjustmentNote: string;
  taxRate: number;
  at: number;
}

export default function PosSellView() {
  const [products, setProducts] = useState<ApiPosCatalogueRow[]>([]);
  /*  6 Aug 2026 — demo fallback removed (owner's order, and here it was
      worse than cosmetic: a counter screen offering SELLABLE fake products
      is a mis-sale waiting to happen). Empty catalog = empty grid.  */
  useEffect(() => {
    /*  DEC-POS-018 — items, never products: everything marked "We sell it",
        services included. One thing, one price, one way stock leaves.  */
    posCatalogue()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  // ---- shift (live from :4000/pos) ----
  const [shift, setShift] = useState<ApiPosShift | null>(null);
  const [saleErr, setSaleErr] = useState<string | null>(null);
  useEffect(() => { posCurrentShift().then(setShift).catch(() => {}); }, []);
  const shiftOpen = !!shift;
  const openingFloatPaisa = shift?.openingFloatPaisa ?? 0;
  async function openShift() {
    setSaleErr(null);
    try {
      const s = await posOpenShift({ cashierName: "Cashier", openingFloatPaisa: 200000 });
      setShift(s);
    } catch (e) {
      setSaleErr(e instanceof Error ? e.message : "Could not open shift");
    }
  }

  // ---- catalogue browse ----
  const [view, setView] = useState<"grid" | "rows">("grid");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("radian:pos:view") : null;
    if (saved === "rows" || saved === "grid") setView(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("radian:pos:view", view);
  }, [view]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.categoryName && set.add(p.categoryName));
    return ["All", ...Array.from(set)];
  }, [products]);
  const grid = products
    .filter((p) => (cat === "All" ? true : p.categoryName === cat))
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);

  // ---- cart ----
  const [lines, setLines] = useState<CartLine[]>([]);
  /** how many of this item are already in the cart — the shelf has to cover them all */
  const inCart = (id: string) => lines.find((l) => l.product.id === id)?.qty ?? 0;
  /** POS-R14 — the counter cannot sell what is not on the shelf */
  const canAdd = (p: ApiPosCatalogueRow, extra = 1) =>
    p.stockQty === null || inCart(p.id) + extra <= p.stockQty;

  const add = (p: ApiPosCatalogueRow) =>
    setLines((ls) => {
      const hit = ls.find((l) => l.product.id === p.id);
      if (hit) {
        if (!canAdd(p)) return ls;
        return ls.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (!canAdd(p)) return ls;
      return [...ls, { key: `${p.id}-${Date.now()}`, product: p, qty: 1, unitPaisa: p.pricePaisa ?? 0 }];
    });
  const setQty = (key: string, qty: number) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const want = Math.max(1, qty);
        // never past the shelf (a service has no shelf, so it is never capped)
        const cap = l.product.stockQty === null ? want : Math.min(want, Math.max(1, l.product.stockQty));
        return { ...l, qty: cap };
      }),
    );
  const setUnit = (key: string, unitPaisa: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unitPaisa: Math.max(0, unitPaisa) } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  // ---- customer / gift ----
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  useEffect(() => {
    listCustomers()
      .then((r) => setCustomers(r.items))
      .catch(() => setCustomers([]));
  }, []);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [selectedCust, setSelectedCust] = useState<ApiCustomer | null>(null);
  const [custNew, setCustNew] = useState(false); // typing a brand-new customer
  const [custOpen, setCustOpen] = useState(false); // picker dropdown open
  const [custQ, setCustQ] = useState("");
  const [isGift, setIsGift] = useState(false);

  const pickCustomer = (c: ApiCustomer) => {
    setSelectedCust(c);
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustNew(false);
    setCustOpen(false);
    setCustQ("");
  };
  const clearCustomer = () => {
    setSelectedCust(null);
    setCustName("");
    setCustPhone("");
    setCustNew(false);
  };
  const custList = customers.filter((c) => {
    const ql = custQ.trim().toLowerCase();
    if (!ql) return true;
    const qd = ql.replace(/\D/g, "");
    const cd = c.phone.replace(/\D/g, "");
    return c.name.toLowerCase().includes(ql) || (qd.length >= 2 && cd.includes(qd));
  });

  // ---- discount + approval ----
  const [discountTaka, setDiscountTaka] = useState<number>(0);
  const [approved, setApproved] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinErr, setPinErr] = useState(false);

  // ---- adjustment (DEC-POS-015) + VAT (DEC-POS-016) ----
  const [adjustmentTaka, setAdjustmentTaka] = useState<number>(0);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [taxRate, setTaxRate] = useState<number>(0);

  // ---- payment ----
  /*  DEC-POS-017 retired (owner, 20 Aug): there is no Full/Partial choice any more.
      Whatever is taken is taken; whatever is left is the due. `payTouched` only
      remembers whether the cashier has typed an amount — until then the first line
      follows the bill, so the ordinary sale is one press.  */
  const [pays, setPays] = useState<PayRow[]>([{ id: "pay-first", method: "Cash", amountPaisa: 0 }]);
  const setPayMethodOf = (id: string, method: PayMethod) =>
    setPays((p) => p.map((r) => (r.id === id ? { ...r, method } : r)));
  const setPayAmt = (id: string, amountPaisa: number) =>
    setPays((p) => p.map((r) => (r.id === id ? { ...r, amountPaisa: Math.max(0, amountPaisa), touched: true } : r)));
  const removePay = (id: string) => setPays((p) => p.filter((r) => r.id !== id));
  const MAX_PAYS = 3;

  // ---- held carts ----
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  // ---- receipt ----
  const [receipt, setReceipt] = useState<null | { no: string; total: number; hideprice: boolean; due: number }>(null);

  // ---- money (DEC-POS-015/016) ----
  const subtotal = lines.reduce((s, l) => s + l.unitPaisa * l.qty, 0);
  const discountPaisa = Math.min(Math.round(discountTaka) * 100, subtotal);
  const adjustmentPaisa = Math.round(adjustmentTaka) * 100; // may be negative
  const taxableBase = Math.max(0, subtotal - discountPaisa + adjustmentPaisa);
  const vatPaisa = Math.round((taxableBase * taxRate) / 100);
  const total = taxableBase + vatPaisa;

  const paid = pays.reduce((s, r) => s + r.amountPaisa, 0);
  const cashPaid = pays.filter((r) => r.method === "Cash").reduce((s, r) => s + r.amountPaisa, 0);
  const duePaisa = Math.max(0, total - paid);
  const changePaisa = paid > total && cashPaid > 0 ? Math.min(cashPaid, paid - total) : 0;
  const overpaidNoChange = paid > total && changePaisa === 0; // digital overpay — can't give change

  /*  The cap lives on the server and it refuses in words; the screen no longer
      guesses one. Approval is still asked for when a line goes under its floor.  */
  const cap = 100;
  const discountPct = subtotal ? (discountPaisa / subtotal) * 100 : 0;
  const overCap = false;
  const needsApproval = false;

  useEffect(() => {
    if (!overCap && approved) setApproved(false);
  }, [overCap, approved]);

  // due (partial or full-credit) must be tied to a known customer — DEC-POS-008
  /*  A due is money owed by a person, so it needs a person (DEC-POS-008). This is
      the ONLY thing that asks for a name — a fully paid walk-in never does.  */
  const needsCustomer = duePaisa > 0 && !custName.trim() && !custPhone.trim();

  /*  The rows balance themselves: everything the cashier HAS typed stands, and the
      first row he has not typed into carries whatever is still unpaid. So one
      method is one press, and splitting is "type 600 in the second line" — the
      first drops to the rest on its own. Empty leftover rows cannot pile up.  */
  useEffect(() => {
    setPays((p) => {
      const typed = p.reduce((s, r) => s + (r.touched ? r.amountPaisa : 0), 0);
      const rest = Math.max(0, total - typed);
      let taken = false;
      let changed = false;
      const next = p.map((r) => {
        if (r.touched) return r;
        const want = taken ? 0 : rest;
        taken = true;
        if (r.amountPaisa === want) return r;
        changed = true;
        return { ...r, amountPaisa: want };
      });
      return changed ? next : p;
    });
  }, [total, pays]);

  const errors: string[] = [];
  if (!shiftOpen) errors.push("Open a shift to start selling.");
  if (lines.length === 0) errors.push("Add at least one item.");
  if (needsApproval) errors.push("Discount over limit — needs manager approval.");
  if (needsCustomer) errors.push(`${formatTaka(duePaisa)} unpaid — add a customer name or phone.`);
  /*  DEC-ITM-023 — an item nobody has priced cannot be rung up. Services usually
      land here first: no purchase means no cost, so no automatic price.  */
  {
    const unpriced = lines.filter((l) => l.unitPaisa <= 0).map((l) => l.product.name);
    if (unpriced.length) {
      errors.push(`No price on: ${unpriced.join(", ")} — type one on the line, or set it on the item.`);
    }
    /*  POS-R15 — haggling is allowed, going under the floor is not  */
    const under = lines
      .filter((l) => l.product.floorPricePaisa !== null && l.unitPaisa < l.product.floorPricePaisa)
      .map((l) => `${l.product.name} (min ${formatTaka(l.product.floorPricePaisa!)})`);
    if (under.length) errors.push(`Under the minimum: ${under.join(", ")}.`);
  }

  function resetSale() {
    setLines([]);
    setCustName("");
    setCustPhone("");
    setSelectedCust(null);
    setCustNew(false);
    setCustOpen(false);
    setCustQ("");
    setIsGift(false);
    setDiscountTaka(0);
    setApproved(false);
    setAdjustmentTaka(0);
    setAdjustmentNote("");
    setTaxRate(0);
    // one payment line always exists, so the panel is never an empty box
    setPays([{ id: `pay-${Date.now()}`, method: "Cash", amountPaisa: 0 }]);
  }

  function holdSale() {
    if (lines.length === 0) return;
    setHeld((h) => [
      ...h,
      { id: `H-${Date.now()}`, label: custName.trim() || `Walk-in #${h.length + 1}`, lines, customerName: custName, customerPhone: custPhone, isGift, discountTaka, adjustmentTaka, adjustmentNote, taxRate, at: Date.now() },
    ]);
    resetSale();
  }
  function resumeSale(hc: HeldCart) {
    setLines(hc.lines);
    setCustName(hc.customerName);
    setCustPhone(hc.customerPhone);
    setCustNew(!!hc.customerName.trim());
    setIsGift(hc.isGift);
    setDiscountTaka(hc.discountTaka);
    setAdjustmentTaka(hc.adjustmentTaka);
    setAdjustmentNote(hc.adjustmentNote);
    setTaxRate(hc.taxRate);
    // a resumed cart starts with one payment line again, not whatever was half-typed
    setPays([{ id: `pay-${Date.now()}`, method: "Cash", amountPaisa: 0 }]);
    setHeld((h) => h.filter((x) => x.id !== hc.id));
    setShowHeld(false);
  }

  async function completeSale() {
    if (errors.length) return;
    setSaleErr(null);
    try {
      const sale = await posCreateSale({
        shiftId: shift?.id,
        registerId: shift?.registerId ?? undefined,
        customerId: selectedCust?.id,
        customerName: custName || undefined,
        customerPhone: custPhone || undefined,
        isGift,
        lines: lines.map((l) => ({ itemId: l.product.id, qty: l.qty, unitPaisa: l.unitPaisa })),
        discountPaisa,
        discountApprovedBy: overCap && approved ? "Manager (PIN)" : undefined,
        adjustmentPaisa,
        adjustmentNote: adjustmentNote || undefined,
        taxRateBps: Math.round(taxRate * 100),
        /*  the server still takes a word for this; it is derived now, never asked
            (DEC-POS-017 retired) — anything left unpaid makes it a partial sale  */
        payMode: duePaisa > 0 ? "partial" : "full",
        payments: pays
          .filter((p) => p.amountPaisa > 0)
          .map((p) => ({ method: p.method.toLowerCase() as "cash" | "bkash" | "nagad" | "card", amountPaisa: p.amountPaisa })),
      });
      setReceipt({ no: sale.orderNo, total: sale.totalPaisa, hideprice: isGift, due: sale.duePaisa });
      posCurrentShift().then(setShift).catch(() => {}); // refresh drawer cash
      resetSale();
    } catch (e) {
      setSaleErr(e instanceof Error ? e.message : "Could not complete the sale");
    }
  }

  function tryApprove() {
    if (pinInput === MANAGER_PIN) {
      setApproved(true);
      setShowPin(false);
      setPinInput("");
      setPinErr(false);
    } else {
      setPinErr(true);
    }
  }

  return (
    <div className="px-5 md:px-7 pt-5 pb-10 max-w-[1750px]">
      {/* top bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[22px] text-purple m-0 leading-tight">POS — Counter</h1>
          <p className="text-body-soft text-[12.5px] m-0">Walk-in sell screen · completes as an Order (channel = POS)</p>
        </div>
        <div className={"flex items-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-medium border " + (shiftOpen ? "bg-[#e9f9ef] border-[#c2ecd3] text-[#0e7a3d]" : "bg-lavender border-lavender-deep text-body-soft")}>
          <Icon name="clock" size={15} />
          {shift ? <>Shift open · {shift.cashierName} (float {formatTaka(openingFloatPaisa)})</> : <>Shift closed</>}
          {!shift && <button type="button" onClick={openShift} className="ml-1 underline decoration-dotted">Open</button>}
        </div>
        <button type="button" onClick={() => setShowHeld(true)} className="flex items-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-medium bg-white border border-lavender-deep text-purple hover:border-orchid-mid">
          <Icon name="clock" size={15} /> Held bills
          <span className="bg-orchid-soft text-purple rounded-full px-2 py-0.5 text-[11px]">{held.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
        {/* ============ LEFT: catalogue ============ */}
        <div className="min-w-0">
          <div className={cardCls + " p-4 mb-4"}>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={17} /></span>
              <input className="ipt h-[44px] ipt-icon" placeholder="Search by name or code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {categories.map((c) => (
                <button key={c} type="button" onClick={() => setCat(c)} className={"text-[12.5px] px-3.5 py-1.5 rounded-full font-medium transition-colors border " + (cat === c ? "bg-purple text-white border-purple" : "bg-white text-body-soft border-lavender-deep hover:border-orchid-mid")}>{c}</button>
              ))}
              {/*  Tiles are fine for twenty things and useless for four hundred; rows
                   fit more on the screen and put stock, price and cost in columns you
                   can read down (owner, 20 Aug). The choice is remembered.  */}
              <div className="ml-auto inline-flex rounded-full overflow-hidden border" style={{ borderColor: "#e3d7ec" }}>
                {([["grid", "Tiles"], ["rows", "Rows"]] as const).map(([k, label], i) => (
                  <button key={k} type="button" onClick={() => setView(k)}
                    className="text-[12px] font-semibold px-3 py-1.5"
                    style={{
                      background: view === k ? "#470066" : "#fff",
                      color: view === k ? "#fff" : "#6b5878",
                      borderLeft: i ? "1px solid #e3d7ec" : undefined,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "rows" ? (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
              <div className="grid grid-cols-[44px_minmax(0,1fr)_110px_110px_120px_84px] gap-3 items-center px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "#470066" }}>
                <span /><span>Item</span><span>Category</span><span className="text-right">Stock</span><span className="text-right">Price</span><span />
              </div>
              <div className="divide-y divide-lavender-deep max-h-[62vh] overflow-y-auto">
                {grid.map((p) => (
                  <div key={p.id} className="grid grid-cols-[44px_minmax(0,1fr)_110px_110px_120px_84px] gap-3 items-center px-3.5 py-2">
                    <span className="w-[38px] h-[38px] rounded-[10px]"
                      style={{ background: p.imageUrl ? `url(${p.imageUrl}) center/cover no-repeat` : genBg(p.sku) }} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-purple truncate">{p.name}</span>
                      <span className="block font-mono text-[11.5px] text-body-soft truncate">{p.sku}</span>
                    </span>
                    <span className="text-[12.5px] text-body-soft truncate">{p.categoryName ?? "—"}</span>
                    <span className="text-right text-[12.5px]"
                      style={{ color: p.stockQty === null ? "#8b7a95" : p.stockQty > 0 ? "#0e7a3d" : "#c0392b" }}>
                      {p.stockQty === null ? "service" : p.stockQty > 0 ? p.stockQty : "out of stock"}
                    </span>
                    <span className="text-right">
                      <span className="block text-[13.5px] font-semibold text-body">
                        {p.pricePaisa === null ? "no price" : formatTaka(p.pricePaisa)}
                      </span>
                      {p.costPaisa !== undefined && p.costPaisa > 0 && (
                        <span className="block text-[11px] text-body-soft">cost {formatTaka(p.costPaisa)}</span>
                      )}
                    </span>
                    <button type="button" onClick={() => add(p)} disabled={!canAdd(p)}
                      title={!canAdd(p) ? "Nothing left on the shelf" : undefined}
                      className="justify-self-end text-white bg-purple inline-flex items-center gap-1 text-[12px] font-medium rounded-full px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Icon name="plus" size={12} /> Add
                    </button>
                  </div>
                ))}
                {grid.length === 0 && <div className="text-[13px] text-body-soft py-8 text-center">Nothing matches.</div>}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] auto-rows-fr gap-3">
            {grid.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} disabled={!canAdd(p)}
                title={!canAdd(p) ? "Nothing left on the shelf" : undefined}
                className="text-left bg-white border border-lavender-deep rounded-[14px] overflow-hidden shadow-soft hover:shadow-lift hover:border-orchid-mid transition-all active:scale-[0.98] flex flex-col h-full disabled:opacity-45 disabled:hover:shadow-soft disabled:cursor-not-allowed">
                <div className="h-[104px] w-full shrink-0" style={{ background: p.imageUrl ? `url(${p.imageUrl}) center/cover no-repeat` : genBg(p.sku) }} />
                <div className="p-2.5 flex flex-col flex-1">
                  <div className="text-[13px] font-medium text-purple leading-tight line-clamp-2 min-h-[34px]">{p.name}</div>
                  {/*  what is actually on the shelf — a till that hides a shortage makes
                       the cashier promise something the shop cannot hand over  */}
                  <div className="text-[11.5px] mt-0.5"
                    style={{ color: p.stockQty === null ? "#8b7a95" : p.stockQty > 0 ? "#0e7a3d" : "#c0392b" }}>
                    {p.stockQty === null ? "service" : p.stockQty > 0 ? `${p.stockQty} in stock` : "out of stock"}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-1.5">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-body">{p.pricePaisa === null ? "no price" : formatTaka(p.pricePaisa)}</span>
                      {/*  what it cost us — the cashier haggles against this (owner, 20 Aug).
                           DEC-ADM-012: absent entirely when this person may not see cost.  */}
                      {p.costPaisa !== undefined && p.costPaisa > 0 && (
                        <span className="block text-[11px] text-body-soft">cost {formatTaka(p.costPaisa)}</span>
                      )}
                    </span>
                    <span className="text-white bg-purple inline-flex items-center gap-0.5 text-[11.5px] font-medium rounded-full px-2 py-1 shrink-0"><Icon name="plus" size={12} /> Add</span>
                  </div>
                </div>
              </button>
            ))}
            {grid.length === 0 && <div className="col-span-full text-[13px] text-body-soft py-8 text-center">Nothing matches.</div>}
          </div>
          )}
        </div>

        {/* ============ RIGHT: cart — POS terminal (dark, Concept B) ============ */}
        <aside className="lg:sticky lg:top-4">
          {/*  The panel is capped to the screen so the money and the Complete
               button are ALWAYS in view; only the list of lines scrolls
               (owner, 20 Aug: "complete icon kkhonoi jen screen ar bahire na jay").  */}
          <div className="rounded-[16px] text-white shadow-lift flex flex-col overflow-hidden lg:max-h-[calc(100vh-2rem)]" style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }}>
            <div className="p-4 pb-2 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">Current sale</div>
                {lines.length > 0 && (
                  <button type="button" onClick={resetSale} className="text-[11px] text-[#e7d8f2] bg-white/10 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white/20" title="Clear this sale"><Icon name="trash" size={11} /> Clear</button>
                )}
              </div>
              <button type="button" onClick={() => setIsGift((g) => !g)} className={"text-[12px] px-3 py-1.5 rounded-full font-medium border inline-flex items-center gap-1.5 " + (isGift ? "bg-orchid text-white border-orchid" : "bg-white/10 text-[#e7d8f2] border-white/25")}>
                <Icon name="heart" size={13} /> {isGift ? "Gift" : "Mark gift"}
              </button>
            </div>

            {/*  Why the sale cannot go through, AT THE TOP. It used to sit under the
                 Complete button at the bottom of a tall panel, off the screen — the
                 owner filled a cart with a closed shift and saw nothing (20 Aug).  */}
            {errors.length > 0 && lines.length > 0 && (
              <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px]"
                style={{ background: "rgba(255,155,123,.14)", color: "#ffc9a8" }}>
                {errors[0]}
                {!shiftOpen && (
                  <button type="button" onClick={openShift} className="underline ml-1.5 font-semibold">Open the shift</button>
                )}
                {errors.length > 1 && <span className="opacity-70"> · +{errors.length - 1} more</span>}
              </div>
            )}

            <div className="mb-3">
              {selectedCust ? (
                <div className="flex items-center gap-2 flex-wrap bg-[#e6f4ec] border border-[#bfe3cd] rounded-[10px] px-3 py-2.5">
                  <Icon name="user" size={15} />
                  <span className="text-[12.5px] text-[#2e7d5b] min-w-0"><b className="font-medium">{selectedCust.name}</b> · {selectedCust.phone} · {selectedCust.ordersCount} orders · LTV {formatTaka(selectedCust.ltvPaisa)}</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <a href={`tel:${selectedCust.phone}`} className="inline-flex items-center gap-1.5 bg-white border border-[#bfe3cd] text-[#2e7d5b] text-[12px] px-3 py-1.5 rounded-[9px] font-medium hover:bg-[#dff0e6]"><Icon name="phone" size={13} /> Call</a>
                    <button type="button" onClick={clearCustomer} className="text-[12.5px] text-[#2e7d5b] underline">Change</button>
                  </div>
                </div>
              ) : custNew ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={"ipt h-[40px] " + (needsCustomer ? "border-[#e0a1a1] bg-[#fdf4f4]" : "")} placeholder={needsCustomer ? "Name required for due" : "New customer name"} value={custName} onChange={(e) => setCustName(e.target.value)} />
                    <input className={"ipt h-[40px] " + (needsCustomer ? "border-[#e0a1a1] bg-[#fdf4f4]" : "")} placeholder="Phone" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                  </div>
                  <button type="button" onClick={() => { setCustNew(false); setCustName(""); setCustPhone(""); }} className="text-[12px] text-[#c9a6e4] font-medium mt-1.5 inline-flex items-center gap-1"><Icon name="chevronLeft" size={12} /> Pick an existing customer instead</button>
                </>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setCustOpen((o) => !o)} className={"h-[42px] w-full flex items-center justify-between text-left rounded-[10px] px-3 border " + (needsCustomer ? "bg-[#fdf4f4] border-[#e0a1a1] text-[#b45309]" : "bg-white/10 border-white/25 text-[#e7d8f2]")}>
                    <span className="inline-flex items-center gap-1.5 text-[12.5px]"><Icon name="user" size={15} /> {needsCustomer ? "Choose customer (required for due)" : "Walk-in — search customer (optional)"}</span>
                    <Icon name="chevronDown" size={16} />
                  </button>
                  {custOpen && (
                    <>
                      <div className="fixed inset-0 z-30" {...backdropClose(() => setCustOpen(false))} />
                      <div className="absolute z-40 mt-1 left-0 right-0 bg-white border border-lavender-deep rounded-[12px] shadow-lift overflow-hidden">
                        <div className="p-2 border-b border-lavender-deep">
                          <input autoFocus className="ipt h-[38px]" placeholder="Search name or phone…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                        </div>
                        <div className="max-h-[240px] overflow-auto">
                          {custList.slice(0, 40).map((c) => (
                            <div key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-lavender/60 border-b border-lavender-deep last:border-0">
                              <button type="button" onClick={() => pickCustomer(c)} className="text-left min-w-0 flex-1">
                                <div className="text-[13px] text-purple font-medium truncate">{c.name} <span className="text-body-soft font-normal">({c.phone})</span></div>
                                <div className="text-[12px] text-body-soft">{c.ordersCount} orders · LTV {formatTaka(c.ltvPaisa)}</div>
                              </button>
                              <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="shrink-0 inline-flex items-center gap-1 text-[12px] text-purple border border-lavender-deep rounded-[8px] px-2.5 py-1.5 hover:border-orchid-mid"><Icon name="phone" size={13} /> Call</a>
                            </div>
                          ))}
                          {custList.length === 0 && <div className="px-3 py-3 text-[13px] text-body-soft">No customer matches “{custQ}”.</div>}
                        </div>
                        <button type="button" onClick={() => { setCustNew(true); setCustOpen(false); setCustQ(""); }} className="w-full text-left px-3 py-2.5 border-t border-lavender-deep text-purple font-medium text-[13px] inline-flex items-center gap-1.5 hover:bg-lavender/60"><Icon name="plus" size={14} /> Create new customer</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            </div>

            <div className="px-4 flex-1 overflow-auto" style={{ minHeight: 130 }}>
            {/* lines */}
            {lines.length === 0 ? (
              <div className="h-full grid place-items-center">
                <div className="border border-dashed border-white/20 rounded-[12px] py-8 px-6 text-center text-[13px] text-[#c9a6e4]">Tap an item to add it here.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {lines.map((l) => (
                  /*  One line, two rows: WHAT it is on top, WHAT IT COSTS THE CUSTOMER
                      underneath. The old single row had the price box, the word "each",
                      the cost note, the stepper and the total all fighting for the same
                      strip and none of them readable (owner, 20 Aug).  */
                  <div key={l.key} className="rounded-[12px] px-2.5 py-2" style={{ background: "rgba(255,255,255,.06)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-[34px] h-[34px] rounded-[9px] shrink-0"
                        style={{ background: l.product.imageUrl ? `url(${l.product.imageUrl}) center/cover no-repeat` : genBg(l.product.sku) }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[#f0e3fa] truncate">{l.product.name}</div>
                        {l.product.costPaisa !== undefined && l.product.costPaisa > 0 && (
                          <div className="text-[11px] text-[#a98ac4]">cost {formatTaka(l.product.costPaisa)}</div>
                        )}
                      </div>
                      <div className="text-[13.5px] font-semibold shrink-0">{formatTaka(l.unitPaisa * l.qty)}</div>
                      <button type="button" onClick={() => remove(l.key)}
                        className="text-[#c9a6e4] hover:text-[#ff9b9b] shrink-0" title="Remove">
                        <Icon name="trash" size={15} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      {/*  POS-R15 — the price is the cashier's to change; the floor is the wall  */}
                      <span className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#c9a6e4]">৳</span>
                        <input type="number" min={0}
                          className="bg-white/10 border border-white/20 rounded-[8px] h-[30px] w-[92px] pl-5 pr-2 text-[12.5px] text-white"
                          value={l.unitPaisa ? Math.round(l.unitPaisa / 100) : ""}
                          placeholder={String(Math.round((l.product.pricePaisa ?? 0) / 100))}
                          onChange={(e) => setUnit(l.key, Number(e.target.value) * 100)} />
                      </span>
                      <span className="text-[12px] text-[#c9a6e4]">×</span>
                      <div className="flex items-center border border-white/25 rounded-[8px] overflow-hidden">
                        <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="w-[26px] h-[30px] text-[#e7d8f2] hover:bg-white/10">–</button>
                        <span className="w-[30px] text-center text-[13px] font-medium">{l.qty}</span>
                        <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="w-[26px] h-[30px] text-[#e7d8f2] hover:bg-white/10">+</button>
                      </div>
                      {l.product.stockQty !== null && (
                        <span className="text-[11px] text-[#a98ac4] ml-auto">{l.product.stockQty} in stock</span>
                      )}
                    </div>

                    {l.product.floorPricePaisa != null && l.unitPaisa < l.product.floorPricePaisa && (
                      <div className="text-[11px] text-[#ff9b9b] mt-1.5">
                        Cannot go under {formatTaka(l.product.floorPricePaisa)} — that is this item's minimum.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/*  PAYMENT — rebuilt again 20 Aug on the owner's second look:
                 "full ar partial uthaia daw… jokhon full payment krbe na tokhonei
                 atkaia dibe customer name number ar jonno."

                 So there is no mode to choose any more. Money is taken, one method
                 at a time, as many as the customer wants to use. Whatever is left
                 unpaid IS the due, and a due is the thing that needs a name and a
                 number — asked for exactly then, and never otherwise.  */}
            <div className="border-t border-white/15 mt-3 pt-3">
              {/*  Money on the left in a box big enough to read across a counter;
                   the two things that BEND the money — discount and adjustment —
                   standing right beside it, not buried above the cart
                   (owner, 20 Aug: "ammount lekhar ghor ta clean and boro howa lagbe.
                   discount and adjustment agula ammount ar ghorer pasei thakbe").  */}
              <div className="flex gap-2.5 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">Taking now</span>
                    {duePaisa > 0 && paid > 0 && (
                      <button type="button" onClick={() => setPayAmt(pays[pays.length - 1].id, pays[pays.length - 1].amountPaisa + duePaisa)}
                        className="text-[11.5px] text-[#c9a6e4] underline hover:text-white">
                        take the rest ({formatTaka(duePaisa)})
                      </button>
                    )}
                  </div>

                  {/*  method on a small line of its own, the amount on a full-width
                       line under it — a number never gets squeezed by the dropdown
                       beside it, however narrow the panel gets.  */}
                  <div className="flex flex-col gap-2">
                    {pays.map((r) => (
                      <div key={r.id}
                        className="rounded-[12px] border border-white/25 bg-white/10 px-2.5 pt-1.5 pb-1 focus-within:border-white/60">
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-transparent border-0 text-[12px] text-[#c9a6e4] outline-none cursor-pointer px-0 py-0"
                            value={r.method}
                            onChange={(e) => setPayMethodOf(r.id, e.target.value as PayMethod)}>
                            {PAY_METHODS.map((m) => <option key={m} value={m} className="text-purple">{m}</option>)}
                          </select>
                          {pays.length > 1 && (
                            <button type="button" onClick={() => removePay(r.id)}
                              className="ml-auto text-[#c9a6e4] hover:text-[#ff9b9b]" title="Remove this payment">
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[18px] text-[#c9a6e4] shrink-0">৳</span>
                          <input type="number" min={0} inputMode="numeric"
                            className="flex-1 min-w-0 w-full h-[42px] bg-transparent border-0 outline-none p-0 text-[26px] font-semibold font-display text-white placeholder:text-white/25"
                            value={r.amountPaisa ? Math.round(r.amountPaisa / 100) : ""} placeholder="0"
                            onChange={(e) => setPayAmt(r.id, Number(e.target.value) * 100)} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/*  Three methods is already more than a counter ever needs, and an
                       empty extra line is worse than none — the owner pressed this
                       seven times and got seven zero lines (20 Aug).  */}
                  {pays.length < MAX_PAYS && (
                    <button type="button"
                      onClick={() => setPays((p) => [...p, { id: `pay-${Date.now()}`, method: "Cash", amountPaisa: 0 }])}
                      className="mt-2 w-full text-[12px] font-medium py-1.5 rounded-[10px] border border-dashed border-white/25 text-[#e7d8f2] hover:bg-white/10 inline-flex items-center justify-center gap-1.5">
                      <Icon name="plus" size={13} /> Pay part of it another way
                    </button>
                  )}
                </div>

                <div className="w-[118px] shrink-0">
                  <label className="block text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium mb-1">Discount ৳</label>
                  <input type="number" min={0} className="ipt h-[34px] text-[13px]" value={discountTaka || ""} placeholder="0"
                    onChange={(e) => setDiscountTaka(Math.max(0, Number(e.target.value)))} />

                  <label className="block text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium mb-1 mt-2">Adjust ৳ ±</label>
                  <input type="number" className="ipt h-[34px] text-[13px]" value={adjustmentTaka || ""} placeholder="0"
                    onChange={(e) => setAdjustmentTaka(Number(e.target.value))} />

                  <label className="block text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium mb-1 mt-2">VAT</label>
                  <select className="ipt h-[32px] text-[12px]" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
                    {TAX_RATES.map((t) => (<option key={t.label} value={t.value}>{t.label}</option>))}
                  </select>
                </div>
              </div>

              {adjustmentPaisa !== 0 && (
                <input className="ipt h-[32px] text-[12.5px] mt-2" placeholder="Why the adjustment? (round-off, extra ribbon…)"
                  value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} />
              )}

              {needsApproval && (
                <button type="button" onClick={() => { setShowPin(true); setPinErr(false); setPinInput(""); }}
                  className="mt-2 w-full text-[12px] py-2 rounded-[10px] font-medium bg-[#fff4e5] border border-[#f0c27a] text-[#b45309] inline-flex items-center justify-center gap-1.5">
                  <Icon name="shield" size={13} /> {discountPct.toFixed(0)}% discount — manager approval needed
                </button>
              )}
              {overCap && approved && (
                <div className="mt-2 text-[12px] text-[#7fe0a8] font-medium inline-flex items-center gap-1"><Icon name="check" size={13} /> Discount approved</div>
              )}

            </div>

            </div>

            {/*  THE PINNED FOOT — only three things live here: what the bill is,
                 where the money stands, and the button. Everything that can grow
                 (lines, payment rows) scrolls above it, so no amount of anything
                 can push Complete off the screen.  */}
            <div className="p-4 pt-3 border-t border-white/15 shrink-0">
              <div className="flex items-end justify-between gap-3">
                <div className="text-[11.5px] text-[#a98ac4] leading-[1.6] min-w-0">
                  <div>Subtotal {formatTaka(subtotal)}</div>
                  {discountPaisa > 0 && <div className="text-[#7fe0a8]">Discount − {formatTaka(discountPaisa)} · {discountPct.toFixed(0)}%</div>}
                  {adjustmentPaisa !== 0 && <div>Adjustment {adjustmentPaisa < 0 ? "− " : "+ "}{formatTaka(Math.abs(adjustmentPaisa))}</div>}
                  {vatPaisa > 0 && <div>VAT {taxRate}% + {formatTaka(vatPaisa)}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">Total</div>
                  <div className="text-white font-semibold text-[27px] font-display leading-[1.1]">{formatTaka(total)}</div>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12.5px] mt-2 pt-2 border-t border-white/10">
                <span className="text-[#c9a6e4]">Paid <b className="text-white font-medium">{formatTaka(paid)}</b></span>
                {duePaisa > 0 && <span className="text-[#f0b46a] font-medium">Due {formatTaka(duePaisa)}</span>}
                {changePaisa > 0 && <span className="text-[#7fe0a8] font-medium">Change {formatTaka(changePaisa)}</span>}
                {overpaidNoChange && <span className="text-[#f0b46a] font-medium">Digital overpay — reduce {formatTaka(paid - total)}</span>}
              </div>

              {needsCustomer && (
                <div className="mt-2 rounded-[10px] bg-[#fff4e5] border border-[#f0c27a] text-[#b45309] text-[12px] px-3 py-2 flex items-start gap-1.5">
                  <Icon name="user" size={14} />
                  <span>{formatTaka(duePaisa)} stays unpaid — add a <b className="font-semibold">customer name or phone</b> above.</span>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button type="button" onClick={holdSale} disabled={lines.length === 0} className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 hover:bg-white/20 disabled:opacity-40">Hold</button>
                <button type="button" onClick={completeSale} disabled={errors.length > 0} className="flex-1 bg-white hover:bg-[#f4ecf9] text-purple text-[15px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 shadow-soft disabled:opacity-40"><Icon name="check" size={17} /> {errors.length ? errors[0].replace(/\.$/, "") : `Complete${total > 0 ? " · " + formatTaka(total) : " sale"}`}</button>
              </div>
              {saleErr && <div className="mt-2 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{saleErr}</div>}
            </div>
          </div>
        </aside>
      </div>

      {/* ===== manager PIN popup (DEC-POS-006) ===== */}
      {showPin && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(() => setShowPin(false))}>
          <div className="bg-white rounded-[18px] shadow-lift p-6 w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1"><Icon name="shield" size={18} /><h3 className="font-display text-[18px] text-purple m-0">Manager approval</h3></div>
            <p className="text-[12.5px] text-body-soft mb-3">Discount is {discountPct.toFixed(0)}% — above the {cap}% limit for this cart. Enter manager PIN to allow. <span className="opacity-60">(demo PIN 1234)</span></p>
            <input type="password" className={"ipt h-[44px] text-center tracking-[0.3em] " + (pinErr ? "border-[#c0392b]" : "")} placeholder="••••" value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinErr(false); }} onKeyDown={(e) => e.key === "Enter" && tryApprove()} autoFocus />
            {pinErr && <p className="text-[12px] text-[#c0392b] mt-1.5 mb-0">Wrong PIN.</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setShowPin(false)} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-body-soft font-medium text-[13px]">Cancel</button>
              <button type="button" onClick={tryApprove} className="flex-1 py-2.5 rounded-[11px] bg-purple text-white font-medium text-[13px]">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== held bills drawer ===== */}
      {showHeld && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" {...backdropClose(() => setShowHeld(false))}>
          <div className="bg-white w-full max-w-[380px] h-full p-5 overflow-auto shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-display text-[18px] text-purple m-0">Held bills ({held.length})</h3><button type="button" onClick={() => setShowHeld(false)} className="text-body-soft text-[20px] leading-none">×</button></div>
            {held.length === 0 ? (
              <p className="text-[13px] text-body-soft">No held bills. Use “Hold” to park a cart and serve someone else.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {held.map((hc) => {
                  const t = hc.lines.reduce((s, l) => s + l.unitPaisa * l.qty, 0);
                  return (
                    <button key={hc.id} type="button" onClick={() => resumeSale(hc)} className="text-left border border-lavender-deep rounded-[12px] p-3 hover:border-orchid-mid bg-lavender/40">
                      <div className="flex items-center justify-between"><span className="text-[13.5px] font-medium text-purple">{hc.label}</span><span className="text-[13px] font-medium">{formatTaka(t)}</span></div>
                      <div className="text-[12px] text-body-soft mt-0.5">{hc.lines.reduce((n, l) => n + l.qty, 0)} item(s){hc.isGift ? " · gift" : ""} · tap to resume</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== receipt preview (DEC-POS-012) ===== */}
      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(() => setReceipt(null))}>
          <div className="bg-white rounded-[18px] shadow-lift p-6 w-full max-w-[340px] text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-[46px] h-[46px] rounded-full bg-[#e9f9ef] grid place-items-center mx-auto mb-3 text-[#0e7a3d]"><Icon name="check" size={24} /></div>
            <h3 className="font-display text-[19px] text-purple m-0">Sale complete</h3>
            <p className="text-[12.5px] text-body-soft mt-1 mb-4">Receipt {receipt.no} · saved as an Order (channel = POS)</p>
            <div className="border border-dashed border-lavender-deep rounded-[12px] p-3 text-left text-[12.5px] mb-4">
              <div className="flex justify-between"><span className="text-body-soft">Receipt</span><span>{receipt.no}</span></div>
              <div className="flex justify-between"><span className="text-body-soft">Amount</span><span>{receipt.hideprice ? "— (gift, hidden)" : formatTaka(receipt.total)}</span></div>
              {receipt.due > 0 && <div className="flex justify-between"><span className="text-[#b45309]">Due</span><span className="text-[#b45309]">{formatTaka(receipt.due)}</span></div>}
            </div>
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-medium text-[13px] inline-flex items-center justify-center gap-1.5"><Icon name="hash" size={14} /> Print{receipt.hideprice ? " (no price)" : ""}</button>
              <button type="button" onClick={() => setReceipt(null)} className="flex-1 py-2.5 rounded-[11px] bg-purple text-white font-medium text-[13px]">New sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { backdropClose } from "./backdropClose";
import Icon from "./Icon";
import { posCatalogue, listCustomers, listChannels, formatTaka, genBg, posCurrentShift, posOpenShift, posCreateSale, type ApiPosCatalogueRow, type ApiCustomer, type ApiPosShift, type ApiChannel, type ApiMe, type ApiAppUser, meCached, listAppUsers, posSettings } from "../_data/api";
import { MoneyBlock, MoneyResult, PaymentLines, TakaInput, computeMoney, chargeNote, usePayRows, usePaymentMethods, TILL_TENDERS, type ChargeRow, type DiscountMode } from "./MoneyBlock";
import QtyStepper from "./QtyStepper";
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
  /**
   * DEC-POS-024 — the unit this line is sold in: the item's own unit or its
   * direct base, the same two the purchase bill offers (DEC-PUR-013). Price,
   * qty, floor and the stock cap all read in THIS unit.
   */
  unitId: string | null;
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
  charges: ChargeRow[];
  taxRate: number;
  at: number;
}

export default function PosSellView() {
  const router = useRouter();
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
  /*  P7-6 — until the answer arrives, the till must not claim the counter is
      closed. It used to paint "Shift closed · Open" for the first moment of
      every load, and pressing that button while a drawer was already open is
      how a second shift gets created.  */
  const [shiftKnown, setShiftKnown] = useState(false);
  const [saleErr, setSaleErr] = useState<string | null>(null);
  useEffect(() => { posCurrentShift().then(setShift).catch(() => {}).finally(() => setShiftKnown(true)); }, []);

  /*  DEC-GBL-001 (was DEC-POS-021, POS-only) — the counter offers what the SHOP
      takes, from the one list every money screen reads.  */
  const methods = usePaymentMethods(TILL_TENDERS);
  const shiftOpen = !!shift;
  const openingFloatPaisa = shift?.openingFloatPaisa ?? 0;
  /*  P7-11 (31 Aug) — the drawer used to open with a hardcoded ৳2,000 under the
      name "Cashier", whatever the shop had set and whoever was signed in. Both
      are facts about money: the float is what somebody physically put in the
      till, and the name is who answers for it at close. A fiction in either one
      turns up later as an over/short nobody can explain (house rule 7 — no
      business value lives in code).  */
  const [openAsk, setOpenAsk] = useState<{ floatTaka: string; cashier: string } | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  async function askOpenShift() {
    setSaleErr(null);
    let deflt = 0;
    try { deflt = (await posSettings()).openingFloatDefaultPaisa ?? 0; } catch { /* the field starts empty */ }
    setOpenAsk({ floatTaka: deflt ? String(deflt / 100) : "", cashier: me?.name ?? "" });
  }
  async function openShift() {
    if (!openAsk) return;
    if (!openAsk.cashier.trim()) { setSaleErr("Who is on the counter?"); return; }
    setOpenBusy(true);
    setSaleErr(null);
    try {
      const s = await posOpenShift({
        cashierName: openAsk.cashier.trim(),
        openingFloatPaisa: Math.round((Number(openAsk.floatTaka) || 0) * 100),
      });
      setShift(s);
      setOpenAsk(null);
    } catch (e) {
      setSaleErr(e instanceof Error ? e.message : "Could not open shift");
    } finally {
      setOpenBusy(false);
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
  /** the shelf opens on top of the bill, the way a purchase picks its items */
  const [pickerOpen, setPickerOpen] = useState(false);

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
  /*  DEC-POS-024 — how many of the item's OWN unit one line-unit weighs, as a
      divisor: 1 in the item's unit, baseQty when selling by the base.  */
  const factorOf = (l: { product: ApiPosCatalogueRow; unitId: string | null }) =>
    l.unitId && l.product.baseUnitId && l.unitId === l.product.baseUnitId ? (l.product.baseQty ?? 1) : 1;
  /** stock cap in the line's OWN unit (base units get factor x as many) */
  const capOf = (l: { product: ApiPosCatalogueRow; unitId: string | null }) =>
    l.product.stockQty === null ? null : Math.max(0, l.product.stockQty) * factorOf(l);

  /** what the cart already holds of this item, in the ITEM's own unit (milli) —
      a line sold by the base only weighs its fraction (DEC-POS-024) */
  const inCartMilli = (id: string) =>
    lines
      .filter((l) => l.product.id === id)
      .reduce((n, l) => n + Math.round((l.qty * 1000) / factorOf(l)), 0);
  const inCart = (id: string) => Math.round(inCartMilli(id) / 1000);
  /** POS-R14 — the counter cannot sell what is not on the shelf */
  const canAdd = (p: ApiPosCatalogueRow, extra = 1) =>
    p.stockQty === null || inCartMilli(p.id) + extra * 1000 <= p.stockQty * 1000;

  const add = (p: ApiPosCatalogueRow) =>
    setLines((ls) => {
      const hit = ls.find((l) => l.product.id === p.id);
      if (hit) {
        if (!canAdd(p)) return ls;
        return ls.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (!canAdd(p)) return ls;
      return [...ls, { key: `${p.id}-${Date.now()}`, product: p, qty: 1, unitPaisa: p.pricePaisa ?? 0, unitId: p.unitId }];
    });
  /*  From the picker, the item is known by product, not by line key — and 0
      means "take it off the bill" so a mis-tap can be undone where it
      happened (owner, 26 Aug: the picker tile had only an Add chip).  */
  const setQtyOfProduct = (id: string, qty: number) =>
    setLines((ls) => (qty <= 0
      ? ls.filter((l) => l.product.id !== id)
      : ls.map((l) => {
          if (l.product.id !== id) return l;
          const shelf = capOf(l); // in the line's own unit (DEC-POS-024)
          return { ...l, qty: shelf === null ? qty : Math.min(qty, shelf) };
        })));

  const setQty = (key: string, qty: number) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const want = Math.max(1, qty);
        // never past the shelf, measured in the line's own unit (a service is never capped)
        const shelf = capOf(l);
        return { ...l, qty: shelf === null ? want : Math.min(want, Math.max(1, shelf)) };
      }),
    );
  /*  switching the unit rescales the price the same way the shop would say it:
      per stick <-> per pice by the exact factor. The cashier can still type
      any price after (POS-R15); the floor check follows the chosen unit.  */
  const setLineUnit = (key: string, unitId: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key || l.unitId === unitId) return l;
        const from = factorOf(l);
        const to = factorOf({ ...l, unitId });
        const unitPaisa = Math.round((l.unitPaisa * from) / to);
        const shelf = capOf({ ...l, unitId });
        return { ...l, unitId, unitPaisa, qty: shelf === null ? l.qty : Math.min(l.qty, Math.max(1, shelf)) };
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

  /*  DEC-POS-020 (owner, 21 Aug) — a bill says when it was written, who wrote it
      and anything the shop wants remembered about it.  */
  const today = new Date().toISOString().slice(0, 10);
  const [saleDate, setSaleDate] = useState(today);
  const [note, setNote] = useState("");
  /*  DEC-POS-022 — ordered today, taken later. The goods stay on the shelf and
      whatever is paid today is an advance; the rest waits on the due board.  */
  const [advanceFor, setAdvanceFor] = useState("");
  const [me, setMe] = useState<ApiMe | null>(null);
  const [staff, setStaff] = useState<ApiAppUser[]>([]);
  const [soldBy, setSoldBy] = useState("");
  /** only an owner or a manager may put another name on the bill */
  const mayChangeSeller = me?.role === "OWNER" || me?.role === "MANAGER";
  useEffect(() => {
    meCached()
      .then((u) => { setMe(u); setSoldBy((cur) => cur || u.name); })
      .catch(() => {});
    listAppUsers().then((u) => setStaff(u.filter((x) => x.isActive !== false))).catch(() => setStaff([]));
  }, []);

  /*  DEC-POS-019 (owner, 21 Aug) — the counter is not only walk-ins. The same
      staff sells over Facebook, WhatsApp and the phone and the money lands in the
      same drawer, so the sale says which channel brought it in.  */
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  useEffect(() => {
    listChannels()
      .then((r) => {
        const live = r.filter((c) => c.isActive);
        setChannels(live);
        setChannelId((cur) => cur || live.find((c) => c.slug === "pos")?.id || live[0]?.id || "");
      })
      .catch(() => setChannels([]));
  }, []);

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

  // ---- the four things that bend a bill (MoneyBlock owns the shapes) ----
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amt");
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [adjSign, setAdjSign] = useState<1 | -1>(1);
  const [adjustmentTaka, setAdjustmentTaka] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);

  const [approved, setApproved] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinErr, setPinErr] = useState(false);

  // ---- held carts ----
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  // ---- receipt ----
  const [receipt, setReceipt] = useState<null | { no: string; total: number; hideprice: boolean; due: number }>(null);

  // ---- money (DEC-POS-015/016) ----
  const subtotal = lines.reduce((s, l) => s + l.unitPaisa * l.qty, 0);
  /** POS-R16 — how much of this bill is being sold for less than it cost */
  const underCostPaisa = lines.reduce((s, l) => {
    /*  DEC-POS-024 — cost per the line's CHOSEN unit: a pice of a 4-pice stick
        costs a quarter of the stick, not the whole stick  */
    const f = factorOf(l);
    const cost = Math.round((l.product.costPaisa ?? 0) / f);
    return cost > 0 && l.unitPaisa > 0 && l.unitPaisa < cost ? s + (cost - l.unitPaisa) * l.qty : s;
  }, 0);
  const moneyIn = { subtotalPaisa: subtotal, discountMode, discountInput, charges, adjSign, adjustmentTaka, taxRate };
  const sum = computeMoney(moneyIn);
  const { discountPaisa, vatPaisa, discountPct } = sum;
  const adjustmentPaisa = sum.extraPaisa; // charges + adjustment — one number for the order
  const total = sum.totalPaisa;

  /*  DEC-POS-017 retired (owner, 20 Aug): there is no Full/Partial choice. Money
      is taken as many ways as the customer likes; whatever is left is the due.  */
  const pay = usePayRows(total, methods[0]?.id ?? "CASH");
  const { paidPaisa: paid, duePaisa, changePaisa, overpaidNoChange } = pay;

  /*  The cap lives on the server and it refuses in words; the screen no longer
      guesses one. Approval is still asked for when a line goes under its floor.  */
  const cap = 100;
  const overCap = false;
  const needsApproval = false;

  useEffect(() => {
    if (!overCap && approved) setApproved(false);
  }, [overCap, approved]);

  // due (partial or full-credit) must be tied to a known customer — DEC-POS-008
  /*  A due is money owed by a person, so it needs a person (DEC-POS-008). This is
      the ONLY thing that asks for a name — a fully paid walk-in never does.  */
  const needsCustomer = duePaisa > 0 && !custName.trim() && !custPhone.trim();

  const errors: string[] = [];
  if (!shiftKnown) errors.push("Checking the counter…");
  else if (!shiftOpen) errors.push("Open a shift to start selling.");
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
    setDiscountInput(0);
    setDiscountMode("amt");
    setApproved(false);
    setCharges([]);
    setNote("");
    setAdvanceFor("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setAdjSign(1);
    setAdjustmentTaka(0);
    setTaxRate(0);
    // one payment line always exists, so the panel is never an empty box
    pay.reset();
  }

  function holdSale() {
    if (lines.length === 0) return;
    setHeld((h) => [
      ...h,
      { id: `H-${Date.now()}`, label: custName.trim() || `Walk-in #${h.length + 1}`, lines, customerName: custName, customerPhone: custPhone, isGift, discountTaka: Math.round(discountPaisa / 100), adjustmentTaka: Math.round(sum.adjustmentPaisa / 100), charges, taxRate, at: Date.now() },
    ]);
    resetSale();
  }
  function resumeSale(hc: HeldCart) {
    setLines(hc.lines);
    setCustName(hc.customerName);
    setCustPhone(hc.customerPhone);
    setCustNew(!!hc.customerName.trim());
    setIsGift(hc.isGift);
    setDiscountMode("amt");
    setDiscountInput(hc.discountTaka);
    setAdjSign(hc.adjustmentTaka < 0 ? -1 : 1);
    setAdjustmentTaka(Math.abs(hc.adjustmentTaka));
    setCharges(hc.charges ?? []);
    setTaxRate(hc.taxRate);
    // a resumed cart starts with one payment line again, not whatever was half-typed
    pay.reset();
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
        channelId: channelId || undefined,
        /*  today means this moment; an older day is stamped at noon so a
            timezone cannot drag it into the day before or after (21 Aug: noon
            on today's date read as the future to a server an hour behind).  */
        saleDate: !saleDate || saleDate === new Date().toISOString().slice(0, 10)
          ? undefined
          : new Date(`${saleDate}T12:00:00`).toISOString(),
        salespersonName: soldBy || undefined,
        note: note.trim() || undefined,
        advance: advanceFor ? { promisedFor: new Date(`${advanceFor}T12:00:00`).toISOString() } : undefined,
        lines: lines.map((l) => ({ itemId: l.product.id, qty: l.qty, unitPaisa: l.unitPaisa, unitId: l.unitId ?? undefined })),
        discountPaisa,
        discountApprovedBy: overCap && approved ? "Manager (PIN)" : undefined,
        adjustmentPaisa,
        adjustmentNote: chargeNote(charges, sum.adjustmentPaisa) || undefined,
        taxRateBps: Math.round(taxRate * 100),
        /*  the server still takes a word for this; it is derived now, never asked
            (DEC-POS-017 retired) — anything left unpaid makes it a partial sale  */
        payMode: duePaisa > 0 ? "partial" : "full",
        payments: pay.pays
          .filter((p) => p.amountPaisa > 0)
          .map((p) => ({
            method: p.method.toLowerCase() as "cash" | "bkash" | "nagad" | "card",
            amountPaisa: p.amountPaisa,
            accountId: p.accountId, // DEC-GBL-006
          })),
      });
      /*  DEC-POS-023 (owner, 21 Aug) — a finished sale opens as a bill, the same
          page a purchase gets. The receipt strip stays for the gift case, where
          the point is a price-free slip, not a record.  */
      resetSale();
      posCurrentShift().then(setShift).catch(() => {});
      router.push(`/pos/sale/${sale.id}`);
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
          {shift ? <>Shift open · {shift.cashierName} (float {formatTaka(openingFloatPaisa)})</> : shiftKnown ? <>Shift closed</> : <>Checking the counter…</>}
          {shiftKnown && !shift && <button type="button" onClick={askOpenShift} className="ml-1 underline decoration-dotted font-bold">Open</button>}
        </div>
        <button type="button" onClick={() => setShowHeld(true)} className="flex items-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-medium bg-white border border-lavender-deep text-purple hover:border-orchid-mid">
          <Icon name="clock" size={15} /> Held bills
          <span className="bg-orchid-soft text-purple rounded-full px-2 py-0.5 text-[11px]">{held.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
        {/* ============ LEFT: this bill ============ */}
        <div className="space-y-5">
        {/*  THE BILL'S HEAD — what a bill says about itself before it says what is
             on it: its number, its date, and which channel brought the sale in
             (DEC-POS-019, owner 21 Aug). The receipt number is the server's to
             give, so it is shown as what it is until the sale is saved.  */}
        <div className={cardCls + " p-4"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Bill no</label>
              <div className="ipt flex items-center text-body-soft" style={{ background: "#f6f2fa" }}>Auto — on save</div>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className="ipt" value={saleDate} max={today}
                onChange={(e) => setSaleDate(e.target.value || today)} />
            </div>
            <div>
              <label className={labelCls}>Sales channel</label>
              <select className="ipt" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {channels.length === 0 && <option value="">Counter</option>}
                {channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sold by</label>
              {mayChangeSeller ? (
                <select className="ipt" value={soldBy} onChange={(e) => setSoldBy(e.target.value)}>
                  {me && !staff.some((u) => u.name === me.name) && <option value={me.name}>{me.name}</option>}
                  {staff.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                </select>
              ) : (
                <div className="ipt flex items-center text-body-soft" style={{ background: "#f6f2fa" }}>{soldBy || "—"}</div>
              )}
            </div>
          </div>

          {/*  the customer belongs on the bill, next to its date and its seller —
               not in the money panel (owner, 21 Aug)  */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 mt-3">
            <div>
              <label className={labelCls}>Customer</label>
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
                  <button type="button" onClick={() => { setCustNew(false); setCustName(""); setCustPhone(""); }} className="text-[12px] text-purple font-medium mt-1.5 inline-flex items-center gap-1"><Icon name="chevronLeft" size={12} /> Pick an existing customer instead</button>
                </>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setCustOpen((o) => !o)} className={"h-[42px] w-full flex items-center justify-between text-left rounded-[10px] px-3 border " + (needsCustomer ? "bg-[#fdf4f4] border-[#e0a1a1] text-[#b45309]" : "bg-white border-lavender-deep text-body")}>
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
            <div>
              <label className={labelCls}>Note</label>
              <input className="ipt" placeholder="Anything to remember about this sale" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="xl:col-span-2">
              <label className="flex items-center gap-2.5 text-[13px] font-medium text-body cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#b45309]"
                  checked={!!advanceFor}
                  onChange={(e) => setAdvanceFor(e.target.checked ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) : "")} />
                Advance order — the customer takes it later
              </label>
              {advanceFor && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[12.5px] text-body-soft">Taking it on</span>
                  <input type="date" className="ipt" style={{ width: 190 }} value={advanceFor}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setAdvanceFor(e.target.value)} />
                  <span className="text-[12px] text-body-soft">stock leaves on that day, not today</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/*  THIS BILL — the page itself, exactly like a purchase bill: an empty
             table with one door, "Add items". The purple panel carries money only.  */}
        <div className={cardCls + " overflow-hidden"}>
          <div className="grid grid-cols-[minmax(0,1fr)_110px_104px_128px_100px_40px] gap-3 items-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "#470066" }}>
            <span>Item</span><span>Price ৳/unit</span><span className="text-center">Unit</span><span className="text-center">Qty</span><span className="text-right">Total</span><span />
          </div>
          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-body-soft">Nothing on this bill yet — press <b className="text-purple">Add items</b> and pick from your shelf.</div>
          ) : (
            lines.map((l) => {
            /*  DEC-POS-024 — the wall and the warning follow the unit the line is
                sold in: floor and cost per base = per item-unit / factor  */
            const f = factorOf(l);
            const floorLine = l.product.floorPricePaisa == null ? null
              : f === 1 ? l.product.floorPricePaisa : Math.ceil(l.product.floorPricePaisa / f);
            const costLine = l.product.costPaisa === undefined ? undefined
              : f === 1 ? l.product.costPaisa : Math.round(l.product.costPaisa / f);
            return (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_110px_104px_128px_100px_40px] gap-3 items-center px-4 py-2.5 border-t border-lavender-deep">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-[30px] h-[30px] rounded-[8px] shrink-0"
                    style={{ background: l.product.imageUrl ? `url(${l.product.imageUrl}) center/cover no-repeat` : genBg(l.product.sku) }} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-purple truncate">{l.product.name}</div>
                    {/*  the unit is part of the number — "205 left" of WHAT was the
                         owner's complaint (26 Aug). And when the unit breaks into a
                         base, the conversion rides along so nobody has to remember it.  */}
                    <div className="text-[11px] text-body-soft">
                      {l.product.costPaisa !== undefined && l.product.costPaisa > 0 && <>cost {formatTaka(l.product.costPaisa)}</>}
                      {l.product.stockQty !== null && <> · {l.product.stockQty} {l.product.unitName ?? ""} left</>}
                      {l.product.unitBase && <> · {l.product.unitBase}</>}
                    </div>
                  </div>
                </div>

                {/*  POS-R15 — the price is the cashier's to change; the floor is the wall  */}
                <div>
                  <TakaInput className="ipt h-[34px] text-[13px] text-right"
                    valuePaisa={l.unitPaisa}
                    placeholder={String(Math.round((l.product.pricePaisa ?? 0) / f) / 100)}
                    onPaisa={(pz) => setUnit(l.key, pz)} />
                  {floorLine != null && l.unitPaisa < floorLine && (
                    <div className="text-[11px] text-[#c0392b] mt-0.5">min {formatTaka(floorLine)}</div>
                  )}
                  {/*  POS-R16 (owner, 21 Aug) — selling under what it cost is
                       allowed, but it must never happen quietly. The floor is
                       still the only wall; this is the shop's own warning.  */}
                  {costLine !== undefined && costLine > 0 && l.unitPaisa > 0
                    && l.unitPaisa < costLine
                    && !(floorLine != null && l.unitPaisa < floorLine) && (
                    <div className="text-[11px] text-[#b45309] mt-0.5">
                      under cost by {formatTaka(costLine - l.unitPaisa)}
                    </div>
                  )}
                </div>

                {/*  DEC-POS-024 — sold by the item's unit or its base, the same two
                    the purchase bill offers. One unit with no base = plain word.  */}
                <div className="text-center">
                  {l.product.baseUnitId ? (
                    <select className="ipt h-[34px] text-[12.5px] font-semibold text-purple w-full"
                      value={l.unitId ?? l.product.unitId ?? ""}
                      onChange={(e) => setLineUnit(l.key, e.target.value)}>
                      {l.product.unitId && <option value={l.product.unitId}>{l.product.unitName}</option>}
                      <option value={l.product.baseUnitId}>{l.product.baseUnitName}</option>
                    </select>
                  ) : (
                    <span className="text-[12.5px] font-medium text-body-soft">{l.product.unitName ?? "—"}</span>
                  )}
                </div>

                <div className="flex items-center justify-center">
                  {/*  max = the shelf in the line's OWN unit (base units get
                       factor x as many), so typing past it stops at the wall  */}
                  <QtyStepper size="sm" value={l.qty} onChange={(n) => setQty(l.key, n)}
                    min={1} max={capOf(l) ?? undefined} />
                </div>

                <div className="text-right text-[13.5px] font-semibold text-purple" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatTaka(l.unitPaisa * l.qty)}
                </div>

                <button type="button" onClick={() => remove(l.key)} title="Remove"
                  className="text-body-soft hover:text-[#c0392b] justify-self-center">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
            })
          )}
          <button type="button" onClick={() => setPickerOpen(true)}
            className="w-full text-left px-4 py-3 border-t border-lavender-deep text-purple font-medium text-[13.5px] inline-flex items-center gap-2 hover:bg-lavender/40">
            <Icon name="plus" size={15} /> Add items
          </button>
        </div>

        </div>

        {/* ============ RIGHT: the money — nothing else lives here ============ */}
        <aside className="sticky top-3 self-start">
          {/*  Capped to the screen so the money and the Complete button are always
               in view (owner, 20 Aug: "complete icon kkhonoi jen screen ar bahire
               na jay").  */}
          <div className="rounded-[16px] text-white shadow-lift flex flex-col overflow-hidden" /*  the page header sits above the panel, so the cap has to leave room for
                 it — "100vh − 24" put the button 50px below the fold (owner, 21 Aug)  */
            style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)", height: "calc(100vh - 100px)" }}>
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
            {/*  POS-R16 — a loss is a decision, not an accident: the panel says
                 how much of the bill is under cost before it is completed.  */}
            {underCostPaisa > 0 && errors.length === 0 && (
              <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px]"
                style={{ background: "rgba(240,180,106,.16)", color: "#f0b46a" }}>
                {formatTaka(underCostPaisa)} under cost on this bill — selling at a loss.
              </div>
            )}

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

            </div>


            {/*  THE MONEY BLOCK — CLAUDE.md §14. Since the bill's items moved out
                 to the white table under the catalogue (owner, 21 Aug), this panel
                 carries money and nothing else: the total, the four doors, the
                 payment lines, the button. Only the payment list ever scrolls.  */}
            <div className="px-4 pt-3 border-t border-white/15 shrink-0">
              <MoneyBlock
                subtotalPaisa={subtotal}
                discountMode={discountMode} discountInput={discountInput}
                charges={charges} adjSign={adjSign} adjustmentTaka={adjustmentTaka}
                taxRate={taxRate} taxRates={TAX_RATES} sum={sum}
                onDiscount={setDiscountInput} onDiscountMode={setDiscountMode}
                onCharges={setCharges} onAdjSign={setAdjSign}
                onAdjustment={setAdjustmentTaka} onTaxRate={setTaxRate} />

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

            {/*  the air sits between the bill and the money, so the payment lines
                 stay next to the button where the hand is  */}
            <div className="flex-1 min-h-[8px]" />

            <div className="px-4 shrink-0 pb-1">
              <div className="rounded-[12px] px-3 py-3" style={{ background: "rgba(255,255,255,.07)" }}>
                <PaymentLines pay={pay} methods={methods} maxHeight={168} />
              </div>
            </div>

            {/*  THE PINNED FOOT — where the money stands, and the button. The only
                 thing above it that can grow is the payment list, and that scrolls
                 inside itself, so nothing can push Complete off the screen.  */}
            <div className="p-4 pt-3 border-t border-white/15 shrink-0">
              <MoneyResult pay={pay} totalPaisa={total} />

              {needsCustomer && (
                <div className="mt-2 rounded-[10px] bg-[#fff4e5] border border-[#f0c27a] text-[#b45309] text-[12px] px-3 py-2 flex items-start gap-1.5">
                  <Icon name="user" size={14} />
                  <span>{formatTaka(duePaisa)} stays unpaid — add a <b className="font-semibold">customer name or phone</b> above.</span>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button type="button" onClick={holdSale} disabled={lines.length === 0} className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 hover:bg-white/20 disabled:opacity-40">Hold</button>
                <button type="button" onClick={completeSale} disabled={errors.length > 0} className="flex-1 min-w-0 bg-white hover:bg-[#f4ecf9] text-purple text-[15px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 shadow-soft disabled:opacity-40"><Icon name="check" size={17} /><span className="truncate">{errors.length ? errors[0].replace(/\.$/, "") : advanceFor ? `Take advance${total > 0 ? " · " + formatTaka(total) : ""}` : `Complete${total > 0 ? " · " + formatTaka(total) : " sale"}`}</span></button>
              </div>
              {saleErr && <div className="mt-2 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{saleErr}</div>}
            </div>
          </div>
        </aside>
      </div>


      {/*  THE SHELF — a picker, not a wall of tiles (owner, 21 Aug: "purchase page
           ar moto, Add items click krle product asbe"). Same door as a purchase
           bill: the bill is the page, the shelf opens on top of it.  */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-8" style={{ background: "rgba(40,20,50,.45)" }}>
          <div className="bg-white rounded-[18px] shadow-2xl flex flex-col min-h-0 overflow-hidden w-full max-w-[1100px]"
            style={{ height: "min(86vh, 820px)" }}>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-lavender-deep">
              <h2 className="font-display text-[19px] text-purple m-0">Pick items</h2>
              {lines.length > 0 && (
                <span className="text-[12.5px] text-body-soft">{lines.length} on the bill · {formatTaka(subtotal)}</span>
              )}
              <button type="button" onClick={() => setPickerOpen(false)}
                className="ml-auto text-[13px] font-medium text-white bg-purple rounded-[10px] px-4 py-2">Done</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ background: "#faf7fd" }}>
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
              <div className="grid grid-cols-[44px_minmax(0,1fr)_96px_96px_112px_112px] gap-3 items-center px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "#470066" }}>
                <span /><span>Item</span><span>Category</span><span className="text-right">Stock</span><span className="text-right">Price</span><span />
              </div>
              <div className="divide-y divide-lavender-deep max-h-[62vh] overflow-y-auto">
                {grid.map((p) => (
                  <div key={p.id} className="grid grid-cols-[44px_minmax(0,1fr)_96px_96px_112px_112px] gap-3 items-center px-3.5 py-2">
                    <span className="w-[38px] h-[38px] rounded-[10px]"
                      style={{ background: p.imageUrl ? `url(${p.imageUrl}) center/cover no-repeat` : genBg(p.sku) }} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-purple truncate">{p.name}</span>
                      <span className="block font-mono text-[11.5px] text-body-soft truncate">{p.sku}</span>
                    </span>
                    <span className="text-[12.5px] text-body-soft truncate">{p.categoryName ?? "—"}</span>
                    <span className="text-right text-[12.5px]"
                      style={{ color: p.stockQty === null ? "#8b7a95" : p.stockQty > 0 ? "#0e7a3d" : "#c0392b" }}>
                      {p.stockQty === null ? "service" : p.stockQty > 0 ? `${p.stockQty} ${p.unitName ?? ""}`.trim() : "out of stock"}
                    </span>
                    <span className="text-right">
                      <span className="block text-[13.5px] font-semibold text-body">
                        {p.pricePaisa === null ? "no price" : formatTaka(p.pricePaisa)}
                      </span>
                      {p.costPaisa !== undefined && p.costPaisa > 0 && (
                        <span className="block text-[11px] text-body-soft">cost {formatTaka(p.costPaisa)}</span>
                      )}
                    </span>
                    {inCart(p.id) > 0 ? (
                      <span className="justify-self-end">
                        <QtyStepper size="sm" value={inCart(p.id)} min={0}
                          max={p.stockQty ?? undefined}
                          onChange={(n) => setQtyOfProduct(p.id, n)} />
                      </span>
                    ) : (
                      <button type="button" onClick={() => add(p)} disabled={!canAdd(p)}
                        title={!canAdd(p) ? "Nothing left on the shelf" : undefined}
                        className="justify-self-end text-white bg-purple inline-flex items-center gap-1 text-[12px] font-bold rounded-full px-3.5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        <Icon name="plus" size={12} /> Add
                      </button>
                    )}
                  </div>
                ))}
                {grid.length === 0 && <div className="text-[13px] text-body-soft py-8 text-center">Nothing matches.</div>}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] auto-rows-fr gap-3">
            {grid.map((p) => {
            const n = inCart(p.id);
            const shut = !canAdd(p) && n === 0;
            return (
              /*  ⚠️ NOT a <button> any more — 26 Aug 2026. The quantity field
                  inside the tile is an <input>, and an input inside a button
                  cannot be typed into (and is invalid HTML). The tile keeps
                  its click-to-add and its keyboard behaviour by hand.  */
              <div key={p.id} role="button" tabIndex={shut ? -1 : 0}
                aria-disabled={shut || undefined}
                onClick={() => { if (!shut && n === 0) add(p); }}
                onKeyDown={(e) => { if (!shut && n === 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); add(p); } }}
                title={shut ? "Nothing left on the shelf" : undefined}
                className={`text-left bg-white border rounded-[14px] overflow-hidden shadow-soft transition-all flex flex-col h-full
                  ${shut ? "opacity-45 cursor-not-allowed border-lavender-deep"
                        : n > 0 ? "border-orchid cursor-default shadow-lift"
                                : "border-lavender-deep cursor-pointer hover:shadow-lift hover:border-orchid-mid active:scale-[0.98]"}`}>
                <div className="h-[104px] w-full shrink-0 relative" style={{ background: p.imageUrl ? `url(${p.imageUrl}) center/cover no-repeat` : genBg(p.sku) }}>
                  {n > 0 && (
                    <span className="absolute top-2 right-2 bg-purple text-white text-[11.5px] font-bold rounded-full px-2 py-0.5 shadow-soft">
                      on the bill
                    </span>
                  )}
                </div>
                <div className="p-2.5 flex flex-col flex-1">
                  <div className="text-[13px] font-medium text-purple leading-tight line-clamp-2 min-h-[34px]">{p.name}</div>
                  {/*  what is actually on the shelf — a till that hides a shortage makes
                       the cashier promise something the shop cannot hand over  */}
                  <div className="text-[11.5px] mt-0.5"
                    style={{ color: p.stockQty === null ? "#8b7a95" : p.stockQty > 0 ? "#0e7a3d" : "#c0392b" }}>
                    {p.stockQty === null ? "service" : p.stockQty > 0 ? `${p.stockQty} ${p.unitName ?? ""} in stock`.replace("  ", " ") : "out of stock"}
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
                    {n === 0 && (
                      <span className="text-white bg-purple inline-flex items-center gap-1 text-[12px] font-bold rounded-full px-3 py-1.5 shrink-0"><Icon name="plus" size={12} /> Add</span>
                    )}
                  </div>
                  {/*  a tile is 158px wide, so the stepper gets its own line
                       rather than fighting the price for room  */}
                  {n > 0 && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <QtyStepper grow size="sm" value={n} min={0} max={p.stockQty ?? undefined}
                        onChange={(q) => setQtyOfProduct(p.id, q)} />
                    </div>
                  )}
                </div>
              </div>
            );
            })}
            {grid.length === 0 && <div className="col-span-full text-[13px] text-body-soft py-8 text-center">Nothing matches.</div>}
          </div>
          )}
        </div>
            </div>
          </div>
        </div>
      )}

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
      {/* P7-11 — opening a drawer says what is in it and who is on it */}
      {openAsk && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(() => setOpenAsk(null))}>
          <div className="bg-white rounded-[16px] shadow-lift p-6 w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[17px] text-purple m-0 mb-4">Open the counter</h3>
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Who is on the counter</label>
            <input className="ipt h-[44px] mb-3" value={openAsk.cashier}
              onChange={(e) => setOpenAsk({ ...openAsk, cashier: e.target.value })} />
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Cash in the drawer now ৳</label>
            <input type="text" inputMode="decimal" className="ipt h-[44px] text-[15px]" placeholder="0.00"
              value={openAsk.floatTaka}
              onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d{0,2}$/.test(v)) setOpenAsk({ ...openAsk, floatTaka: v }); }} />
            {saleErr && <p className="text-[12px] text-[#c0392b] mt-3 mb-0">{saleErr}</p>}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setOpenAsk(null)} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-bold text-[13px]">Cancel</button>
              <button type="button" onClick={openShift} disabled={openBusy}
                className="flex-1 py-2.5 rounded-[11px] bg-purple hover:bg-purple-deep text-white font-bold text-[13px] disabled:opacity-50">
                {openBusy ? "Opening…" : "Open the shift"}
              </button>
            </div>
          </div>
        </div>
      )}

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

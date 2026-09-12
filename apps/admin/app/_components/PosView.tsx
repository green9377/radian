"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { backdropClose } from "./backdropClose";
import Icon from "./Icon";
import Link from "next/link";
import { posCatalogue, posCustomers, listChannels, formatTaka, genBg, posCurrentShift, posCreateSale, posApproveDiscount, posDiscountRules, posHeldCarts, posHoldCart, posDropHeldCart, type ApiPosCatalogueRow, type ApiPosCustomer, type ApiPosDiscountRule, type ApiPosHeldCart, type ApiPosShift, type ApiChannel, type ApiPosCredit, posCreditStanding, type ApiCreditQuote, creditQuote, type ApiMe, type ApiAppUser, meCached, listAppUsers, posSettings } from "../_data/api";
import { MoneyBlock, MoneyResult, PaymentLines, TakaInput, computeMoney, chargeNote, usePayRows, usePaymentMethods, TILL_TENDERS, type ChargeRow, type DiscountMode, type Door } from "./MoneyBlock";
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
/*  (POS audit 11 Sep 2026 §3 #17) — `MANAGER_PIN = "1234"` used to live on this
    line and shipped inside the browser bundle, and the comparison happened here
    too. Both are gone: the PIN is posted to `POST /pos/discount/approve`, the
    server checks it against a live OWNER/MANAGER account, and what comes back is
    a one-shot token. This screen never holds or compares a PIN.

    (POS audit 11 Sep 2026 §3 #12) — a four-value VAT dropdown ("demo set") lived
    here and let the cashier pick a rate per bill, which is the opposite of
    DEC-GBL-002: one rate, owned by Finance, and the till does not get its own.
    The rate comes from `GET /pos/settings.defaultTaxRateBps` now, is shown
    read-only, and the server ignores a body `taxRateBps` either way.  */

/** the doors this panel offers — VAT is no longer one of them (§3 #12) */
const MONEY_DOORS: Door[] = ["discount", "charge", "adjust"];

/*  (POS audit 11 Sep 2026 §1 #1) — one attempt, one key. `crypto.randomUUID` is
    only defined on a secure origin and the till is opened over plain http on the
    shop LAN often enough that the fallback is not theoretical.  */
function newIdempotencyKey(): string {
  const c: Crypto | undefined = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `till-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

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
/**
 * (POS audit 11 Sep 2026 §3 #18) — what a parked bill is made of, on the SERVER.
 *
 * Hold/recall was React state: a parked bill died on a refresh, was invisible to
 * the second counter, and the `PosHeldCart` table that exists precisely to stop
 * one held cart being sold from two screens was never written to. It travels as
 * the `payload` of `POST /pos/held` now, versioned so an older parked bill can be
 * recognised rather than half-restored. A recall restores the LINES, the CUSTOMER
 * and the CHARGES — the old in-browser version dropped the customer id, the note,
 * the channel and the advance date on the floor.
 */
const HELD_VERSION = 1;
interface HeldPayload {
  v: number;
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerOutstandingPaisa: number;
  isGift: boolean;
  discountMode: DiscountMode;
  discountInput: number;
  adjSign: 1 | -1;
  adjustmentTaka: number;
  charges: ChargeRow[];
  note: string;
  advanceFor: string;
  channelId: string;
  saleDate: string;
}

export default function PosSellView() {
  const router = useRouter();
  const [products, setProducts] = useState<ApiPosCatalogueRow[]>([]);

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

  /*  ═══ THE SHELF — audit §3 #13 ══════════════════════════════════════════════
      It was 500 rows fetched ONCE, filtered in the browser and then sliced to 60.
      Item 501 could not be sold at all, and the search box only ever searched
      whatever happened to have been loaded. `GET /pos/catalogue?search=` is
      honoured on the server, so the typing goes there — debounced, because a
      counter types fast — and what comes back is what is drawn. No slice.

      6 Aug 2026 — demo fallback removed (owner's order, and here it was worse
      than cosmetic: a counter screen offering SELLABLE fake products is a
      mis-sale waiting to happen). Empty catalogue = empty grid.  */
  const [catalogueBusy, setCatalogueBusy] = useState(true);
  const [catalogueErr, setCatalogueErr] = useState<string | null>(null);
  /*  the category chips must not flicker away while a search is narrow, so the
      list is remembered from the last unsearched answer  */
  const [knownCats, setKnownCats] = useState<string[]>([]);
  useEffect(() => {
    const term = q.trim();
    let live = true;
    setCatalogueBusy(true);
    /*  ~250 ms: below it the server sees a request per keystroke, above it the
        counter feels the lag  */
    const t = setTimeout(() => {
      /*  DEC-POS-018 — items, never products: everything marked "We sell it",
          services included. One thing, one price, one way stock leaves.  */
      posCatalogue(term || undefined, 200)
        .then((rows) => {
          if (!live) return;
          setProducts(rows);
          setCatalogueErr(null);
          if (!term) {
            const set = new Set<string>();
            rows.forEach((p) => p.categoryName && set.add(p.categoryName));
            setKnownCats(Array.from(set));
          }
        })
        .catch((e) => {
          if (!live) return;
          setProducts([]);
          setCatalogueErr(e instanceof Error ? e.message : "The shelf could not be read");
        })
        .finally(() => { if (live) setCatalogueBusy(false); });
    }, term ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const categories = useMemo(() => {
    const set = new Set<string>(knownCats);
    products.forEach((p) => p.categoryName && set.add(p.categoryName));
    return ["All", ...Array.from(set)];
  }, [products, knownCats]);
  /*  only the category chip is still applied here — the words are the server's
      to match, and nothing is sliced away any more  */
  const grid = useMemo(
    () => products.filter((p) => (cat === "All" ? true : p.categoryName === cat)),
    [products, cat],
  );

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

  /*  ═══ THE CUSTOMER — audit §3 #14 ═══════════════════════════════════════════
      The picker loaded the first 100 customers and searched them in the BROWSER.
      A regular past #100 was simply unfindable at the counter, so the cashier
      typed the phone again, `resolveCustomer` upserted, and the same person ended
      up as two rows with two halves of a due. `GET /pos/customers?search=` asks
      the server (at most 25 rows) and tells the counter what each one already
      owes — which is the one thing a person has to see BEFORE selling on credit.  */
  const [customers, setCustomers] = useState<ApiPosCustomer[]>([]);
  const [custBusy, setCustBusy] = useState(false);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [selectedCust, setSelectedCust] = useState<ApiPosCustomer | null>(null);
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

  const pickCustomer = (c: ApiPosCustomer) => {
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
  /*  the lookup runs only while the picker is open, and on the same ~250 ms as
      the shelf — one debounce shape for the whole screen  */
  useEffect(() => {
    if (!custOpen) return;
    let live = true;
    setCustBusy(true);
    const t = setTimeout(() => {
      posCustomers(custQ.trim() || undefined)
        .then((r) => { if (live) setCustomers(r); })
        .catch(() => { if (live) setCustomers([]); })
        .finally(() => { if (live) setCustBusy(false); });
    }, custQ.trim() ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [custQ, custOpen]);

  // ---- the four things that bend a bill (MoneyBlock owns the shapes) ----
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amt");
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [adjSign, setAdjSign] = useState<1 | -1>(1);
  const [adjustmentTaka, setAdjustmentTaka] = useState<number>(0);

  /*  §3 #12 / DEC-GBL-002 — ONE rate, and it is Finance's. The cashier does not
      choose it and the bill does not carry one; this is read so the panel can say
      what the bill is being taxed at, and `taxRateBps` is no longer sent at all.  */
  const [taxRateBps, setTaxRateBps] = useState(0);
  useEffect(() => { posSettings().then((s) => setTaxRateBps(s.defaultTaxRateBps ?? 0)).catch(() => {}); }, []);
  const taxRate = taxRateBps / 100; // percent, the unit computeMoney speaks

  /*  §1 #7 / §3 #17 — what the SERVER said, not what the browser decided. The
      token is the only thing that lifts the cap, and it is good for one bill.  */
  const [approval, setApproval] = useState<{ token: string; approvedBy: string } | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  /*  §3 #15/#17 — the cap is the shop's, read from `GET /pos/discount-rules`. The
      screen used to hardcode `cap = 100 / overCap = false`, so the approval button
      and the PIN dialog below were unreachable dead code and a seeded rule was a
      hard dead end at the counter: the server refused and the till could not ask.  */
  const [rules, setRules] = useState<ApiPosDiscountRule[]>([]);
  useEffect(() => { posDiscountRules().then(setRules).catch(() => setRules([])); }, []);

  // ---- held carts (server-side, §3 #18) ----
  const [held, setHeld] = useState<ApiPosHeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [heldBusy, setHeldBusy] = useState(false);
  const [heldErr, setHeldErr] = useState<string | null>(null);
  const refreshHeld = useCallback(() => {
    posHeldCarts().then(setHeld).catch(() => setHeld([]));
  }, []);
  useEffect(() => { refreshHeld(); }, [refreshHeld]);

  /*  ---- what to hand back, after the sale (§3 #11) ----
      Not the browser's arithmetic: the server trims the tenders to what the shop
      keeps and answers with `changePaisa`, so the slip and the drawer cannot
      disagree with what the cashier was told to give back.  */
  const [change, setChange] = useState<null | { saleId: string; no: string; changePaisa: number; duePaisa: number }>(null);

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
  const { discountPaisa, vatPaisa } = sum;
  const adjustmentPaisa = sum.extraPaisa; // charges + adjustment — one number for the order
  const total = sum.totalPaisa;

  /*  DEC-RTN-015 — store credit on this bill. Not a tender: no money moves, a
      liability the shop was already carrying is discharged, so it sits above
      the payment rows and comes off the bill before anything is owed. The cap
      and the balance are the server's answer, never the browser's.  */
  const [quote, setQuote] = useState<ApiCreditQuote | null>(null);
  const [creditPaisa, setCreditPaisa] = useState(0);
  useEffect(() => {
    if (!selectedCust?.id || total <= 0) { setQuote(null); setCreditPaisa(0); return; }
    creditQuote(selectedCust.id, total).then(setQuote).catch(() => setQuote(null));
  }, [selectedCust?.id, total]);
  useEffect(() => {
    // never let a stale amount outlive the bill it was quoted against
    setCreditPaisa((c) => Math.min(c, quote?.usablePaisa ?? 0));
  }, [quote?.usablePaisa]);

  /*  DEC-POS-017 retired (owner, 20 Aug): there is no Full/Partial choice. Money
      is taken as many ways as the customer likes; whatever is left is the due.  */
  /*  what the customer still has to hand over after credit is applied  */
  const payablePaisa = Math.max(0, total - creditPaisa);
  const pay = usePayRows(payablePaisa, methods[0]?.id ?? "CASH");
  const { paidPaisa: paid, duePaisa, changePaisa, overpaidNoChange } = pay;

  /*  ═══ THE CAP — audit §3 #15 / #17 ══════════════════════════════════════════
      The strictest rule any line on this cart is under; no rule = 100, i.e. no
      block. The server computes the same thing from the same table and refuses in
      words if the screen and it ever disagree — this is only so the counter can
      ASK for approval before it is refused, instead of hitting a dead end.

      Money OFF the bill is money off the bill whichever box it was typed into, so
      a negative adjustment counts against the cap exactly as the server counts it
      (`discountPaisa + max(0, −adjustment)`, audit §1 #5).  */
  const cap = useMemo(() => {
    if (!rules.length || lines.length === 0) return 100;
    let c = 100;
    for (const l of lines) {
      const r =
        rules.find((x) => x.itemId && x.itemId === l.product.id) ??
        (l.product.categoryId ? rules.find((x) => x.itemCategoryId && x.itemCategoryId === l.product.categoryId) : undefined);
      if (r) c = Math.min(c, r.maxPercent);
    }
    return c;
  }, [rules, lines]);
  const giveawayPaisa = discountPaisa + Math.max(0, -sum.extraPaisa);
  const givePct = subtotal ? (giveawayPaisa / subtotal) * 100 : 0;
  const overCap = giveawayPaisa > 0 && givePct > cap + 0.001;
  const needsApproval = overCap && !approval;

  /*  An approval is for the discount it was asked for. The moment the money moves
      the token is dropped, so an approval for 30% cannot quietly cover 60%.  */
  useEffect(() => { setApproval(null); }, [discountPaisa, sum.extraPaisa, subtotal]);

  // due (partial or full-credit) must be tied to a known customer — DEC-POS-008
  /*  A due is money owed by a person, so it needs a person (DEC-POS-008). This is
      the ONLY thing that asks for a name — a fully paid walk-in never does.  */
  const needsCustomer = duePaisa > 0 && !custName.trim() && !custPhone.trim();

  /*  DEC-POS-027 (owner, 31 Aug) — the credit ceiling WARNS, it never blocks.
      So this is not in `errors`: the Complete button stays live and the words
      sit beside it. `defaultCreditLimitPaisa` used to be a settings field
      nothing on earth read.  */
  const [credit, setCredit] = useState<ApiPosCredit | null>(null);
  useEffect(() => {
    if (!selectedCust?.id) { setCredit(null); return; }
    posCreditStanding(selectedCust.id).then(setCredit).catch(() => setCredit(null));
  }, [selectedCust?.id]);

  const creditWarning =
    credit && credit.limitPaisa > 0 && duePaisa > 0 && credit.outstandingPaisa + duePaisa > credit.limitPaisa
      ? `${selectedCust?.name ?? "This customer"} already owes ${formatTaka(credit.outstandingPaisa)}; this bill takes it to ${formatTaka(credit.outstandingPaisa + duePaisa)}, over the ${formatTaka(credit.limitPaisa)} limit.`
      : null;

  /*  (owner, 11 Sep 2026) NOTHING HAS TO BE OPENED TO SELL. The counter used
      to refuse the first bill of the morning until somebody opened a shift and
      typed a float. The cash box is opened by the sale itself now, so the till
      is never in the way of a customer standing at it.  */
  /*  ═══ CHANGE — audit §3 #11 ═════════════════════════════════════════════════
      Handing over a ৳1000 note for a ৳900 bill is the most ordinary thing at a
      counter and the till used to refuse it outright while printing "Change to
      give ৳100" beside the red error. Cash may be tendered over the bill now: the
      server records only what the shop KEEPS and answers with `changePaisa`.

      A NON-CASH tender still may not overpay — change out of a bKash transfer
      would be the shop paying cash against money it has not got — so the screen
      says so here instead of letting the cashier find out from a 400.  */
  const nonCashPaisa = pay.pays
    .filter((p) => p.method.toLowerCase() !== "cash")
    .reduce((s, p) => s + p.amountPaisa, 0);
  const nonCashOver = nonCashPaisa > payablePaisa;

  const errors: string[] = [];
  if (lines.length === 0) errors.push("Add at least one item.");
  if (needsApproval) errors.push(`${givePct.toFixed(0)}% off — over the ${cap}% limit, needs manager approval.`);
  if (nonCashOver)
    errors.push(
      `${formatTaka(nonCashPaisa)} on transfer or card is more than the ${formatTaka(payablePaisa)} bill — no change can be given out of a non-cash payment.`,
    );
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
    setApproval(null);
    setCharges([]);
    setNote("");
    setAdvanceFor("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setAdjSign(1);
    setAdjustmentTaka(0);
    // one payment line always exists, so the panel is never an empty box
    pay.reset();
  }

  /*  ═══ HOLD / RECALL — audit §3 #18 ══════════════════════════════════════════
      Both halves are the server's now. A parked bill survives a refresh, a crash
      and the other counter; and the recall DELETES first and restores only if the
      delete was the one that won, so one held cart cannot be sold from two
      screens. A recalled bill brings back its lines, its customer and its
      charges — the browser-only version restored the items and quietly dropped
      the customer id, the note, the channel and the advance date.  */
  async function holdSale() {
    if (lines.length === 0 || heldBusy) return;
    setHeldBusy(true);
    setHeldErr(null);
    const payload: HeldPayload = {
      v: HELD_VERSION,
      lines,
      customerId: selectedCust?.id ?? null,
      customerName: custName,
      customerPhone: custPhone,
      customerOutstandingPaisa: selectedCust?.outstandingPaisa ?? 0,
      isGift,
      discountMode,
      discountInput,
      adjSign,
      adjustmentTaka,
      charges,
      note,
      advanceFor,
      channelId,
      saleDate,
    };
    try {
      await posHoldCart({
        label: custName.trim() || `Walk-in ${new Date().toTimeString().slice(0, 5)}`,
        registerId: shift?.registerId ?? undefined,
        payload,
      });
      refreshHeld();
      resetSale();
    } catch (e) {
      setHeldErr(e instanceof Error ? e.message : "That bill could not be parked");
    } finally {
      setHeldBusy(false);
    }
  }

  /** what came back from the server is untrusted JSON until it has been read */
  function readHeld(raw: unknown): HeldPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<HeldPayload>;
    if (!Array.isArray(p.lines) || p.lines.length === 0) return null;
    return {
      v: typeof p.v === "number" ? p.v : 0,
      lines: p.lines as CartLine[],
      customerId: typeof p.customerId === "string" ? p.customerId : null,
      customerName: typeof p.customerName === "string" ? p.customerName : "",
      customerPhone: typeof p.customerPhone === "string" ? p.customerPhone : "",
      customerOutstandingPaisa: typeof p.customerOutstandingPaisa === "number" ? p.customerOutstandingPaisa : 0,
      isGift: !!p.isGift,
      discountMode: p.discountMode === "pct" ? "pct" : "amt",
      discountInput: typeof p.discountInput === "number" ? p.discountInput : 0,
      adjSign: p.adjSign === -1 ? -1 : 1,
      adjustmentTaka: typeof p.adjustmentTaka === "number" ? p.adjustmentTaka : 0,
      charges: Array.isArray(p.charges) ? (p.charges as ChargeRow[]) : [],
      note: typeof p.note === "string" ? p.note : "",
      advanceFor: typeof p.advanceFor === "string" ? p.advanceFor : "",
      channelId: typeof p.channelId === "string" ? p.channelId : "",
      saleDate: typeof p.saleDate === "string" ? p.saleDate : new Date().toISOString().slice(0, 10),
    };
  }

  async function resumeSale(hc: ApiPosHeldCart) {
    if (heldBusy) return;
    const p = readHeld(hc.payload);
    if (!p) {
      setHeldErr("That parked bill cannot be read — drop it and ring the sale up again.");
      return;
    }
    setHeldBusy(true);
    setHeldErr(null);
    try {
      /*  claim it first: whoever gets the delete gets the cart. Restoring first
          and deleting after is how the same parked bill is sold twice.  */
      await posDropHeldCart(hc.id);
    } catch {
      setHeldErr("That bill was already recalled somewhere else.");
      refreshHeld();
      setHeldBusy(false);
      return;
    }
    setLines(p.lines);
    setCustName(p.customerName);
    setCustPhone(p.customerPhone);
    setSelectedCust(
      p.customerId
        ? { id: p.customerId, name: p.customerName, phone: p.customerPhone, outstandingPaisa: p.customerOutstandingPaisa }
        : null,
    );
    setCustNew(!p.customerId && !!p.customerName.trim());
    setIsGift(p.isGift);
    setDiscountMode(p.discountMode);
    setDiscountInput(p.discountInput);
    setAdjSign(p.adjSign);
    setAdjustmentTaka(p.adjustmentTaka);
    setCharges(p.charges);
    setNote(p.note);
    setAdvanceFor(p.advanceFor);
    if (p.channelId) setChannelId(p.channelId);
    setSaleDate(p.saleDate || new Date().toISOString().slice(0, 10));
    setApproval(null);
    // a resumed cart starts with one payment line again, not whatever was half-typed
    pay.reset();
    refreshHeld();
    setShowHeld(false);
    setHeldBusy(false);
  }

  async function dropHeld(id: string) {
    if (heldBusy) return;
    setHeldBusy(true);
    setHeldErr(null);
    try {
      await posDropHeldCart(id);
    } catch (e) {
      setHeldErr(e instanceof Error ? e.message : "That parked bill could not be dropped");
    } finally {
      refreshHeld();
      setHeldBusy(false);
    }
  }

  /*  ═══ ONE ATTEMPT, ONE BILL — audit §1 #1 ═══════════════════════════════════
      `disabled={errors.length > 0}` was the whole guard, and `completeSale` is
      async: a double-click, or a slow API and an impatient hand, posted
      `POST /pos/sales` twice — two receipt numbers, two sets of lines, two stock
      deductions and two payment sets for money taken once. The drawer then
      expects double and day-close reads as a shortage nobody can explain.

      Two belts: `saleBusy` stops the second click in this browser, and the
      idempotency key stops the second REQUEST — the server hands back the
      original bill instead of ringing it up again, which is the only guard that
      also covers a retry after a dropped connection. The key belongs to the
      ATTEMPT: a retry of the same press keeps it, and a new one is minted only
      once a sale has actually completed.  */
  const [saleBusy, setSaleBusy] = useState(false);
  const idemRef = useRef<string | null>(null);

  async function completeSale() {
    if (errors.length || saleBusy) return;
    setSaleErr(null);
    setSaleBusy(true);
    if (!idemRef.current) idemRef.current = newIdempotencyKey();
    try {
      const sale = await posCreateSale({
        idempotencyKey: idemRef.current,
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
        /*  §1 #7 — the NAME is a label on the bill and nothing more; the token is
            what actually lifts the cap, and the server burns it on one sale.  */
        discountApprovedBy: approval?.approvedBy,
        discountApprovalToken: approval?.token,
        adjustmentPaisa,
        adjustmentNote: chargeNote(charges, sum.adjustmentPaisa) || undefined,
        /*  §3 #12 — no `taxRateBps`. Finance owns the rate (DEC-GBL-002) and the
            server reads it from PosSetting; sending one from here was the bug.  */
        /*  the server still takes a word for this; it is derived now, never asked
            (DEC-POS-017 retired) — anything left unpaid makes it a partial sale  */
        payMode: duePaisa > 0 ? "partial" : "full",
        // DEC-RTN-015 — settled with the customer's credit, not with money
        storeCreditPaisa: creditPaisa > 0 ? creditPaisa : undefined,
        payments: pay.pays
          .filter((p) => p.amountPaisa > 0)
          .map((p) => ({
            method: p.method.toLowerCase() as "cash" | "bkash" | "nagad" | "card",
            amountPaisa: p.amountPaisa,
            accountId: p.accountId, // DEC-GBL-006
          })),
      });
      /*  DEC-POS-023 (owner, 21 Aug) — a finished sale opens as a bill, the same
          page a purchase gets.
          The attempt is over and it became a bill, so the next press is a new
          attempt and gets a new key (§1 #1).  */
      idemRef.current = null;
      const back = sale.changePaisa ?? 0;
      resetSale();
      posCurrentShift().then(setShift).catch(() => {});
      /*  §3 #11 — money in the hand comes before the paperwork: when there is
          change to give, say so and hold the screen until the cashier has given
          it. The figure is the SERVER's, so it is the one the receipt carries.  */
      if (back > 0) {
        setChange({ saleId: sale.id, no: sale.orderNo, changePaisa: back, duePaisa: sale.duePaisa });
      } else {
        router.push(`/pos/sale/${sale.id}`);
      }
    } catch (e) {
      /*  the key is KEPT: if this attempt did reach the server and only the
          answer was lost, the retry gets the original bill back rather than a
          second one  */
      setSaleErr(e instanceof Error ? e.message : "Could not complete the sale");
    } finally {
      setSaleBusy(false);
    }
  }

  /*  §1 #7 / §3 #17 — the PIN goes to the SERVER. It is not compared here, it is
      not stored here, and there is no PIN in this bundle to read. What comes back
      is a one-shot token for this bill and the name to show on the panel.  */
  async function tryApprove() {
    if (pinBusy) return;
    setPinBusy(true);
    setPinErr(null);
    try {
      const r = await posApproveDiscount({ pin: pinInput, requestedPercent: Math.round(givePct) });
      setApproval({ token: r.token, approvedBy: r.approvedBy });
      setShowPin(false);
      setPinInput("");
    } catch (e) {
      setPinErr(e instanceof Error ? e.message : "That approval was refused");
    } finally {
      setPinBusy(false);
    }
  }

  /*  ═══ THE KEYBOARD — audit §5 #2 ════════════════════════════════════════════
      A counter is a keyboard, not a mouse. Enter adds whatever the search box is
      pointing at and the focus STAYS in the search box, so the next scan or the
      next few letters just work; F2 jumps to the tender; Enter there completes;
      Esc backs out of whatever is open. Nothing here takes anything away from the
      mouse — every one of these has a chip or a tile beside it.  */
  const searchRef = useRef<HTMLInputElement | null>(null);
  const payWrapRef = useRef<HTMLDivElement | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  // a new set of results starts at the top, never at a row that has scrolled away
  useEffect(() => { setFocusIdx(0); }, [q, cat, products]);

  const focusTender = useCallback(() => {
    /*  the payment rows belong to MoneyBlock and take no ref, so the box is
        found by what it is: the first amount field inside the payment panel  */
    const box = payWrapRef.current?.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (box) { box.focus(); box.select(); }
  }, []);

  const addFromSearch = (p: ApiPosCatalogueRow) => {
    if (!canAdd(p)) return;
    add(p);
    const box = searchRef.current;
    if (box) { box.focus(); box.select(); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (change) return; // the change dialog is closed by saying the money was given
        if (showPin) { setShowPin(false); return; }
        if (showHeld) { setShowHeld(false); return; }
        if (custOpen) { setCustOpen(false); return; }
        if (pickerOpen) { setPickerOpen(false); return; }
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (pickerOpen) setPickerOpen(false);
        focusTender();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [change, showPin, showHeld, custOpen, pickerOpen, focusTender]);

  return (
    <div className="px-5 md:px-7 pt-5 pb-10 max-w-[1750px]">
      {/* top bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[22px] text-purple m-0 leading-tight">POS — Counter</h1>
        </div>
        <Link href="/pos/day-close" className={"flex items-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-medium border " + (shiftOpen ? "bg-[var(--s-ok)] border-[var(--l-ok)] text-[var(--t-ok)]" : "bg-lavender border-lavender-deep text-body-soft")}>
          <Icon name="clock" size={15} />
          {shift ? <>Cash box open · {formatTaka(openingFloatPaisa)} to start</> : shiftKnown ? <>Cash box closed · the next sale opens it</> : <>Checking the counter…</>}
        </Link>
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
              <div className="ipt flex items-center text-body-soft" style={{ background: "var(--s-accent)" }}>Auto — on save</div>
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
                <div className="ipt flex items-center text-body-soft" style={{ background: "var(--s-accent)" }}>{soldBy || "—"}</div>
              )}
            </div>
          </div>

          {/*  the customer belongs on the bill, next to its date and its seller —
               not in the money panel (owner, 21 Aug)  */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 mt-3">
            <div>
              <label className={labelCls}>Customer</label>
              {selectedCust ? (
                <div className="flex items-center gap-2 flex-wrap bg-[var(--s-ok)] border border-[var(--l-ok)] rounded-[10px] px-3 py-2.5">
                  <Icon name="user" size={15} />
                  {/*  §3 #14 — what this person already owes is the fact that
                       decides whether they may take another bill on credit, so it
                       sits beside their name and not three screens away.  */}
                  <span className="text-[12.5px] text-[var(--t-ok)] min-w-0">
                    <b className="font-medium">{selectedCust.name}</b> · {selectedCust.phone}
                    {selectedCust.outstandingPaisa > 0 && (
                      <span className="text-[var(--t-warn)]"> · owes {formatTaka(selectedCust.outstandingPaisa)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    {/*  §4 contrast — pale green on white read at about 1.9:1 and
                         was unreadable; the chip takes the panel's own dark ground.  */}
                    <a href={`tel:${selectedCust.phone}`} className="inline-flex items-center gap-1.5 bg-[var(--s-ok)] border border-[var(--l-ok)] text-[var(--t-ok)] text-[12px] px-3 py-1.5 rounded-[9px] font-medium hover:bg-[var(--s-ok)]"><Icon name="phone" size={13} /> Call</a>
                    <button type="button" onClick={clearCustomer} className="text-[12.5px] text-[var(--t-ok)] underline">Change</button>
                  </div>
                </div>
              ) : custNew ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={"ipt h-[40px] " + (needsCustomer ? "border-[var(--l-bad)] bg-[var(--s-bad)]" : "")} placeholder={needsCustomer ? "Name required for due" : "New customer name"} value={custName} onChange={(e) => setCustName(e.target.value)} />
                    <input className={"ipt h-[40px] " + (needsCustomer ? "border-[var(--l-bad)] bg-[var(--s-bad)]" : "")} placeholder="Phone" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                  </div>
                  <button type="button" onClick={() => { setCustNew(false); setCustName(""); setCustPhone(""); }} className="text-[12px] text-purple font-medium mt-1.5 inline-flex items-center gap-1"><Icon name="chevronLeft" size={12} /> Pick an existing customer instead</button>
                </>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setCustOpen((o) => !o)} className={"h-[42px] w-full flex items-center justify-between text-left rounded-[10px] px-3 border " + (needsCustomer ? "bg-[var(--s-bad)] border-[var(--l-bad)] text-[var(--t-warn)]" : "bg-white border-lavender-deep text-body")}>
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
                          {customers.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-lavender/60 border-b border-lavender-deep last:border-0">
                              <button type="button" onClick={() => pickCustomer(c)} className="text-left min-w-0 flex-1">
                                <div className="text-[13px] text-purple font-medium truncate">{c.name} <span className="text-body-soft font-normal">({c.phone})</span></div>
                                {/*  §3 #14 — a counter person has to see what this
                                     person owes BEFORE selling to them on credit  */}
                                <div className={"text-[12px] " + (c.outstandingPaisa > 0 ? "text-[var(--t-warn)] font-medium" : "text-body-soft")}>
                                  {c.outstandingPaisa > 0 ? `owes ${formatTaka(c.outstandingPaisa)}` : "nothing outstanding"}
                                </div>
                              </button>
                              <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="shrink-0 inline-flex items-center gap-1 text-[12px] text-purple border border-lavender-deep rounded-[8px] px-2.5 py-1.5 hover:border-orchid-mid"><Icon name="phone" size={13} /> Call</a>
                            </div>
                          ))}
                          {custBusy && customers.length === 0 && <div className="px-3 py-3 text-[13px] text-body-soft">Looking…</div>}
                          {!custBusy && customers.length === 0 && (
                            <div className="px-3 py-3 text-[13px] text-body-soft">
                              {custQ.trim() ? `No customer matches “${custQ}”.` : "No customers yet."}
                            </div>
                          )}
                          {customers.length >= 25 && (
                            <div className="px-3 py-2 text-[11.5px] text-body-soft border-t border-lavender-deep">
                              Closest 25 shown — type more to narrow it.
                            </div>
                          )}
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
                <input type="checkbox" className="w-4 h-4 accent-[var(--t-warn)]"
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
          <div className="grid grid-cols-[minmax(0,1fr)_110px_104px_128px_100px_40px] gap-3 items-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "var(--s-accent)" }}>
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
                    <div className="text-[11px] text-[var(--t-gold)] mt-0.5">min {formatTaka(floorLine)}</div>
                  )}
                  {/*  POS-R16 (owner, 21 Aug) — selling under what it cost is
                       allowed, but it must never happen quietly. The floor is
                       still the only wall; this is the shop's own warning.  */}
                  {costLine !== undefined && costLine > 0 && l.unitPaisa > 0
                    && l.unitPaisa < costLine
                    && !(floorLine != null && l.unitPaisa < floorLine) && (
                    <div className="text-[11px] text-[var(--t-warn)] mt-0.5">
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
                  className="text-body-soft hover:text-[var(--t-gold)] justify-self-center">
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
            style={{ background: "linear-gradient(170deg,var(--a-solid),var(--a-solid))", height: "calc(100vh - 100px)" }}>
            <div className="p-4 pb-2 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-[12px] text-[var(--t-accent)] font-medium uppercase tracking-[0.06em]">Current sale</div>
                {lines.length > 0 && (
                  <button type="button" onClick={resetSale} className="text-[11px] text-[var(--t-accent)] bg-white/10 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white/20" title="Clear this sale"><Icon name="trash" size={11} /> Clear</button>
                )}
              </div>
              <button type="button" onClick={() => setIsGift((g) => !g)} className={"text-[12px] px-3 py-1.5 rounded-full font-medium border inline-flex items-center gap-1.5 " + (isGift ? "bg-orchid text-white border-orchid" : "bg-white/10 text-[var(--t-accent)] border-white/25")}>
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
                style={{ background: "rgba(240,180,106,.16)", color: "var(--t-warn)" }}>
                {formatTaka(underCostPaisa)} under cost on this bill — selling at a loss.
              </div>
            )}

            {creditWarning && lines.length > 0 && (
              <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px] font-medium"
                style={{ background: "rgba(224,162,58,.18)", color: "var(--t-warn)" }}>
                {creditWarning}
              </div>
            )}

            {errors.length > 0 && lines.length > 0 && (
              <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px]"
                style={{ background: "rgba(255,155,123,.14)", color: "var(--t-warn)" }}>
                {errors[0]}
                {errors.length > 1 && <span className="opacity-70"> · +{errors.length - 1} more</span>}
              </div>
            )}

            </div>


            {/*  THE MONEY BLOCK — CLAUDE.md §14. Since the bill's items moved out
                 to the white table under the catalogue (owner, 21 Aug), this panel
                 carries money and nothing else: the total, the four doors, the
                 payment lines, the button. Only the payment list ever scrolls.  */}
            <div className="px-4 pt-3 border-t border-white/15 shrink-0">
              {/*  §3 #12 — three doors, not four. VAT is not one of them any more:
                   the rate is the shop's, set once in POS settings.  */}
              <MoneyBlock
                subtotalPaisa={subtotal}
                doors={MONEY_DOORS}
                discountMode={discountMode} discountInput={discountInput}
                charges={charges} adjSign={adjSign} adjustmentTaka={adjustmentTaka}
                taxRate={taxRate} taxRates={[]} sum={sum}
                onDiscount={setDiscountInput} onDiscountMode={setDiscountMode}
                onCharges={setCharges} onAdjSign={setAdjSign}
                onAdjustment={setAdjustmentTaka} onTaxRate={() => {}} />

              {/*  the shop's rate, said out loud and not editable — the cashier
                   should still SEE what the bill is being taxed at (DEC-GBL-002)  */}
              <div className="mt-2 flex items-center justify-between text-[11.5px] text-[var(--t-accent)]">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="lock" size={12} />
                  {taxRateBps > 0 ? `VAT ${taxRateBps / 100}% — set in POS settings` : "No VAT — set in POS settings"}
                </span>
                {vatPaisa > 0 && <span className="text-white font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>+ {formatTaka(vatPaisa)}</span>}
              </div>

              {/*  §3 #17 — this used to be dead code behind `needsApproval = false`,
                   next to a PIN that shipped in the bundle. Both ends are real now:
                   the cap is the shop's and the approval is the server's.  */}
              {needsApproval && (
                <button type="button" onClick={() => { setShowPin(true); setPinErr(null); setPinInput(""); }}
                  className="mt-2 w-full text-[12px] py-2 rounded-[10px] font-medium bg-[var(--s-warn)] border border-[var(--l-warn)] text-[var(--t-warn)] inline-flex items-center justify-center gap-1.5">
                  <Icon name="shield" size={13} /> {givePct.toFixed(0)}% off — over the {cap}% limit, ask a manager
                </button>
              )}
              {approval && (
                <div className="mt-2 text-[12px] text-[var(--t-ok)] font-medium inline-flex items-center gap-1">
                  <Icon name="check" size={13} /> Approved by {approval.approvedBy}
                </div>
              )}
            </div>

            {/*  the air sits between the bill and the money, so the payment lines
                 stay next to the button where the hand is  */}
            <div className="flex-1 min-h-[8px]" />

            {/*  F2 lands here and Enter inside it completes the sale — a counter
                 hand never has to leave the number pad (audit §5 #2).  */}
            <div className="px-4 shrink-0 pb-1" ref={payWrapRef}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                /*  a button in here (store credit, add a row) owns its own Enter —
                    only a tender field completes the sale  */
                if ((e.target as HTMLElement).tagName !== "INPUT") return;
                e.preventDefault();
                if (errors.length === 0 && !saleBusy) completeSale();
              }}>
              <div className="rounded-[12px] px-3 py-3" style={{ background: "rgba(255,255,255,.07)" }}>
                {quote && quote.usablePaisa > 0 && (
                  <div className="rounded-[12px] px-3 py-2.5 mb-2.5"
                    style={{ background: "rgba(216,87,239,.16)", border: "1px solid rgba(216,87,239,.35)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-[var(--t-accent)] font-medium">
                        Store credit · {formatTaka(quote.balancePaisa)} saved
                      </span>
                      <button type="button"
                        onClick={() => setCreditPaisa(creditPaisa > 0 ? 0 : quote.usablePaisa)}
                        className={"text-[12px] font-bold px-3 py-1.5 rounded-[9px] " +
                          (creditPaisa > 0 ? "bg-white text-purple" : "bg-white/15 text-white border border-white/30")}>
                        {creditPaisa > 0 ? "Remove" : `Use ${formatTaka(quote.usablePaisa)}`}
                      </button>
                    </div>
                    {quote.usablePaisa < quote.balancePaisa && (
                      <div className="text-[11.5px] text-[var(--t-accent)] mt-1">
                        Credit can pay {quote.capBps / 100}% of a bill — {formatTaka(quote.capPaisa)} on this one.
                      </div>
                    )}
                  </div>
                )}
                <PaymentLines pay={pay} methods={methods} maxHeight={168} />
              </div>
            </div>

            {/*  THE PINNED FOOT — where the money stands, and the button. The only
                 thing above it that can grow is the payment list, and that scrolls
                 inside itself, so nothing can push Complete off the screen.  */}
            <div className="p-4 pt-3 border-t border-white/15 shrink-0">
              {/*  the panel measures against what the NOTES have to cover, which
                   is the bill minus any store credit — the same number the server
                   measures the tenders against (§3 #11)  */}
              <MoneyResult pay={pay} totalPaisa={payablePaisa} />

              {/*  §3 #11 — the loudest thing on the panel when there is money to
                   hand back, because that is the next thing the cashier does. It
                   is the browser's arithmetic until the sale is saved; the dialog
                   afterwards shows the figure the SERVER recorded.  */}
              {changePaisa > 0 && !nonCashOver && (
                <div className="mt-2 rounded-[10px] px-3 py-2 flex items-center justify-between"
                  style={{ background: "rgba(127,224,168,.16)", border: "1px solid rgba(127,224,168,.4)" }}>
                  <span className="text-[12px] font-medium text-[var(--t-ok)] inline-flex items-center gap-1.5">
                    <Icon name="cash" size={14} /> Change to hand back
                  </span>
                  <span className="text-[15px] font-semibold text-[var(--t-ok)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatTaka(changePaisa)}
                  </span>
                </div>
              )}

              {needsCustomer && (
                <div className="mt-2 rounded-[10px] bg-[var(--s-warn)] border border-[var(--l-warn)] text-[var(--t-warn)] text-[12px] px-3 py-2 flex items-start gap-1.5">
                  <Icon name="user" size={14} />
                  <span>{formatTaka(duePaisa)} stays unpaid — add a <b className="font-semibold">customer name or phone</b> above.</span>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button type="button" onClick={holdSale} disabled={lines.length === 0 || heldBusy || saleBusy} className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 hover:bg-white/20 disabled:opacity-40">Hold</button>
                {/*  §1 #1 — `disabled={errors.length > 0}` was the whole guard and
                     the handler is async: the second click posted a second bill.  */}
                <button type="button" onClick={completeSale} disabled={errors.length > 0 || saleBusy}
                  className="flex-1 min-w-0 bg-white hover:bg-[var(--s-accent)] text-purple text-[15px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 shadow-soft disabled:opacity-40">
                  <Icon name={saleBusy ? "clock" : "check"} size={17} />
                  <span className="truncate">
                    {saleBusy
                      ? "Saving the bill…"
                      : errors.length
                        ? errors[0].replace(/\.$/, "")
                        : advanceFor
                          ? `Take advance${total > 0 ? " · " + formatTaka(total) : ""}`
                          : `Complete${total > 0 ? " · " + formatTaka(total) : " sale"}`}
                  </span>
                </button>
              </div>
              {saleErr && <div className="mt-2 text-[11.5px] text-[var(--t-bad)] bg-white/10 rounded-[8px] px-3 py-2">{saleErr}</div>}
              {heldErr && <div className="mt-2 text-[11.5px] text-[var(--t-bad)] bg-white/10 rounded-[8px] px-3 py-2">{heldErr}</div>}
              <div className="mt-2 text-[11px] text-[var(--t-accent)]">Enter adds · F2 tender · Enter completes</div>
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
            <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ background: "var(--s-accent)" }}>
        <div className="min-w-0">
          <div className={cardCls + " p-4 mb-4"}>
            {/*  §3 #13 + §5 #2 — the words go to the server, and the focus stays
                 here: arrow keys move the pointer, Enter puts that item on the
                 bill and leaves the box ready for the next scan.  */}
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={17} /></span>
              <input ref={searchRef} autoFocus className="ipt h-[44px] ipt-icon"
                placeholder="Search or scan by name or code…" value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, Math.max(0, grid.length - 1))); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(0, i - 1)); }
                  else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = grid[focusIdx] ?? grid[0];
                    if (hit) addFromSearch(hit);
                  }
                }} />
              {catalogueBusy && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-body-soft">searching…</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {categories.map((c) => (
                <button key={c} type="button" onClick={() => setCat(c)} className={"text-[12.5px] px-3.5 py-1.5 rounded-full font-medium transition-colors border " + (cat === c ? "bg-purple text-white border-purple" : "bg-white text-body-soft border-lavender-deep hover:border-orchid-mid")}>{c}</button>
              ))}
              {/*  Tiles are fine for twenty things and useless for four hundred; rows
                   fit more on the screen and put stock, price and cost in columns you
                   can read down (owner, 20 Aug). The choice is remembered.  */}
              <div className="ml-auto inline-flex rounded-full overflow-hidden border" style={{ borderColor: "var(--l-accent)" }}>
                {([["grid", "Tiles"], ["rows", "Rows"]] as const).map(([k, label], i) => (
                  <button key={k} type="button" onClick={() => setView(k)}
                    className="text-[12px] font-semibold px-3 py-1.5"
                    style={{
                      background: view === k ? "var(--s-accent)" : "#fff",
                      color: view === k ? "#fff" : "var(--t-accent)",
                      borderLeft: i ? "1px solid var(--l-accent)" : undefined,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "rows" ? (
            <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
              <div className="grid grid-cols-[44px_minmax(0,1fr)_96px_96px_112px_112px] gap-3 items-center px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "var(--s-accent)" }}>
                <span /><span>Item</span><span>Category</span><span className="text-right">Stock</span><span className="text-right">Price</span><span />
              </div>
              <div className="divide-y divide-lavender-deep max-h-[62vh] overflow-y-auto">
                {grid.map((p, i) => (
                  <div key={p.id} className={"grid grid-cols-[44px_minmax(0,1fr)_96px_96px_112px_112px] gap-3 items-center px-3.5 py-2 " + (i === focusIdx ? "bg-lavender/60" : "")}>
                    <span className="w-[38px] h-[38px] rounded-[10px]"
                      style={{ background: p.imageUrl ? `url(${p.imageUrl}) center/cover no-repeat` : genBg(p.sku) }} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-purple truncate">{p.name}</span>
                      <span className="block font-mono text-[11.5px] text-body-soft truncate">{p.sku}</span>
                    </span>
                    <span className="text-[12.5px] text-body-soft truncate">{p.categoryName ?? "—"}</span>
                    <span className="text-right text-[12.5px]"
                      style={{ color: p.stockQty === null ? "var(--t-accent)" : p.stockQty > 0 ? "var(--t-ok)" : "var(--t-gold)" }}>
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
                {grid.length === 0 && <div className="text-[13px] text-body-soft py-8 text-center">{catalogueBusy ? "Searching the shelf…" : catalogueErr ?? (q.trim() ? `Nothing on the shelf matches “${q.trim()}”.` : "Nothing on the shelf yet.")}</div>}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] auto-rows-fr gap-3">
            {grid.map((p, i) => {
            const n = inCart(p.id);
            const shut = !canAdd(p) && n === 0;
            const onIt = i === focusIdx; // where Enter from the search box would land
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
                                : onIt ? "border-orchid-mid cursor-pointer shadow-lift"
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
                    style={{ color: p.stockQty === null ? "var(--t-accent)" : p.stockQty > 0 ? "var(--t-ok)" : "var(--t-gold)" }}>
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
            {grid.length === 0 && <div className="col-span-full text-[13px] text-body-soft py-8 text-center">{catalogueBusy ? "Searching the shelf…" : catalogueErr ?? (q.trim() ? `Nothing on the shelf matches “${q.trim()}”.` : "Nothing on the shelf yet.")}</div>}
          </div>
          )}
        </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== manager approval (DEC-POS-006 · audit §1 #7 / §3 #17) ===== */}
      {/*  The PIN is TYPED here and checked nowhere near here. It goes straight to
           `POST /pos/discount/approve`, which verifies it against a live OWNER or
           MANAGER account and hands back a one-shot token for this bill. Nothing
           in this bundle knows a PIN any more, and no string in it clears a cap.  */}
      {showPin && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(() => setShowPin(false))}>
          <div className="bg-white rounded-[18px] shadow-lift p-6 w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1"><Icon name="shield" size={18} /><h3 className="font-display text-[18px] text-purple m-0">Manager approval</h3></div>
            <p className="text-[12.5px] text-body-soft mb-3">
              {formatTaka(giveawayPaisa)} off this cart is {givePct.toFixed(0)}% — above the {cap}% limit. A manager signs it off with their own PIN.
            </p>
            <input type="password" className={"ipt h-[44px] text-center tracking-[0.3em] " + (pinErr ? "border-[var(--l-bad)]" : "")}
              placeholder={"••••"} value={pinInput} disabled={pinBusy}
              onChange={(e) => { setPinInput(e.target.value); setPinErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryApprove(); } }} autoFocus />
            {pinErr && <p className="text-[12px] text-[var(--t-gold)] mt-1.5 mb-0">{pinErr}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setShowPin(false)} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-body-soft font-medium text-[13px]">Cancel</button>
              <button type="button" onClick={tryApprove} disabled={pinBusy || !pinInput.trim()} className="flex-1 py-2.5 rounded-[11px] bg-purple text-white font-medium text-[13px] disabled:opacity-40">{pinBusy ? "Checking…" : "Approve"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== held bills drawer (audit §3 #18 — the server's, not this tab's) ===== */}
      {showHeld && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" {...backdropClose(() => setShowHeld(false))}>
          <div className="bg-white w-full max-w-[380px] h-full p-5 overflow-auto shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-[18px] text-purple m-0">Held bills ({held.length})</h3>
              <button type="button" onClick={() => setShowHeld(false)} className="text-body-soft text-[20px] leading-none">{"×"}</button>
            </div>
            {heldErr && <div className="text-[12px] text-[var(--t-gold)] mb-3">{heldErr}</div>}
            {held.length === 0 ? (
              <p className="text-[13px] text-body-soft">No held bills.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {held.map((hc) => {
                  const p = readHeld(hc.payload);
                  const t = p ? p.lines.reduce((s2, l) => s2 + l.unitPaisa * l.qty, 0) : 0;
                  const items = p ? p.lines.reduce((n, l) => n + l.qty, 0) : 0;
                  const age = Math.max(0, Math.round((Date.now() - new Date(hc.createdAt).getTime()) / 60000));
                  return (
                    <div key={hc.id} className="border border-lavender-deep rounded-[12px] p-3 bg-lavender/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-medium text-purple truncate">{hc.label}</span>
                        <span className="text-[13px] font-medium shrink-0">{formatTaka(t)}</span>
                      </div>
                      <div className="text-[12px] text-body-soft mt-0.5">
                        {p ? `${items} item(s)${p.isGift ? " · gift" : ""}${p.customerPhone ? ` · ${p.customerPhone}` : ""}` : "cannot be read"}
                        {" · "}{age < 1 ? "just now" : `${age} min ago`}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => resumeSale(hc)} disabled={!p || heldBusy}
                          className="flex-1 py-2 rounded-[10px] bg-purple text-white font-medium text-[12.5px] disabled:opacity-40">Recall</button>
                        <button type="button" onClick={() => dropHeld(hc.id)} disabled={heldBusy}
                          className="px-3 py-2 rounded-[10px] border border-lavender-deep text-body-soft font-medium text-[12.5px] disabled:opacity-40">Drop</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== change to hand back (audit §3 #11) ===== */}
      {/*  The sale is saved and the bill exists; what is on the screen now is the
           one thing still to do at the counter. The figure is the SERVER's
           `changePaisa` — the same number stored on the order, so a reprint says
           what this slip said.  */}
      {change && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4">
          <div className="bg-white rounded-[18px] shadow-lift p-6 w-full max-w-[340px] text-center">
            <div className="w-[46px] h-[46px] rounded-full bg-[var(--s-ok)] grid place-items-center mx-auto mb-3 text-[var(--t-ok)]"><Icon name="check" size={24} /></div>
            <h3 className="font-display text-[19px] text-purple m-0">Sale complete</h3>
            <p className="text-[12.5px] text-body-soft mt-1 mb-3">Bill {change.no}</p>
            <div className="rounded-[14px] px-4 py-4 mb-2" style={{ background: "var(--s-ok)" }}>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--t-ok)]">Hand back</div>
              <div className="font-display text-[34px] font-semibold text-[var(--t-ok)] leading-[1.2]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatTaka(change.changePaisa)}
              </div>
            </div>
            {change.duePaisa > 0 && (
              <p className="text-[12.5px] text-[var(--t-warn)] mb-2">{formatTaka(change.duePaisa)} still owed on this bill.</p>
            )}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => { const id = change.saleId; setChange(null); router.push(`/pos/sale/${id}`); }}
                className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-medium text-[13px]">Open the bill</button>
              <button type="button" autoFocus onClick={() => setChange(null)}
                className="flex-1 py-2.5 rounded-[11px] bg-purple text-white font-medium text-[13px]">Given {"·"} next sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

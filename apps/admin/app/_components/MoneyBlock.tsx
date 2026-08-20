"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { formatTaka } from "../_data/api";

/*
  The money half of any screen that takes money — POS today, purchases, due
  collection and returns next (owner, 21 Aug: "ai same system amder pura system
  r sob jaygay bosbe joto jaygay payment ar kahini ache").

  Four things bend a bill, and they are four different kinds of thing, so they
  each get their own row and their own logic (owner, 21 Aug):

    Discount            taka OFF, or a percent of the subtotal
    Additional charge   a NAMED extra the customer pays for (delivery, wrapping);
                        as many as needed, each with its own words and amount
    Adjustment          the nameless ± on the bill (round-off)
    VAT                 tax, worked out on everything above

  DEC-POS-015 keeps ONE adjustment number in the order, so charges + adjustment
  are added together on the way to the server and the names travel in the note.
  Nothing about the API changes — this is how the screen asks, not how it stores.
*/

export interface ChargeRow {
  id: string;
  label: string;
  amountTaka: number;
}

export type DiscountMode = "amt" | "pct";

export interface MoneyInput {
  subtotalPaisa: number;
  discountMode: DiscountMode;
  discountInput: number;
  charges: ChargeRow[];
  adjSign: 1 | -1;
  adjustmentTaka: number;
  taxRate: number;
}

export interface MoneySum {
  discountPaisa: number;
  chargesPaisa: number;
  adjustmentPaisa: number;
  /** what the server stores as ONE adjustment (DEC-POS-015) */
  extraPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  discountPct: number;
}

export function computeMoney(m: MoneyInput): MoneySum {
  const discountPaisa = Math.min(
    m.discountMode === "pct"
      ? Math.round((m.subtotalPaisa * Math.min(100, Math.max(0, m.discountInput))) / 100)
      : Math.round(Math.max(0, m.discountInput)) * 100,
    m.subtotalPaisa,
  );
  const chargesPaisa = m.charges.reduce((s, c) => s + Math.round(Math.max(0, c.amountTaka)) * 100, 0);
  const adjustmentPaisa = m.adjSign * Math.round(Math.abs(m.adjustmentTaka)) * 100;
  const extraPaisa = chargesPaisa + adjustmentPaisa;
  const base = Math.max(0, m.subtotalPaisa - discountPaisa + extraPaisa);
  const vatPaisa = Math.round((base * m.taxRate) / 100);
  return {
    discountPaisa,
    chargesPaisa,
    adjustmentPaisa,
    extraPaisa,
    vatPaisa,
    totalPaisa: base + vatPaisa,
    discountPct: m.subtotalPaisa ? (discountPaisa / m.subtotalPaisa) * 100 : 0,
  };
}

/** the words that travel with the money, so a bill can be read back later */
export function chargeNote(charges: ChargeRow[], adjustmentPaisa: number): string {
  const parts = charges
    .filter((c) => c.amountTaka > 0)
    .map((c) => `${c.label.trim() || "Additional charge"} ${formatTaka(Math.round(c.amountTaka) * 100)}`);
  if (adjustmentPaisa !== 0) parts.push(`Adjustment ${adjustmentPaisa < 0 ? "−" : "+"} ${formatTaka(Math.abs(adjustmentPaisa))}`);
  return parts.join(" · ");
}

/* ---------------------------------------------------------------- payments */

/*  A method is whatever the screen calls it — the counter says "Cash", the
    purchase API says "CASH". The block does not care; it carries the id it was
    given straight back out.  */
export interface PayOption { id: string; label: string }
export const COUNTER_METHODS: PayOption[] = [
  { id: "Cash", label: "Cash" },
  { id: "bKash", label: "bKash" },
  { id: "Nagad", label: "Nagad" },
  { id: "Card", label: "Card" },
];

export interface PayRow {
  id: string;
  method: string;
  amountPaisa: number;
  /** typed by hand. An untyped row carries whatever is still unpaid. */
  touched?: boolean;
}

const firstRow = (method: string): PayRow[] => [{ id: `pay-${Date.now()}`, method, amountPaisa: 0 }];

/**
 * Money coming IN. The rows balance themselves: what was typed stands, and the
 * first untyped row carries the rest — so one method is one press, and splitting
 * is "type 600 in the second line".
 */
export function usePayRows(totalPaisa: number, defaultMethod = "Cash") {
  const [pays, setPays] = useState<PayRow[]>(() => firstRow(defaultMethod));

  useEffect(() => {
    setPays((p) => {
      const typed = p.reduce((s, r) => s + (r.touched ? r.amountPaisa : 0), 0);
      const rest = Math.max(0, totalPaisa - typed);
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
  }, [totalPaisa, pays]);

  const paidPaisa = pays.reduce((s, r) => s + r.amountPaisa, 0);
  const cashPaisa = pays.filter((r) => r.method.toLowerCase() === "cash").reduce((s, r) => s + r.amountPaisa, 0);
  const duePaisa = Math.max(0, totalPaisa - paidPaisa);
  const changePaisa = paidPaisa > totalPaisa && cashPaisa > 0 ? Math.min(cashPaisa, paidPaisa - totalPaisa) : 0;

  return {
    pays,
    setPays,
    paidPaisa,
    cashPaisa,
    duePaisa,
    changePaisa,
    /** paid over the bill with no cash in it — nothing to hand back */
    overpaidNoChange: paidPaisa > totalPaisa && changePaisa === 0,
    setMethod: (id: string, method: string) => setPays((p) => p.map((r) => (r.id === id ? { ...r, method } : r))),
    setAmount: (id: string, amountPaisa: number) =>
      setPays((p) => p.map((r) => (r.id === id ? { ...r, amountPaisa: Math.max(0, amountPaisa), touched: true } : r))),
    addRow: () => setPays((p) => [...p, { id: `pay-${Date.now()}`, method: defaultMethod, amountPaisa: 0 }]),
    removeRow: (id: string) => setPays((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : p)),
    takeTheRest: () => setPays((p) => p.map((r, i) => (i === p.length - 1 ? { ...r, amountPaisa: r.amountPaisa + Math.max(0, totalPaisa - paidPaisa), touched: true } : r))),
    reset: () => setPays(firstRow(defaultMethod)),
  };
}

/* ------------------------------------------------------------------- looks */

/*  NOTE: .ipt sets width:100% and loads after Tailwind, so a w-[..] class on an
    input is silently ignored — every fixed width here has to be inline.  */
interface Tone {
  label: string;
  value: string;
  faint: string;
  line: string;
  chip: string;
}
const DARK: Tone = {
  label: "text-[#c9a6e4]",
  value: "text-white",
  faint: "text-[#a98ac4]",
  line: "border-white/15",
  chip: "text-[#e7d8f2] border-white/25 hover:bg-white/10",
};
const LIGHT: Tone = {
  label: "text-body-soft",
  value: "text-purple",
  faint: "text-body-soft",
  line: "border-lavender-deep",
  chip: "text-purple border-lavender-deep hover:bg-lavender/60",
};

export interface MoneyBlockProps extends MoneyInput {
  sum: MoneySum;
  tone?: "dark" | "light";
  /** which doors this screen has room for; default is all four */
  doors?: Door[];
  /**
   * How the money is arranged. Both were drawn for the owner on 21 Aug and he
   * asked to see them live before choosing:
   *   "board" (F) — a big total board, then the four as quiet rows
   *   "cards" (G) — the bill in one card, the four as buttons in another
   */
  layout?: "board" | "cards";
  taxRates: { label: string; value: number }[];
  onDiscount: (v: number) => void;
  onDiscountMode: (m: DiscountMode) => void;
  onCharges: (c: ChargeRow[]) => void;
  onAdjSign: (s: 1 | -1) => void;
  onAdjustment: (v: number) => void;
  onTaxRate: (v: number) => void;
}

export type Door = "discount" | "charge" | "adjust" | "vat";

/**
 * The bill, option D (owner picked it 21 Aug and it stays): the total is the
 * loudest thing on the screen, and the four things that bend it sit under it as
 * four small doors that open only when they are needed. Nothing above the total.
 */
/**
 * The bill — layout F (owner picked it 21 Aug): the total is a board at the top
 * of the panel, and the four things that bend it are four quiet rows under it.
 * A row opens its own small editor in place. Money only: no item names, no
 * customer — those live on the white bill beside this panel.
 */
export function MoneyBlock(p: MoneyBlockProps) {
  const t = p.tone === "light" ? LIGHT : DARK;
  const [door, setDoor] = useState<Door | null>(null);
  const chargesOn = p.sum.chargesPaisa !== 0 || p.charges.length > 0;

  const all: [Door, string, string][] = [
    ["discount", "Discount", p.sum.discountPaisa > 0 ? `− ${formatTaka(p.sum.discountPaisa)}` : "—"],
    ["charge", "Charge", chargesOn ? `+ ${formatTaka(p.sum.chargesPaisa)}` : "—"],
    ["adjust", "Adjustment", p.sum.adjustmentPaisa !== 0 ? `${p.sum.adjustmentPaisa < 0 ? "−" : "+"} ${formatTaka(Math.abs(p.sum.adjustmentPaisa))}` : "—"],
    ["vat", "VAT", p.sum.vatPaisa > 0 ? `+ ${formatTaka(p.sum.vatPaisa)}` : "—"],
  ];
  const rows = p.doors ? all.filter(([id]) => p.doors!.includes(id)) : all;

  const cards = p.layout === "cards";
  const rowCls = "w-full flex items-center justify-between gap-2 py-2.5 text-left border-b " + t.line;
  const editor = "pb-3 flex items-center gap-1.5 flex-wrap";
  const cardCls = "rounded-[12px] px-3 py-3";
  const cardBg = { background: p.tone === "light" ? "#f6f2fa" : "rgba(255,255,255,.07)" };

  return (
    <div>
      {/*  the board: the one number the shop and the customer both look at  */}
      <div className={cards ? cardCls + " text-center" : "rounded-[12px] px-3 py-4 text-center"}
        style={cards ? cardBg : { background: p.tone === "light" ? "#f6f2fa" : "rgba(255,255,255,.09)" }}>
        <div className={`text-[10.5px] uppercase tracking-[0.08em] font-medium ${t.label}`}>Grand total</div>
        <div className={`font-semibold font-display text-[38px] leading-[1.15] ${t.value}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(p.sum.totalPaisa)}
        </div>
        <div className={`text-[11px] mt-0.5 ${t.faint}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(p.subtotalPaisa)}
          {p.sum.discountPaisa > 0 && <span> − {formatTaka(p.sum.discountPaisa)}</span>}
          {p.sum.chargesPaisa > 0 && <span> + {formatTaka(p.sum.chargesPaisa)}</span>}
          {p.sum.adjustmentPaisa !== 0 && <span> {p.sum.adjustmentPaisa < 0 ? "−" : "+"} {formatTaka(Math.abs(p.sum.adjustmentPaisa))}</span>}
          {p.sum.vatPaisa > 0 && <span> + VAT {formatTaka(p.sum.vatPaisa)}</span>}
        </div>
      </div>

      <div className={cards ? cardCls + " mt-3" : "mt-3"} style={cards ? cardBg : undefined}>
        {cards && <div className={`text-[10.5px] uppercase tracking-[0.08em] font-medium ${t.label} pb-2`}>Change the bill</div>}
        {cards && (
          <div className="grid grid-cols-2 gap-1.5 pb-1">
            {rows.map(([id, label, value]) => (
              <button key={id} type="button" onClick={() => setDoor((d) => (d === id ? null : id))}
                className={"rounded-[9px] px-2 py-2 text-[12px] font-medium border " + (door === id
                  ? (p.tone === "light" ? "bg-lavender border-orchid-mid text-purple" : "bg-white/20 border-white/50 text-white")
                  : t.chip)}>
                {label}
                {value !== "—" && <span className="block text-[11px] font-normal opacity-80" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>}
              </button>
            ))}
          </div>
        )}
        {!cards && rows.map(([id, label, value]) => (
          <div key={id}>
            <button type="button" onClick={() => setDoor((d) => (d === id ? null : id))} className={rowCls}>
              <span className={`text-[12.5px] ${door === id ? t.value : t.label}`}>{label}</span>
              <span className={`text-[12.5px] shrink-0 inline-flex items-center gap-1.5 ${value === "—" ? t.faint : t.value}`}
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {value}<Icon name={door === id ? "chevronDown" : "plus"} size={12} />
              </span>
            </button>

            {door === id && id === "discount" && (
              <div className={editor}>
                <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 88 }} autoFocus
                  value={p.discountInput || ""} placeholder="0"
                  onChange={(e) => p.onDiscount(Math.max(0, Number(e.target.value)))} />
                <select className="ipt h-[36px] text-[12.5px]" style={{ width: 62, paddingLeft: 8, paddingRight: 4 }}
                  value={p.discountMode} onChange={(e) => p.onDiscountMode(e.target.value === "pct" ? "pct" : "amt")}>
                  <option value="amt">৳</option>
                  <option value="pct">%</option>
                </select>
                <span className={`text-[11.5px] ${t.faint}`}>off the bill</span>
              </div>
            )}

            {door === id && id === "charge" && (
              <div className="pb-3">
                {p.charges.map((c) => (
                  <div className="flex items-center gap-1.5 mb-1.5" key={c.id}>
                    <input className="ipt h-[36px] text-[12.5px] flex-1 min-w-0" placeholder="What is this charge for?"
                      value={c.label}
                      onChange={(e) => p.onCharges(p.charges.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} />
                    <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 82 }}
                      value={c.amountTaka || ""} placeholder="0"
                      onChange={(e) => p.onCharges(p.charges.map((x) => (x.id === c.id ? { ...x, amountTaka: Math.max(0, Number(e.target.value)) } : x)))} />
                    <button type="button" title="Remove this charge" className={`shrink-0 ${t.label} hover:text-[#ff9b9b]`}
                      onClick={() => p.onCharges(p.charges.filter((x) => x.id !== c.id))}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => p.onCharges([...p.charges, { id: `chg-${Date.now()}`, label: "", amountTaka: 0 }])}
                  className={`text-[11.5px] font-medium border rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 ${t.chip}`}>
                  <Icon name="plus" size={12} /> {p.charges.length ? "One more charge" : "Add a charge"}
                </button>
              </div>
            )}

            {door === id && id === "adjust" && (
              <div className={editor}>
                <select className="ipt h-[36px] text-[13px]" style={{ width: 62, paddingLeft: 8, paddingRight: 4 }}
                  value={p.adjSign} onChange={(e) => p.onAdjSign(Number(e.target.value) === -1 ? -1 : 1)}>
                  <option value={1}>+</option>
                  <option value={-1}>−</option>
                </select>
                <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 88 }} autoFocus
                  value={p.adjustmentTaka || ""} placeholder="0"
                  onChange={(e) => p.onAdjustment(Math.abs(Number(e.target.value)))} />
                <span className={`text-[11.5px] ${t.faint}`}>round-off</span>
              </div>
            )}

            {door === id && id === "vat" && (
              <div className={editor}>
                <select className="ipt h-[36px] text-[12.5px]" style={{ width: 140, paddingLeft: 10, paddingRight: 4 }}
                  value={p.taxRate} onChange={(e) => p.onTaxRate(Number(e.target.value))}>
                  {p.taxRates.map((r) => (<option key={r.label} value={r.value}>{r.label}</option>))}
                </select>
                <span className={`text-[11.5px] ${t.faint}`}>on everything above</span>
              </div>
            )}
          </div>
        ))}

        {cards && rows.filter(([id]) => id === door).map(([id]) => (
          <div key={id} className="pt-1">
            {id === "discount" && (
              <div className={editor}>
                <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 88 }} autoFocus
                  value={p.discountInput || ""} placeholder="0"
                  onChange={(e) => p.onDiscount(Math.max(0, Number(e.target.value)))} />
                <select className="ipt h-[36px] text-[12.5px]" style={{ width: 62, paddingLeft: 8, paddingRight: 4 }}
                  value={p.discountMode} onChange={(e) => p.onDiscountMode(e.target.value === "pct" ? "pct" : "amt")}>
                  <option value="amt">৳</option>
                  <option value="pct">%</option>
                </select>
                <span className={`text-[11.5px] ${t.faint}`}>off the bill</span>
              </div>
            )}
            {id === "charge" && (
              <div className="pb-1">
                {p.charges.map((c) => (
                  <div className="flex items-center gap-1.5 mb-1.5" key={c.id}>
                    <input className="ipt h-[36px] text-[12.5px] flex-1 min-w-0" placeholder="What is this charge for?"
                      value={c.label}
                      onChange={(e) => p.onCharges(p.charges.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} />
                    <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 82 }}
                      value={c.amountTaka || ""} placeholder="0"
                      onChange={(e) => p.onCharges(p.charges.map((x) => (x.id === c.id ? { ...x, amountTaka: Math.max(0, Number(e.target.value)) } : x)))} />
                    <button type="button" title="Remove this charge" className={`shrink-0 ${t.label} hover:text-[#ff9b9b]`}
                      onClick={() => p.onCharges(p.charges.filter((x) => x.id !== c.id))}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => p.onCharges([...p.charges, { id: `chg-${Date.now()}`, label: "", amountTaka: 0 }])}
                  className={`text-[11.5px] font-medium border rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 ${t.chip}`}>
                  <Icon name="plus" size={12} /> {p.charges.length ? "One more charge" : "Add a charge"}
                </button>
              </div>
            )}
            {id === "adjust" && (
              <div className={editor}>
                <select className="ipt h-[36px] text-[13px]" style={{ width: 62, paddingLeft: 8, paddingRight: 4 }}
                  value={p.adjSign} onChange={(e) => p.onAdjSign(Number(e.target.value) === -1 ? -1 : 1)}>
                  <option value={1}>+</option>
                  <option value={-1}>−</option>
                </select>
                <input type="number" min={0} className="ipt h-[36px] text-[13px] text-right" style={{ width: 88 }} autoFocus
                  value={p.adjustmentTaka || ""} placeholder="0"
                  onChange={(e) => p.onAdjustment(Math.abs(Number(e.target.value)))} />
                <span className={`text-[11.5px] ${t.faint}`}>round-off</span>
              </div>
            )}
            {id === "vat" && (
              <div className={editor}>
                <select className="ipt h-[36px] text-[12.5px]" style={{ width: 140, paddingLeft: 10, paddingRight: 4 }}
                  value={p.taxRate} onChange={(e) => p.onTaxRate(Number(e.target.value))}>
                  {p.taxRates.map((r) => (<option key={r.label} value={r.value}>{r.label}</option>))}
                </select>
                <span className={`text-[11.5px] ${t.faint}`}>on everything above</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface PaymentLinesProps {
  pay: ReturnType<typeof usePayRows>;
  tone?: "dark" | "light";
  /** the methods THIS screen knows; ids go straight to its own API */
  methods?: PayOption[];
  /** words above the list — "Payment" at the till, "Paid now" on a bill */
  title?: string;
  /** how tall the list may grow before it scrolls on its own */
  maxHeight?: number;
  /** take whatever height is left in a flex column and scroll inside it */
  fill?: boolean;
}

export function PaymentLines({ pay, tone, maxHeight = 148, fill, methods = COUNTER_METHODS, title = "Payment" }: PaymentLinesProps) {
  const t = tone === "light" ? LIGHT : DARK;
  return (
    <div className={fill ? "flex flex-col min-h-0 h-full" : ""}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[12.5px] font-medium ${t.label}`}>{title}</span>
        {pay.duePaisa > 0 && pay.paidPaisa > 0 && (
          <button type="button" onClick={pay.takeTheRest} className={`text-[11.5px] underline ${t.label}`}>
            take the rest ({formatTaka(pay.duePaisa)})
          </button>
        )}
      </div>

      {/*  scrollbar-gutter keeps the width steady, so the panel does not jump a
           pixel sideways when a row is added (owner, 21 Aug: it shook)  */}
      <div className={"flex flex-col gap-2 overflow-y-auto " + (fill ? "flex-1 min-h-0" : "")}
        style={{ maxHeight: fill ? undefined : maxHeight, minHeight: fill ? 44 : undefined, scrollbarGutter: "stable" }}>
        {pay.pays.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <select className="ipt h-[40px] flex-1 min-w-0 text-[13px]" value={r.method}
              onChange={(e) => pay.setMethod(r.id, e.target.value)}>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <span className="relative shrink-0" style={{ width: 108 }}>
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-body-soft">৳</span>
              <input type="number" min={0} inputMode="numeric"
                className="ipt h-[40px] w-full text-[16px] font-semibold text-right"
                style={{ paddingLeft: 22, fontVariantNumeric: "tabular-nums" }}
                value={r.amountPaisa ? Math.round(r.amountPaisa / 100) : ""} placeholder="0"
                onChange={(e) => pay.setAmount(r.id, Number(e.target.value) * 100)} />
            </span>
            <button type="button" onClick={() => pay.removeRow(r.id)} title="Remove this payment"
              className={`shrink-0 ${t.label} hover:text-[#ff9b9b] ${pay.pays.length > 1 ? "" : "invisible"}`}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={pay.addRow}
        className={`mt-2 shrink-0 self-start text-[12px] font-medium border rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 ${t.chip}`}>
        <Icon name="plus" size={12} /> Add payment method
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { formatTaka, listPaymentMethods, type ApiPaymentMethod } from "../_data/api";

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
export interface PayOption {
  id: string;
  label: string;
  /** DEC-GBL-006 — the accounts under this method; asked for only when >1 */
  accounts?: { id: string; label: string }[];
}
export const COUNTER_METHODS: PayOption[] = [
  { id: "Cash", label: "Cash" },
  { id: "bKash", label: "bKash" },
  { id: "Nagad", label: "Nagad" },
  { id: "Card", label: "Card" },
];

/*  DEC-GBL-001 — the shop's own list, read once and shared by every money
    screen. `only` narrows it to the codes a screen can actually store: the
    counter has four tenders, the buying side six. Off in Setup = gone here,
    and the server refuses it as well, so a stale tab cannot slip one past.  */
/** the four a counter drawer can hold, and the six a bill can be paid by */
export const TILL_TENDERS = ["CASH", "BKASH", "NAGAD", "CARD"];
export const BILL_TENDERS = ["CASH", "BKASH", "NAGAD", "CARD", "BANK", "OTHER"];

export function usePaymentMethods(only?: string[]): PayOption[] {
  const [rows, setRows] = useState<ApiPaymentMethod[] | null>(null);
  useEffect(() => { listPaymentMethods().then(setRows).catch(() => setRows(null)); }, []);
  return useMemo(() => {
    if (!rows?.length) {
      // the list could not be read — offer the built-in four rather than nothing
      return only ? COUNTER_METHODS.filter((m) => only.includes(m.id.toUpperCase())) : COUNTER_METHODS;
    }
    return rows
      .filter((r) => r.isActive && (!only || only.includes(r.code.toUpperCase())))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        id: r.code,
        label: r.name,
        accounts: (r.accounts ?? [])
          .filter((a) => a.isActive)
          .map((a) => ({ id: a.id, label: a.accountRef ? `${a.name} · ${a.accountRef}` : a.name })),
      }));
  }, [rows, only]);
}

export interface PayRow {
  id: string;
  method: string;
  /** DEC-GBL-006 — which account took it, when the method has more than one */
  accountId?: string;
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
    /*  changing the method drops the account with it — an account belongs to
        exactly one method, and a stale id is how money lands in the wrong book  */
    setMethod: (id: string, method: string) =>
      setPays((p) => p.map((r) => (r.id === id ? { ...r, method, accountId: undefined } : r))),
    setAccount: (id: string, accountId: string) =>
      setPays((p) => p.map((r) => (r.id === id ? { ...r, accountId } : r))),
    setAmount: (id: string, amountPaisa: number) =>
      setPays((p) => p.map((r) => (r.id === id ? { ...r, amountPaisa: Math.max(0, amountPaisa), touched: true } : r))),
    addRow: () => setPays((p) => [...p, { id: `pay-${Date.now()}`, method: defaultMethod, amountPaisa: 0 }]),
    removeRow: (id: string) => setPays((p) => (p.length > 1 ? p.filter((r) => r.id !== id) : p)),
    takeTheRest: () => setPays((p) => p.map((r, i) => (i === p.length - 1 ? { ...r, amountPaisa: r.amountPaisa + Math.max(0, totalPaisa - paidPaisa), touched: true } : r))),
    reset: () => setPays(firstRow(defaultMethod)),
  };
}

/*  ৳ with paisa — the old input printed Math.round(amount/100), so ৳29.80
    could neither be typed nor survive a redraw (owner, 21 Aug: "poysa bosano
    jay na… bisal gap"). The text is buffered while the field has focus, so a
    half-typed "29." is not snatched away mid-keystroke.  */
export function TakaInput({ valuePaisa, onPaisa, className, style, placeholder = "0", autoFocus }: {
  valuePaisa: number;
  onPaisa: (paisa: number) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const fmt = (pz: number) => (pz ? (pz % 100 === 0 ? String(pz / 100) : (pz / 100).toFixed(2)) : "");
  const [txt, setTxt] = useState(fmt(valuePaisa));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setTxt(fmt(valuePaisa)); }, [valuePaisa, focused]);
  return (
    <input type="text" inputMode="decimal" className={className} style={style}
      value={txt} placeholder={placeholder} autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setTxt(fmt(valuePaisa)); }}
      onChange={(e) => {
        const v = e.target.value.replace(/,/g, "");
        if (!/^\d*\.?\d{0,2}$/.test(v)) return; // digits and at most two paisa places
        setTxt(v);
        onPaisa(Math.round((parseFloat(v) || 0) * 100));
      }} />
  );
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
/**
 * The bill — layout G, the house style (owner picked it 21 Aug, and it goes on
 * every screen that takes money): the total in one card, the four things that
 * bend it as four buttons in another, each opening its own small editor.
 * Money only — item names and the customer live on the white bill beside it.
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

  const card = "rounded-[12px] px-3 py-3";
  const cardBg = { background: p.tone === "light" ? "#f6f2fa" : "rgba(255,255,255,.07)" };
  const editor = "pt-2 flex items-center gap-1.5 flex-wrap";

  return (
    <div>
      <div className={card + " text-center"} style={cardBg}>
        <div className={`text-[10.5px] uppercase tracking-[0.08em] font-medium ${t.label}`}>Grand total</div>
        <div className={`font-semibold font-display text-[34px] leading-[1.2] ${t.value}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(p.sum.totalPaisa)}
        </div>
        <div className={`text-[11px] ${t.faint}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(p.subtotalPaisa)}
          {p.sum.discountPaisa > 0 && <span> − {formatTaka(p.sum.discountPaisa)}</span>}
          {p.sum.chargesPaisa > 0 && <span> + {formatTaka(p.sum.chargesPaisa)}</span>}
          {p.sum.adjustmentPaisa !== 0 && <span> {p.sum.adjustmentPaisa < 0 ? "−" : "+"} {formatTaka(Math.abs(p.sum.adjustmentPaisa))}</span>}
          {p.sum.vatPaisa > 0 && <span> + VAT {formatTaka(p.sum.vatPaisa)}</span>}
        </div>
      </div>

      <div className={card + " mt-3"} style={cardBg}>
        <div className={`text-[10.5px] uppercase tracking-[0.08em] font-medium ${t.label} pb-2`}>Change the bill</div>
        <div className="grid grid-cols-2 gap-1.5">
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

        {door === "discount" && (
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

        {door === "charge" && (
          <div className="pt-2">
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

        {door === "adjust" && (
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

        {door === "vat" && (
          <div className={editor}>
            <select className="ipt h-[36px] text-[12.5px]" style={{ width: 140, paddingLeft: 10, paddingRight: 4 }}
              value={p.taxRate} onChange={(e) => p.onTaxRate(Number(e.target.value))}>
              {p.taxRates.map((r) => (<option key={r.label} value={r.value}>{r.label}</option>))}
            </select>
            <span className={`text-[11.5px] ${t.faint}`}>on everything above</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Where the money stands, in two halves you can read across a counter: what has
 * been taken, and what is still owed (or handed back). The old one-line strip
 * was too quiet to trust with a due (owner, 21 Aug).
 */
export function MoneyResult({ pay, totalPaisa, tone, dueLabel = "Due — collect later", settledLabel = "Nothing left to take" }: {
  pay: ReturnType<typeof usePayRows>;
  totalPaisa: number;
  tone?: "dark" | "light";
  /** the counter collects a due; a purchase OWES one — same shape, other words */
  dueLabel?: string;
  settledLabel?: string;
}) {
  const t = tone === "light" ? LIGHT : DARK;
  const due = pay.duePaisa > 0;
  const change = pay.changePaisa > 0;
  const over = pay.overpaidNoChange;

  const right = due
    ? { label: dueLabel, value: formatTaka(pay.duePaisa), fg: "#f0b46a", bg: "rgba(240,180,106,.14)" }
    : change
      ? { label: "Change to give", value: formatTaka(pay.changePaisa), fg: "#7fe0a8", bg: "rgba(127,224,168,.14)" }
      : over
        ? { label: "Overpaid — reduce", value: formatTaka(pay.paidPaisa - totalPaisa), fg: "#f0b46a", bg: "rgba(240,180,106,.14)" }
        : { label: settledLabel, value: "৳ 0", fg: "#7fe0a8", bg: "rgba(127,224,168,.14)" };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-[12px] px-3 py-2.5" style={{ background: tone === "light" ? "#f6f2fa" : "rgba(255,255,255,.07)" }}>
        <div className={`text-[10.5px] uppercase tracking-[0.08em] font-medium ${t.label}`}>Paid</div>
        <div className={`text-[19px] font-semibold font-display ${t.value}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(pay.paidPaisa)}
        </div>
      </div>
      <div className="rounded-[12px] px-3 py-2.5" style={{ background: right.bg }}>
        <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium truncate" style={{ color: right.fg }}>{right.label}</div>
        <div className="text-[19px] font-semibold font-display" style={{ color: right.fg, fontVariantNumeric: "tabular-nums" }}>
          {right.value}
        </div>
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
        {pay.pays.map((r) => {
          /*  DEC-GBL-006 — one bKash number, no question; three, and the row
              has to say which one, or nobody can reconcile the statement.  */
          const accounts = methods.find((m) => m.id === r.method)?.accounts ?? [];
          return (
            <div key={r.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <select className="ipt h-[40px] flex-1 min-w-0 text-[13px]" value={r.method}
                  onChange={(e) => pay.setMethod(r.id, e.target.value)}>
                  {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <span className="relative shrink-0" style={{ width: 118 }}>
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-body-soft">৳</span>
                  <TakaInput valuePaisa={r.amountPaisa} onPaisa={(pz) => pay.setAmount(r.id, pz)}
                    className="ipt h-[40px] w-full text-[16px] font-semibold text-right"
                    style={{ paddingLeft: 22, fontVariantNumeric: "tabular-nums" }} />
                </span>
                <button type="button" onClick={() => pay.removeRow(r.id)} title="Remove this payment"
                  className={`shrink-0 ${t.label} hover:text-[#ff9b9b] ${pay.pays.length > 1 ? "" : "invisible"}`}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              {accounts.length > 1 && (
                <select className="ipt h-[34px] text-[12.5px]" value={r.accountId ?? ""}
                  onChange={(e) => pay.setAccount(r.id, e.target.value)}>
                  <option value="">Which account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={pay.addRow}
        className={`mt-2 shrink-0 self-start text-[12px] font-medium border rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 ${t.chip}`}>
        <Icon name="plus" size={12} /> Add payment method
      </button>
    </div>
  );
}

/**
 * One dialog for every "hand over some money against a balance" — collecting a
 * customer's due, paying a supplier's bill, refunding a return (CLAUDE.md §14).
 * Always the same shape: what is owed, how much is being handed over and by
 * which methods, and what is left after.
 */
export function PayDialog({
  title, who, owedPaisa, owedLabel = "Owed", pay, methods, busy, error,
  confirmLabel = "Take", leftLabel = "Taking", dueAfterLabel = "Still owed after this",
  clearedLabel = "Cleared", note, onConfirm, onClose,
}: {
  title: string;
  who?: string;
  owedPaisa: number;
  owedLabel?: string;
  pay: ReturnType<typeof usePayRows>;
  methods?: PayOption[];
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  leftLabel?: string;
  dueAfterLabel?: string;
  clearedLabel?: string;
  /** a line of small print under the owed card — bills, dates, a reason */
  note?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const taking = Math.min(pay.paidPaisa, owedPaisa);
  const left = owedPaisa - taking;
  const tooMuch = pay.paidPaisa > owedPaisa;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(40,20,50,.45)" }}
      onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-[16px] text-white shadow-lift overflow-hidden"
        style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">{title}</div>
            {who && <div className="text-[14px] font-medium truncate">{who}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-[#c9a6e4] text-[22px] leading-none px-1 shrink-0">×</button>
        </div>

        <div className="px-4">
          <div className="rounded-[12px] px-3 py-3 text-center" style={{ background: "rgba(255,255,255,.07)" }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">{owedLabel}</div>
            <div className="text-[32px] font-semibold font-display leading-[1.2]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTaka(owedPaisa)}
            </div>
            {note && <div className="text-[11px] text-[#a98ac4]">{note}</div>}
          </div>

          <div className="rounded-[12px] px-3 py-3 mt-3" style={{ background: "rgba(255,255,255,.07)" }}>
            <PaymentLines pay={pay} methods={methods} title={leftLabel} maxHeight={148} />
          </div>
        </div>

        <div className="p-4 pt-3 mt-3 border-t border-white/15">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[12px] px-3 py-2.5" style={{ background: "rgba(255,255,255,.07)" }}>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">{leftLabel}</div>
              <div className="text-[19px] font-semibold font-display" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(taking)}</div>
            </div>
            <div className="rounded-[12px] px-3 py-2.5"
              style={{ background: left > 0 ? "rgba(240,180,106,.14)" : "rgba(127,224,168,.14)" }}>
              <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium truncate" style={{ color: left > 0 ? "#f0b46a" : "#7fe0a8" }}>
                {left > 0 ? dueAfterLabel : clearedLabel}
              </div>
              <div className="text-[19px] font-semibold font-display" style={{ color: left > 0 ? "#f0b46a" : "#7fe0a8", fontVariantNumeric: "tabular-nums" }}>
                {formatTaka(left)}
              </div>
            </div>
          </div>

          {tooMuch && <p className="text-[12px] text-[#ff9b9b] mt-2 mb-0">Cannot be more than {formatTaka(owedPaisa)}.</p>}
          {error && <div className="mt-2 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{error}</div>}

          <div className="flex gap-2 mt-3">
            <button type="button" onClick={onClose}
              className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 hover:bg-white/20">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={busy || taking <= 0 || tooMuch}
              className="flex-1 bg-white hover:bg-[#f4ecf9] text-purple text-[14.5px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 shadow-soft disabled:opacity-40">
              <Icon name="check" size={17} /> {busy ? "Working…" : `${confirmLabel} · ${formatTaka(taking)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Money going OUT against a return (CLAUDE.md §14). Not a split: the server
 * decides the payout and caps it at what was collected (DEC-RTN-008), so the
 * only questions are which way it goes back and what to write against it.
 */
export function RefundDialog({
  title, who, amountPaisa, amountLabel = "Refund", note, methods, method, onMethod,
  accountId, onAccount,
  reference, onReference, busy, error, confirmLabel = "Pay out", onConfirm, onClose,
}: {
  title: string;
  who?: string;
  amountPaisa: number;
  amountLabel?: string;
  note?: string;
  methods: PayOption[];
  method: string;
  onMethod: (id: string) => void;
  /** DEC-GBL-006 — which account the money leaves from, when there is a choice */
  accountId?: string;
  onAccount?: (id: string) => void;
  reference: string;
  onReference: (v: string) => void;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(40,20,50,.45)" }}
      onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-[16px] text-white shadow-lift overflow-hidden"
        style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">{title}</div>
            {who && <div className="text-[14px] font-medium truncate">{who}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-[#c9a6e4] text-[22px] leading-none px-1 shrink-0">×</button>
        </div>

        <div className="px-4">
          <div className="rounded-[12px] px-3 py-3 text-center" style={{ background: "rgba(255,255,255,.07)" }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">{amountLabel}</div>
            <div className="text-[32px] font-semibold font-display leading-[1.2]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTaka(amountPaisa)}
            </div>
            {note && <div className="text-[11px] text-[#a98ac4]">{note}</div>}
          </div>

          <div className="rounded-[12px] px-3 py-3 mt-3" style={{ background: "rgba(255,255,255,.07)" }}>
            <div className="text-[12.5px] font-medium text-[#c9a6e4] mb-1.5">How it goes back</div>
            <select className="ipt h-[40px] text-[13px]" value={method}
              onChange={(e) => { onMethod(e.target.value); onAccount?.(""); }}>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {(() => {
              const accounts = methods.find((m) => m.id === method)?.accounts ?? [];
              if (accounts.length < 2 || !onAccount) return null;
              return (
                <select className="ipt h-[36px] text-[12.5px] mt-2" value={accountId ?? ""}
                  onChange={(e) => onAccount(e.target.value)}>
                  <option value="">Which account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              );
            })()}
            <input className="ipt h-[38px] text-[12.5px] mt-2" placeholder="Reference — bKash txn, bank ref (optional)"
              value={reference} onChange={(e) => onReference(e.target.value)} />
          </div>
        </div>

        <div className="p-4 pt-3 mt-3 border-t border-white/15">
          {error && <div className="mb-2 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 hover:bg-white/20">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={busy}
              className="flex-1 bg-white hover:bg-[#f4ecf9] text-purple text-[14.5px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 shadow-soft disabled:opacity-40">
              <Icon name="check" size={17} /> {busy ? "Working…" : `${confirmLabel} · ${formatTaka(amountPaisa)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { posReceipt, type ApiPosReceipt } from "../_data/api";

/*
  ══ THE COUNTER RECEIPT (POS audit 11 Sep 2026 — §4 gap, §5 #1) ══════════════

  `PosSetting.receiptHeader`, `receiptFooter` and `giftReceiptHidePrice` have
  been stored and editable on the settings screen since the module was built and
  were read by NOTHING. There was no printable receipt anywhere in POS: the
  "Reprint" button opened a four-line summary modal with no items, no prices, no
  VAT and no discount, and then called `window.print()` — which printed the whole
  admin page, sidebar and all. A counter with no slip was the single largest gap
  in the module.

  Three decisions shape this file:

  1. THE PAPER IS BLACK ON WHITE, ON PURPOSE. Everything else in this admin is
     the dark skin; a thermal roll is not. Nothing here uses a token class or a
     brand colour — no colour survives a 58 mm monochrome roll, so the slip earns
     its hierarchy from size, weight, rules and spacing instead. The same markup
     is the on-screen preview, so what the cashier sees is what comes out.

  2. THE NUMBERS COME FROM THE SERVER, WHOLE. `GET /pos/sales/:id/receipt`
     resolves the shop, the money, the tenders and the change in one payload
     (agent A). A slip assembled in the browser out of whatever a screen happens
     to be holding can disagree with the books, and this is the one document that
     may not.

  3. PRINT PRINTS THE SLIP AND NOTHING ELSE. The slip is rendered a second time
     into a portal at `document.body > #receipt-print-root`, and the print
     stylesheet hides every other direct child of <body>. Ctrl+P and the Print
     button therefore produce the same paper. The portal only exists while the
     receipt is open, so Ctrl+P anywhere else in the admin behaves as it always
     did.
*/

/* ------------------------------------------------------------------ money */

/*  A till slip is read in a hurry in a narrow column, so the amounts are bare
    tabular digits and the taka sign is carried by the column heading and the
    total line. `formatTaka` is the screen's format (leading "৳ ", en-IN
    grouping) and is deliberately not used here.  */
const amt = (paisa: number) =>
  (paisa / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/*  qty is an integer count of whatever unit the line was sold in (DEC-POS-024),
    so it prints as typed — "12", not "12.00".  */
const qtyText = (qty: number, unitLabel: string | null) =>
  `${qty}${unitLabel ? ` ${unitLabel}` : ""}`;

const whenText = (iso: string) => {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    "  " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
};

const methodText = (m: string) => (m.length <= 4 ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());

/* ------------------------------------------------------- the print styles */

/*  Every direct child of <body> that is not the print root disappears. The
    sidebar, the header, the dialog the cashier pressed the button in — all of
    it. `visibility` is belt and braces for anything a browser extension has
    injected inside the app shell.  */
const PRINT_CSS = `
#receipt-print-root { display: none; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body > *:not(#receipt-print-root) { display: none !important; }
  #receipt-print-root { display: block !important; position: static !important; width: auto !important; }
  #receipt-print-root .rcpt { width: 100% !important; max-width: 72mm; margin: 0 auto; box-shadow: none !important; }
  @page { size: 72mm auto; margin: 3mm 2mm; }
}
`;

/* ------------------------------------------------------------- the slip */

export interface ReceiptSlipProps {
  r: ApiPosReceipt;
  /**
   * `gift` prints the GIFT RECEIPT: the same slip with every price removed.
   * The caller decides, because the shop wants both — the recipient's copy with
   * no prices and the shop's own copy with them.
   */
  gift: boolean;
}

/**
 * The paper. Pure render, no fetching, no state — so the preview in the dialog,
 * the preview on the settings screen and the sheet that actually prints are all
 * literally the same component.
 */
export function ReceiptSlip({ r, gift }: ReceiptSlipProps) {
  const rule = { borderTop: "1px dashed #000", margin: "5px 0" } as const;
  const solid = { borderTop: "1.5px solid #000", margin: "5px 0" } as const;

  const row = (label: string, value: string, strong?: boolean, key?: string | number) => (
    <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: strong ? 700 : 400, fontSize: strong ? 12.5 : 11 }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );

  return (
    <div
      className="rcpt"
      style={{
        width: "72mm",
        background: "#fff",
        color: "#000",
        fontFamily: '"DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.42,
        padding: "4mm 3mm",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/*  A VOIDED BILL MUST NOT BE MISTAKEN FOR A LIVE ONE, at a glance, from
           across a counter. Both a banner and a watermark, because a watermark
           alone is easy to miss on a pale roll and a banner alone scrolls off
           the top of a long slip.  */}
      {r.voided && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            pointerEvents: "none", overflow: "hidden",
          }}
        >
          <div style={{
            transform: "rotate(-28deg)", fontSize: 46, fontWeight: 800, letterSpacing: 4,
            color: "transparent", WebkitTextStroke: "1.5px #000", opacity: 0.32,
          }}>
            VOID
          </div>
        </div>
      )}

      {/* ---------------- shop ---------------- */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>{r.shop.name.toUpperCase()}</div>
        {r.shop.address && <div style={{ fontSize: 10 }}>{r.shop.address}</div>}
        {r.shop.phone && <div style={{ fontSize: 10 }}>Tel {r.shop.phone}</div>}
        {/*  the setting that was stored and read by nothing until today  */}
        {r.shop.receiptHeader && (
          <div style={{ fontSize: 10.5, marginTop: 3, whiteSpace: "pre-wrap" }}>{r.shop.receiptHeader}</div>
        )}
      </div>

      <div style={solid} />

      {r.voided && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 13, letterSpacing: 2, border: "1.5px solid #000", padding: "2px 0", marginBottom: 5 }}>
          VOID — THIS BILL WAS CANCELLED
        </div>
      )}
      {gift && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 12.5, letterSpacing: 2, marginBottom: 3 }}>
          GIFT RECEIPT
        </div>
      )}

      {/* ---------------- bill head ---------------- */}
      <div style={{ fontSize: 10.5 }}>
        {row("Bill", r.orderNo, true)}
        {row("Date", whenText(r.placedAt))}
        {r.cashierName ? row("Served by", r.cashierName) : null}
        {r.registerName ? row("Counter", r.registerName) : null}
        {r.customer ? row("Customer", r.customer.name) : null}
        {r.customer?.phone ? row("Phone", r.customer.phone) : null}
      </div>

      <div style={rule} />

      {/* ---------------- lines ---------------- */}
      {gift ? (
        <>
          {r.lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <div style={{ fontWeight: 600 }}>{l.name}</div>
              <div style={{ fontSize: 10 }}>{qtyText(l.qty, l.unitLabel)}</div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5 }}>
            <span>ITEM / QTY x RATE</span>
            <span>AMOUNT ৳</span>
          </div>
          <div style={rule} />
          {r.lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ fontWeight: 600 }}>{l.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5 }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {qtyText(l.qty, l.unitLabel)} x {amt(l.unitPaisa)}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{amt(l.linePaisa)}</span>
              </div>
              {/*  §1 #6 — the bill discount is spread over the lines now, so a
                   line can carry its own share and the slip says so  */}
              {l.discountPaisa > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span>  less discount</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>-{amt(l.discountPaisa)}</span>
                </div>
              )}
            </div>
          ))}
          {r.lines.length === 0 && <div style={{ fontSize: 10.5 }}>No items on this bill.</div>}
        </>
      )}

      <div style={rule} />

      {/* ---------------- money ---------------- */}
      {gift ? (
        <div style={{ fontSize: 10.5, textAlign: "center" }}>
          Prices are not shown on a gift receipt.
          <br />
          {r.lines.reduce((n, l) => n + l.qty, 0)}{" "}item{r.lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"} · exchange within the shop&apos;s policy.
        </div>
      ) : (
        <>
          {row("Subtotal", amt(r.subtotalPaisa))}
          {r.discountPaisa > 0 && row("Discount", `-${amt(r.discountPaisa)}`)}
          {/*  §3 #25 — the adjustment and the VAT were missing everywhere, so a
               printed total did not add up from the rows above it. Both sides of
               a signed adjustment print with their own sign.  */}
          {r.adjustmentPaisa !== 0 &&
            row(r.adjustmentPaisa < 0 ? "Adjustment" : "Extra charge",
              `${r.adjustmentPaisa < 0 ? "-" : "+"}${amt(Math.abs(r.adjustmentPaisa))}`)}
          {r.vatPaisa > 0 && row(`VAT ${(r.taxRateBps / 100).toFixed(r.taxRateBps % 100 ? 2 : 0)}%`, amt(r.vatPaisa))}
          <div style={solid} />
          {row("TOTAL ৳", amt(r.totalPaisa), true)}
          <div style={rule} />

          {r.payments.map((p, i) => row(i === 0 ? `Paid  ${methodText(p.method)}` : `      ${methodText(p.method)}`, amt(p.amountPaisa), false, i))}
          {r.storeCreditPaisa > 0 && row("      Store credit", amt(r.storeCreditPaisa))}
          {r.payments.length === 0 && r.storeCreditPaisa === 0 && row("Paid", amt(0))}
          {r.changePaisa > 0 && row("Change given", amt(r.changePaisa), true)}
          {r.duePaisa > 0 && row("STILL DUE ৳", amt(r.duePaisa), true)}
          {/*  a slip for a bill Returns has already paid out on must say what
               went back, or it reads as proof of money the shop still holds  */}
          {r.refundedPaisa > 0 && (
            <>
              <div style={rule} />
              {row("REFUNDED ৳", amt(r.refundedPaisa), true)}
              <div style={{ fontSize: 10 }}>Given back against this bill.</div>
            </>
          )}
        </>
      )}

      {r.note && (
        <>
          <div style={rule} />
          <div style={{ fontSize: 10, whiteSpace: "pre-wrap" }}>{r.note}</div>
        </>
      )}

      <div style={solid} />

      {/* ---------------- foot ---------------- */}
      <div style={{ textAlign: "center", fontSize: 10.5 }}>
        {r.shop.receiptFooter && <div style={{ whiteSpace: "pre-wrap", marginBottom: 3 }}>{r.shop.receiptFooter}</div>}
        <div style={{ fontSize: 9.5 }}>Printed {whenText(new Date().toISOString())}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ print root */

/**
 * The slip, a second time, as a direct child of <body>. Only this subtree
 * survives `@media print`; see PRINT_CSS. It is mounted only while a receipt is
 * on screen, so printing anywhere else in the admin is unaffected.
 */
function PrintRoot({ r, gift }: ReceiptSlipProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || typeof document === "undefined") return null;
  return createPortal(
    <div id="receipt-print-root">
      <style>{PRINT_CSS}</style>
      <ReceiptSlip r={r} gift={gift} />
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------ the dialog */

/**
 * Reprint, from the bill page and from every row of Sales history.
 *
 * The shop's copy and the gift copy are one toggle apart because a flower shop
 * hands over both: the slip that goes in the bag has no prices on it, the one
 * that stays in the drawer does. `giftReceiptHidePrice` (already ANDed with the
 * bill's own `isGift` by the API) only decides which one opens first.
 */
export default function ReceiptDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [r, setR] = useState<ApiPosReceipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gift, setGift] = useState(false);

  useEffect(() => {
    let live = true;
    posReceipt(orderId)
      .then((d) => { if (!live) return; setR(d); setGift(d.shop.giftReceiptHidePrice); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : "Could not read the receipt"); });
    return () => { live = false; };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doPrint = useCallback(() => { window.print(); }, []);

  return (
    <>
      {r && <PrintRoot r={r} gift={gift} />}
      <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4 py-8 overflow-auto"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-[16px] shadow-lift p-5 w-full max-w-[360px]" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display text-[17px] text-purple m-0">Receipt</h3>
              <p className="text-[12px] text-body-soft m-0">{r ? r.orderNo : "…"} · prints on its own, without the admin page</p>
            </div>
            <button type="button" onClick={onClose} className="text-[12px] text-body-soft underline shrink-0">Close</button>
          </div>

          {err && <p className="text-[12.5px] text-[#e1837a] m-0 mb-3">{err}</p>}
          {!r && !err && <p className="text-[12.5px] text-body-soft m-0">Reading the bill…</p>}

          {r && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([false, true] as const).map((g) => (
                  <button
                    key={String(g)}
                    type="button"
                    onClick={() => setGift(g)}
                    className={
                      "py-2 rounded-[10px] text-[12.5px] font-bold border transition " +
                      (gift === g
                        ? "bg-purple text-white border-purple"
                        : "bg-white text-body-soft border-lavender-deep hover:border-orchid-mid")
                    }
                  >
                    {g ? "Gift copy" : "Shop copy"}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-body-soft m-0 mb-3">
                {gift
                  ? "No prices anywhere on this slip — the copy that goes in the bag."
                  : "Every price, the full money breakdown and how it was paid."}
                {r.shop.giftReceiptHidePrice && !gift && " This bill is a gift, and settings say to hide the price."}
              </p>

              {/*  The preview is the same component that prints, on a white
                   sheet, so nobody is surprised by the paper.  */}
              <div className="rounded-[10px] p-3 mb-3 max-h-[46vh] overflow-auto" style={{ background: "#d8d3dd" }}>
                <div className="mx-auto shadow-lift" style={{ width: "72mm" }}>
                  <ReceiptSlip r={r} gift={gift} />
                </div>
              </div>

              <button type="button" onClick={doPrint}
                className="w-full py-2.5 rounded-[11px] bg-purple hover:bg-purple-deep text-white font-bold text-[13.5px] inline-flex items-center justify-center gap-2">
                <Icon name="hash" size={15} /> Print
              </button>
              <p className="text-[11px] text-body-soft text-center m-0 mt-2">
                Ctrl+P prints the same slip while this is open. 58 mm and 80 mm rolls both fit.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------- settings preview */

/**
 * A pretend bill, so the settings screen can show what the header and the footer
 * will look like on paper the moment they are typed. Nothing here is ever
 * printed against a real order — it exists so the three receipt settings stop
 * being three boxes with no visible effect.
 */
export function sampleReceipt(shop: {
  name?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  giftReceiptHidePrice?: boolean;
  taxRateBps?: number;
}): ApiPosReceipt {
  const bps = shop.taxRateBps ?? 0;
  const subtotal = 145000;
  const discount = 5000;
  const vat = Math.round(((subtotal - discount) * bps) / 10000);
  return {
    orderNo: "POS-000000",
    placedAt: new Date().toISOString(),
    cashierName: "Cashier",
    registerName: "Main Counter",
    shop: {
      name: shop.name?.trim() || "Radian",
      address: "Sample address, Dhaka",
      phone: "01XXXXXXXXX",
      receiptHeader: shop.receiptHeader ?? null,
      receiptFooter: shop.receiptFooter ?? null,
      giftReceiptHidePrice: !!shop.giftReceiptHidePrice,
    },
    isGift: true,
    customer: { name: "Sample Customer", phone: "01XXXXXXXXX" },
    lines: [
      { name: "Red Rose", qty: 12, unitLabel: "Stick", unitPaisa: 7500, linePaisa: 90000, discountPaisa: 3103 },
      { name: "Gift wrap", qty: 1, unitLabel: null, unitPaisa: 25000, linePaisa: 25000, discountPaisa: 862 },
      { name: "Greeting card", qty: 1, unitLabel: null, unitPaisa: 30000, linePaisa: 30000, discountPaisa: 1035 },
    ],
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    adjustmentPaisa: 0,
    vatPaisa: vat,
    taxRateBps: bps,
    totalPaisa: subtotal - discount + vat,
    payments: [{ method: "cash", amountPaisa: subtotal - discount + vat }],
    paidPaisa: subtotal - discount + vat,
    changePaisa: 0,
    duePaisa: 0,
    refundedPaisa: 0,
    storeCreditPaisa: 0,
    note: null,
    voided: false,
  };
}

/** the preview on the settings screen — the paper, at the size it prints */
export function ReceiptPreview({ r, gift }: ReceiptSlipProps) {
  const slip = useMemo(() => <ReceiptSlip r={r} gift={gift} />, [r, gift]);
  return (
    <div className="rounded-[12px] p-3 overflow-auto" style={{ background: "#d8d3dd" }}>
      <div className="mx-auto shadow-lift" style={{ width: "72mm" }}>{slip}</div>
    </div>
  );
}

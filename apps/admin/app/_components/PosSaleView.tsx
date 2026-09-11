"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  formatTaka,
  getOrder,
  getOrderTimeline,
  posDay,
  posReceipt,
  posVoidSale,
  type ApiOrder,
  type ApiPosReceipt,
} from "../_data/api";
import { PaymentsCard, BillTimeline, MoneyRail } from "./BillUI";
import ReceiptDialog from "./PosReceipt";

/*
  The counter bill, after the sale (owner, 21 Aug: "pos a order complete krle o
  jn amn page ase" — the same page a purchase gets). One record, read the same
  way on both sides of the shop: what was on it, what was paid, what happened.

  It is an Order (DEC-POS-001), so nothing new is stored for this screen; it
  reads the same row the online order page reads and lays it out the way the
  purchase bill does.

  ── POS audit 11 Sep 2026 ────────────────────────────────────────────────────
  §3 #25 — THE PAGE DID NOT ADD UP. The money rail showed Subtotal and Discount
  and nothing else, so VAT, the adjustment and the charges were simply absent
  and the Grand total looked wrong on every bill that carried any of them. `due`
  was recomputed as total − paid, which ignores both `refundPaisa` and the
  stored `duePaisa`, and the DEC-POS-024 unit snapshot was never printed, so a
  line sold by the pice read as a bare "4".

  The fix takes the whole money side from `GET /pos/sales/:id/receipt` — the same
  payload the printed slip is drawn from. That is deliberate: the screen and the
  paper cannot disagree if they are the same numbers. `ApiOrder` carries neither
  `vatPaisa` nor the line's `unitLabel`, so there was nothing to read there.

  §3 #21 — and a bill can be UNDONE now. See VoidDialog.
*/

const WRAP = "px-5 md:px-7 pt-5 pb-10 max-w-[1500px]";
const CARD = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";
const ACCENT = "#a55fd9";

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

/* ------------------------------------------------------------------ void */

/**
 * POS audit §3 #21 — until today a wrong counter bill could never be undone.
 * The only path was the Returns workflow (create → approve → complete), which
 * needs `deliveryStatus = delivered`: true for a walk-in, FALSE for an advance
 * order, so an abandoned advance sat on the board with its due for ever.
 *
 * The confirm says plainly what is about to happen, because every one of these
 * is a real movement somebody will have to explain later, and asks for a reason
 * that is written to the order's timeline. The API refuses a reason-less void.
 */
function VoidDialog({
  bill, cashBack, onClose, onDone,
}: {
  bill: { orderNo: string; paidPaisa: number; advance: boolean };
  cashBack: number;
  onClose: () => void;
  onDone: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /*  the shop's own words for why a bill is torn up, so the timeline reads as
      something rather than 40 spellings of "mistake"  */
  const QUICK = ["Rung up by mistake", "Customer changed their mind", "Wrong item", "Wrong price", "Test bill"];

  async function go() {
    const r = reason.trim();
    if (!r) { setErr("Say why this bill is being voided — it goes on the record."); return; }
    setBusy(true); setErr(null);
    try { await onDone(r); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not void the bill"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] shadow-lift p-6 w-full max-w-[440px]" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="font-display text-[18px] text-purple m-0 mb-1">Void {bill.orderNo}?</h3>
        <p className="text-[12.5px] text-body-soft m-0 mb-4">This cannot be undone from here.</p>

        <div className="rounded-[12px] px-4 py-3 mb-4 text-[12.5px]" style={{ background: "#3a2d10", color: "#f5c451" }}>
          <b className="block mb-1.5">What happens when you press it</b>
          <ul className="m-0 pl-4 space-y-1">
            {bill.advance
              ? <li>The order is cancelled. No stock moves — an advance order never took any off the shelf.</li>
              : <li>Every item goes back on the shelf.</li>}
            {bill.paidPaisa > 0
              ? <li>{formatTaka(bill.paidPaisa)} of payment is reversed.</li>
              : <li>Nothing was paid on this bill, so no money moves.</li>}
            {cashBack > 0 && <li>{formatTaka(cashBack)} comes back OUT of the cash box — take the notes out of the drawer now.</li>}
            <li>The bill is marked cancelled and stays visible, with your reason on it.</li>
          </ul>
        </div>

        <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Why</label>
        <input className="ipt h-[44px] mb-2" autoFocus placeholder="In your own words" value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void go(); }} />
        <div className="flex gap-1.5 flex-wrap mb-3">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setReason(q)}
              className="text-[11.5px] px-2.5 py-1 rounded-full border border-lavender-deep text-body-soft hover:border-orchid-mid">
              {q}
            </button>
          ))}
        </div>

        {err && <p className="text-[12px] text-[#e1837a] m-0 mb-3">{err}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-bold text-[13px]">
            Keep the bill
          </button>
          <button type="button" onClick={go} disabled={busy}
            className="flex-1 py-2.5 rounded-[11px] text-white font-bold text-[13px] disabled:opacity-50"
            style={{ background: "#a33a32" }}>
            {busy ? "Voiding…" : "Void it"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function PosSaleView({ id }: { id: string }) {
  const [o, setO] = useState<ApiOrder | null>(null);
  const [rc, setRc] = useState<ApiPosReceipt | null>(null);
  const [events, setEvents] = useState<{ createdAt?: string; kind: string; label: string; actorName?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  /*  why the Void button is not on screen. The API's refusals are read BEFORE
      the button is drawn, so nobody presses a button that was always going to
      be refused — and the reason is printed where the button would have been.  */
  const [voidBlock, setVoidBlock] = useState<string | null>("Checking whether this bill can still be voided…");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setO(await getOrder(id));
      // oldest first — a bill reads as a story
      try { setEvents((await getOrderTimeline(id)).slice().reverse()); } catch { setEvents([]); }
    } catch { setO(null); } finally { setLoading(false); }
    /*  the receipt payload carries what ApiOrder does not: VAT, the signed
        adjustment, each line's sold unit, what Returns gave back, the change
        handed over on the day, and whether the bill is void  */
    try { setRc(await posReceipt(id)); } catch { setRc(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  /*  Can this bill still be voided? The server's four rules (agent A), asked
      here so the answer is a sentence and not a red box after a click.  */
  useEffect(() => {
    let live = true;
    (async () => {
      if (!o || !rc) return;
      if (rc.voided) { if (live) setVoidBlock(null); return; }   // its own banner handles this
      if (rc.refundedPaisa > 0) {
        if (live) setVoidBlock("Returns has already paid money back on this bill, so it belongs to Returns now — finish it there.");
        return;
      }
      try {
        const d = await posDay();
        if (!live) return;
        if (!d.drawer.isOpen) {
          setVoidBlock("The cash box is closed. A bill from a day that has been counted is unwound in Returns, not voided at the till.");
          return;
        }
        if (+new Date(rc.placedAt) < +new Date(d.drawer.openedAt)) {
          setVoidBlock("This bill belongs to a cash box that has already been counted and closed. Unwind it in Returns.");
          return;
        }
        setVoidBlock(null);
      } catch {
        /*  the day could not be read — say so rather than offering a button
            whose consequences we cannot describe  */
        if (live) setVoidBlock("Could not read today's cash box, so the void is not offered. Reload the page.");
      }
    })();
    return () => { live = false; };
  }, [o, rc]);

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!o) return (
    <div className={WRAP}>
      <p className="text-[13px] text-body-soft">That bill was not found. <Link href="/pos/sales" className="underline">All counter sales</Link></p>
    </div>
  );

  const lines = o.lines ?? [];
  const txns = (o.transactions ?? []).filter((t) => t.kind !== "REFUND");
  /*  §3 #25 — the STORED due, which already accounts for what Returns gave
      back. `total − paid` was wrong on any bill that had been refunded.  */
  const due = rc ? rc.duePaisa : Math.max(0, o.totalPaisa - o.paidPaisa);
  const advance = o.salesStatus === "placed";
  const voided = rc ? rc.voided : o.salesStatus === "cancelled";
  /*  what has to come back out of the drawer if this is voided — only the cash
      half, because only cash ever sat in the box  */
  const cashBack = (rc?.payments ?? [])
    .filter((p) => p.method.toUpperCase() === "CASH")
    .reduce((n, p) => n + p.amountPaisa, 0);

  const adjustment = rc?.adjustmentPaisa ?? o.adjustmentPaisa;
  const vatPaisa = rc?.vatPaisa ?? 0;

  /*  Pair each order line with its receipt line by WHAT IT IS, not by position.
      Both lists come from the same `order.lines` include, but neither query
      orders them, so Postgres is free to hand the two calls back in different
      orders — and a unit label printed against the wrong line is worse than no
      unit label at all. Matched on name + qty + unit price, each receipt line
      used once.  */
  const rcLineFor = (() => {
    const pool = new Map<string, ApiPosReceipt["lines"]>();
    for (const rl of rc?.lines ?? []) {
      const k = `${rl.name}|${rl.qty}|${rl.unitPaisa}`;
      pool.set(k, [...(pool.get(k) ?? []), rl]);
    }
    return (name: string, qty: number, unitPaisa: number) => pool.get(`${name}|${qty}|${unitPaisa}`)?.shift() ?? null;
  })();

  return (
    <div className={WRAP}>
      {/* ---------------- head ---------------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-body-soft mb-1">
            <span style={{ color: ACCENT }}>●</span> Commerce · POS
          </div>
          <h1 className="font-display text-[30px] text-purple m-0">{o.orderNo}</h1>
          <p className="text-[13px] text-body-soft m-0 mt-1">
            {o.customer?.name ?? o.senderName}
            {o.senderPhone ? ` · ${o.senderPhone}` : ""} · {fmtDate(o.placedAt)}
            {o.channel?.name ? ` · ${o.channel.name}` : ""}
            {rc?.cashierName ? ` · sold by ${rc.cashierName}` : ""}
          </p>
        </div>

        {/*  the two doors the owner asked for: from a bill, straight back to
             work — sell the next one, or print the paper for this one  */}
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setReceiptOpen(true)}
            className="text-[13px] font-medium text-purple border border-lavender-deep px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5 hover:bg-lavender/40">
            <Icon name="hash" size={14} /> Print receipt
          </button>
          <Link href="/pos/sell"
            className="text-[13px] font-medium text-white px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={14} /> Sell (counter)
          </Link>
          <span className={"text-[12px] font-medium px-3 py-1.5 rounded-full " + (voided
            ? "bg-[#3a1616] text-[#ff9c92]"
            : advance
              ? "bg-[#3c2e17] text-[#f7a96e]"
              : "bg-[#1c3626] text-[#76efab]")}>
            {voided ? "Voided" : advance ? "Advance — not handed over" : "Completed"}
          </span>
          {!voided && (
            <span className={"text-[12px] font-medium px-3 py-1.5 rounded-full " + (due > 0
              ? "bg-[#3c2e17] text-[#f7a96e]"
              : "bg-[#1c3626] text-[#76efab]")}>
              {due > 0 ? `Due ${formatTaka(due)}` : "Paid"}
            </span>
          )}
        </div>
      </div>

      {flash && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px]" style={{ background: "#1c3626", color: "#76efab" }}>{flash}</div>
      )}

      {voided && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px]" style={{ background: "#3a1616", color: "#ff9c92" }}>
          <b>This bill was voided.</b> The stock went back, the payments were reversed and nothing is owed on it.
          It is kept so the receipt number is never reused — the reason is on the timeline below.
        </div>
      )}

      {!voided && (rc?.refundedPaisa ?? 0) > 0 && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px]" style={{ background: "#3c2e17", color: "#f7a96e" }}>
          <b>{formatTaka(rc?.refundedPaisa ?? 0)} has been refunded</b> against this bill through Returns.
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div>
          {/* ---------------- items ---------------- */}
          <div className={CARD + " overflow-hidden mb-5"}>
            <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-3 items-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "#470066" }}>
              <span>Item</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span>
            </div>
            {lines.map((l, i) => {
              /*  DEC-POS-024 — the unit this line was SOLD in. Snapshotted at
                  sale time and never shown until now, so "4" could mean four
                  sticks or four pice and the bill did not say which.  */
              const rl = rcLineFor(l.name, l.qty, l.unitPaisa);
              const unit = rl?.unitLabel ?? null;
              const lineDisc = rl?.discountPaisa ?? l.discountPaisa ?? 0;
              return (
                <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-3 items-center px-4 py-3 border-t border-lavender-deep">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-purple truncate">{l.name}</div>
                    {l.sizeLabel && <div className="text-[11.5px] text-body-soft">{l.sizeLabel}</div>}
                    {lineDisc > 0 && <div className="text-[11.5px] text-[#76efab]">less {formatTaka(lineDisc)} discount</div>}
                  </div>
                  <div className="text-center text-[13px]">
                    {l.qty}{unit && <span className="text-body-soft text-[11.5px]"> {unit}</span>}
                  </div>
                  <div className="text-right text-[13px]">{formatTaka(l.unitPaisa)}</div>
                  <div className="text-right text-[13.5px] font-semibold text-purple" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatTaka(l.linePaisa)}
                  </div>
                </div>
              );
            })}
            {lines.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-body-soft">No lines on this bill.</div>}
          </div>

          {/* ---------------- payments (shared bill face, BillUI) ---------------- */}
          <PaymentsCard
            rows={txns.map((t) => ({
              id: t.id,
              when: fmtWhen(t.createdAt),
              method: t.method,
              amountPaisa: t.amountPaisa,
              by: t.actorName,
            }))}
          />

          <BillTimeline events={events.map((e, i) => ({
            id: String(i),
            kind: e.kind,
            label: e.label,
            when: fmtWhen(e.createdAt),
            by: e.actorName,
          }))} />
        </div>

        {/* ---------------- money ---------------- */}
        <div className="space-y-4">
          {/*  §3 #25 — THE WHOLE BREAKDOWN, so the grand total adds up from the
               rows above it. Every figure is the receipt's, which is the
               server's, which is what the paper prints.  */}
          <MoneyRail
            totalLabel="Grand total"
            totalPaisa={o.totalPaisa}
            rows={[
              { label: "Subtotal", paisa: rc?.subtotalPaisa ?? o.subtotalPaisa },
              ...((rc?.discountPaisa ?? o.discountPaisa) > 0
                ? [{ label: "Discount", paisa: rc?.discountPaisa ?? o.discountPaisa, tone: "minus" as const }] : []),
              ...(adjustment !== 0
                ? [{
                    label: adjustment < 0 ? "Adjustment" : "Extra charge",
                    paisa: adjustment,
                    tone: (adjustment < 0 ? "minus" : "plus") as "minus" | "plus",
                  }] : []),
              ...(vatPaisa > 0
                ? [{
                    label: `VAT ${((rc?.taxRateBps ?? 0) / 100).toFixed((rc?.taxRateBps ?? 0) % 100 ? 2 : 0)}%`,
                    paisa: vatPaisa,
                    tone: "plus" as const,
                  }] : []),
              ...((rc?.storeCreditPaisa ?? 0) > 0
                ? [{ label: "Paid with store credit", paisa: rc?.storeCreditPaisa ?? 0 }] : []),
              ...((rc?.changePaisa ?? 0) > 0
                ? [{ label: "Change handed back", paisa: rc?.changePaisa ?? 0 }] : []),
              ...((rc?.refundedPaisa ?? 0) > 0
                ? [{ label: "Refunded since", paisa: rc?.refundedPaisa ?? 0, tone: "minus" as const }] : []),
            ]}
            paidPaisa={o.paidPaisa}
            duePaisa={due}
          />

          {o.internalNote && (
            <div className={CARD + " px-5 py-4"}>
              <b className="text-[13px] text-purple block mb-1">Note</b>
              <p className="text-[12.5px] text-body-soft m-0">{o.internalNote}</p>
            </div>
          )}

          <div className={CARD + " px-5 py-4 flex flex-col gap-2 text-center"}>
            <button type="button" onClick={() => setReceiptOpen(true)}
              className="text-[13px] text-purple border border-lavender-deep rounded-[10px] py-2.5 hover:bg-lavender/40 inline-flex items-center justify-center gap-1.5">
              <Icon name="hash" size={14} /> Print the receipt
            </button>
            {due > 0 && !voided && <Link href="/pos/due" className="text-[13px] text-purple border border-lavender-deep rounded-[10px] py-2.5 hover:bg-lavender/40">Collect the due</Link>}
            {advance && !voided && <Link href="/pos/advance" className="text-[13px] text-purple border border-lavender-deep rounded-[10px] py-2.5 hover:bg-lavender/40">Advance orders</Link>}
            <Link href="/pos/sales" className="text-[12.5px] text-body-soft underline">← All counter sales</Link>
          </div>

          {/* ---------------- void (§3 #21) ---------------- */}
          {!voided && (
            <div className={CARD + " px-5 py-4"}>
              <b className="text-[13px] text-purple block mb-1">Rung up by mistake?</b>
              {voidBlock ? (
                <>
                  <p className="text-[12px] text-body-soft m-0">{voidBlock}</p>
                  {/*  ⚠️ AN OLD ADVANCE ORDER HAS NOWHERE TO GO. The till
                       refuses it (its cash box has been counted and closed) and
                       Returns cannot take it either — the Returns workflow needs
                       `deliveryStatus = delivered` and an advance has never been
                       handed over. Saying so is better than sending somebody to
                       a screen that will not help. (POS audit §3 #21; on the
                       owner's list in POS_C.md.)  */}
                  {advance && (
                    <p className="text-[12px] m-0 mt-2" style={{ color: "#f0b46a" }}>
                      This is an advance order that was never handed over, and Returns cannot
                      take it either — it only handles delivered bills. There is no way to cancel
                      it from any screen today. Ask the owner.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[12px] text-body-soft m-0 mb-2.5">
                    Voiding puts the stock back, reverses the money{cashBack > 0 ? ` and takes ${formatTaka(cashBack)} back out of the cash box` : ""}, and cancels the bill.
                  </p>
                  <button type="button" onClick={() => setVoidOpen(true)}
                    className="w-full text-[13px] font-bold text-[#ff9c92] border rounded-[10px] py-2.5"
                    style={{ borderColor: "#6a2a25", background: "#2c1413" }}>
                    Void this bill
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {receiptOpen && <ReceiptDialog orderId={id} onClose={() => setReceiptOpen(false)} />}
      {voidOpen && (
        <VoidDialog
          bill={{ orderNo: o.orderNo, paidPaisa: o.paidPaisa, advance }}
          cashBack={cashBack}
          onClose={() => setVoidOpen(false)}
          onDone={async (reason) => {
            await posVoidSale(id, { reason });
            setVoidOpen(false);
            setFlash("The bill is voided. The stock is back on the shelf and the payments are reversed.");
            await load();
          }}
        />
      )}
    </div>
  );
}

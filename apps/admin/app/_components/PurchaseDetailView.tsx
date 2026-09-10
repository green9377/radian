"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, DemoBar, Modal, Field, ItemThumb, msg } from "./ItemUI";
import { StatusChip, PayBadge, fmtDate } from "./PurchaseViews";
import {
  getPurchase, receivePurchase, addPurchasePayment, cancelPurchase, createPurchaseReturn, repostPurchaseStock,
  getPurchaseTimeline, isCostJumpRefusal, formatTaka, fmtQty, toMilli,
  type ApiPurchase, type PayMethod, type ActivityEvent,
} from "../_data/api";
import { PayDialog, usePayRows, usePaymentMethods, BILL_TENDERS } from "./MoneyBlock";
import { PaymentsCard, BillTimeline, MoneyRail } from "./BillUI";

/*
  Purchase detail — receive, pay, return. RADIAN_PURCHASE_MODULE_ARCHITECTURE.md.

  · Receive       PUR-R05 — partial fine; full receive flips status to RECEIVED
  · Add payment   PUR-R04 — Σ payments can never pass what is owed
  · Return        PUR-R08 / DEC-PUR-006 — qty ≤ received − already returned;
                  money never comes back as cash: due is cut first, excess = credit
  · Cancel        PUR-R06 — only before anything was received
  · Stock         posts on receive (DEC-INV-016 auto-warehouse); a failed post
                  surfaces as the stockGap card + repost button (DEC-PUR-010)
*/

const tkToPaisa = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export default function PurchaseDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [p, setP] = useState<ApiPurchase | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);

  /*  DEC-PUR-013 (owner, 21 Aug) — half a delivery is normal in this trade, so
      the screen can take what actually turned up, line by line.  */
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});
  /*  a part receipt refused on price must come back as the SAME part receipt,
      not as "receive everything" (that is how a half delivery becomes a full one)  */
  const [recvPending, setRecvPending] = useState<{ lineId: string; qtyMilli: number }[] | null>(null);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [costJump, setCostJump] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const fresh = await getPurchase(id);
      setP(fresh);
      setIsDemo(false);
      // D9 lesson — API is newest-first; a story reads oldest-first
      try { setEvents((await getPurchaseTimeline(id)).slice().reverse()); } catch { setEvents([]); }
    } catch {
      // API unreachable or the purchase does not exist — no fake record, ever
      setP(null);
      setIsDemo(true);
      setEvents([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const refreshEvents = async () => {
    try { setEvents((await getPurchaseTimeline(id)).slice().reverse()); } catch { /* demo */ }
  };

  async function act(fn: () => Promise<ApiPurchase>, done: string) {
    setBusy(true); setErr(null); setCostJump(null);
    try { setP(await fn()); setOk(done); setRecvPending(null); await refreshEvents(); }
    catch (e) {
      if (isCostJumpRefusal(e)) {
        // same in-page confirm card as the New-purchase form — no native confirm()
        setCostJump(msg(e, "The price is far from the current cost.").replace(/^COST_JUMP:/, ""));
      } else setErr(msg(e, "That did not work."));
    }
    finally { setBusy(false); }
  }

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!p) return (
    <div className={WRAP}>
      {isDemo && <DemoBar what="this purchase" onRetry={load} />}
      <p className="text-[13px] text-body-soft">Purchase not found. <Link href="/purchases/list" className="underline">Back to the list</Link></p>
    </div>
  );

  const alreadyReturned = (lineId: string) =>
    p.returns.reduce((s, r) => s + r.lines.filter((l) => l.purchaseLineId === lineId).reduce((x, l) => x + l.qtyMilli, 0), 0);

  const gap = p.stockGap?.length ? p.stockGap : null;
  const outstanding = p.lines.some((l) => l.receivedQtyMilli < l.qtyMilli) && p.status !== "CANCELLED";
  const returnable = p.lines.some((l) => l.receivedQtyMilli - alreadyReturned(l.id) > 0);

  // return preview — same maths as the API (DEC-PUR-006), so no surprises on save
  const returnTotal = p.lines.reduce((s, l) => {
    const q = toMilli(returnQty[l.id] ?? "");
    return s + (q > 0 ? Math.round((q * l.unitPricePaisa) / 1000) : 0);
  }, 0);
  const returnDueCut = Math.min(returnTotal, p.duePaisa);
  const returnCredit = returnTotal - returnDueCut;

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Commerce · Purchases"
        title={p.purchaseNo}
        blurb={`${p.supplierName}${p.supplierPhone ? " · " + p.supplierPhone : ""} · ${fmtDate(p.purchaseDate)}${p.supplierReceiptNo ? " · receipt " + p.supplierReceiptNo : ""}`}
        right={
          <span className="flex items-center gap-2 flex-wrap">
            {/*  from a bill, straight back to work (owner, 21 Aug): buy the next
                 one, or go and sell — the counter is the other half of the shop  */}
            <Link href="/purchases/new"
              className="text-[13px] font-medium text-white px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5"
              style={{ background: ACCENT }}>
              <Icon name="plus" size={14} /> New purchase
            </Link>
            <Link href="/pos/sell"
              className="text-[13px] font-medium text-purple border border-lavender-deep px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5 hover:bg-lavender/40">
              <Icon name="plus" size={14} /> Sell (counter)
            </Link>
            <StatusChip status={p.status} />
            <PayBadge p={p} />
          </span>
        }
      />
      {isDemo && <DemoBar what="a sample purchase (actions need the API)" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      {costJump && (
        <div className="rounded-[14px] border-2 px-5 py-4 mb-4" style={{ background: "#3b2b17", borderColor: "#f0b95e" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#f6bb6f" }}>⚠ Price looks unusual</b>
          <p className="text-[13px] text-body m-0 mb-3">{costJump}</p>
          <div className="flex gap-2">
            <button onClick={() => setCostJump(null)} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px]">
              Never mind
            </button>
            <button disabled={busy}
              onClick={async () => {
                await act(
                  () => receivePurchase(id, { confirmCost: true, lines: recvPending ?? undefined }),
                  recvPending ? "Taken in — stock posted for what arrived." : "Goods received — stock posted, average cost updated.",
                );
                setRecvPending(null);
              }}
              className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px]" style={{ background: "#b45309" }}>
              The price is right — receive anyway
            </button>
          </div>
        </div>
      )}

      {/* DEC-PUR-010 — goods received, stock never moved. Loud, on the purchase
          itself, with the repair one press away. The receive hook is fail-soft on
          purpose; before this the only trace was a line in the timeline. */}
      {gap && (
        <div className="mb-5 rounded-[14px] border px-5 py-4"
          style={{ borderColor: "#f0c98a", background: "#3a2d16" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#f7c76e" }}>
            <Icon name="alert" size={13} /> These goods never reached stock
          </b>
          <p className="text-[13px] text-body-soft m-0 mb-2.5">
            The receipt was saved but the stock movement failed, so the shop still
            counts these as missing:{" "}
            <b className="text-body">
              {gap.map((g) => `${g.name} ${fmtQty(g.missingMilli)}`).join(", ")}
            </b>
            . Pressing this posts only what is missing — safe to press twice.
          </p>
          <button disabled={busy} onClick={() => act(() => repostPurchaseStock(id), "Stock posted.")}
            className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-[9px] text-white disabled:opacity-50"
            style={{ background: "#b45309" }}>
            Post stock now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div>
          {/* ---------------- lines ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-5">
            <div style={{ background: ACCENT }} className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] gap-2 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
              <span>Item</span><span className="text-right">Qty</span><span className="text-right">Received</span><span className="text-right">Price</span><span className="text-right">Total</span>
            </div>
            <div className="divide-y divide-lavender-deep">
              {p.lines.map((l) => {
                const ret = alreadyReturned(l.id);
                return (
                  <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] gap-2 px-4 py-3 items-center">
                    <span className="min-w-0 flex items-center gap-2.5">
                      {/* the item's own photo/tile — same visual as the Item module (DEC-ITM-012) */}
                      {l.item && <ItemThumb item={{ sku: l.item.sku, name: l.item.name, imageUrl: l.item.imageUrl }} size={34} />}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-body truncate">{l.item?.name ?? "?"}</span>
                        <span className="block text-[13px] text-body-soft">{l.item?.sku}{ret > 0 ? ` · returned ${fmtQty(ret)}` : ""}</span>
                      </span>
                    </span>
                    <span className="text-[13px] text-right">{fmtQty(l.qtyMilli)} {l.unit?.name}</span>
                    <span className="text-[13px] text-right font-medium"
                      style={{ color: l.receivedQtyMilli >= l.qtyMilli ? "#76efab" : l.receivedQtyMilli > 0 ? "#b45309" : "#9b8aa6" }}>
                      {fmtQty(l.receivedQtyMilli)}
                    </span>
                    <span className="text-[13px] text-right">{formatTaka(l.unitPricePaisa)}</span>
                    <span className="text-[13px] font-medium text-right">{formatTaka(l.lineTotalPaisa)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---------------- payments (shared bill face, BillUI) ---------------- */}
          <PaymentsCard
            rows={p.payments.map((x) => ({
              id: x.id,
              when: fmtDate(x.paidAt),
              method: x.method,
              amountPaisa: x.amountPaisa,
              note: x.note,
            }))}
            action={p.status !== "CANCELLED" && p.duePaisa > 0 ? (
              <button onClick={() => setPayOpen(true)}
                className="text-[11.5px] font-semibold px-3 py-1.5 rounded-[8px] text-purple bg-white inline-flex items-center gap-1">
                <Icon name="plus" size={11} /> Add payment
              </button>
            ) : undefined}
          />

          {/* ---------------- returns ---------------- */}
          {p.returns.length > 0 && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5">
              <b className="text-[14px] text-purple block mb-2.5">Returns</b>
              {p.returns.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0">
                  <span className="text-[13px] text-body min-w-0 truncate">
                    {r.returnNo} · {fmtDate(r.returnDate)}{r.reason ? ` · ${r.reason}` : ""}
                  </span>
                  <span className="text-[12.5px] text-body-soft shrink-0">
                    {formatTaka(r.totalPaisa)}{r.creditPaisa > 0 ? ` (credit ${formatTaka(r.creditPaisa)})` : " (due cut)"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <BillTimeline events={events.map((e) => ({
            id: e.id,
            kind: e.kind,
            label: e.label,
            when: new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            by: e.actorName,
          }))} />

          {p.attachmentUrl && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5">
              <b className="text-[14px] text-purple block mb-2.5">Supplier receipt</b>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.attachmentUrl} alt="receipt" className="max-h-[320px] rounded-[10px] border border-lavender-deep" />
            </div>
          )}
          {p.notes && <p className="text-[13px] text-body-soft">Note · {p.notes}</p>}
        </div>

        {/* ---------------- money + actions rail ---------------- */}
        <div className="xl:sticky xl:top-4 space-y-4">
          {/*  the bill's money in the house purple (CLAUDE.md §14) — the same
               voice as the till and the new-purchase form  */}
          <MoneyRail
            totalPaisa={p.payablePaisa}
            rows={[
              { label: "Subtotal", paisa: p.subTotalPaisa },
              ...(p.discountPaisa > 0 ? [{ label: "Discount", paisa: p.discountPaisa, tone: "minus" as const }] : []),
              ...((p.adjustmentPaisa ?? 0) !== 0
                ? [{ label: "Adjustment", paisa: p.adjustmentPaisa ?? 0, tone: (p.adjustmentPaisa ?? 0) > 0 ? ("plus" as const) : ("minus" as const) }]
                : []),
              ...((p.vatPaisa ?? 0) > 0 ? [{ label: "VAT", paisa: p.vatPaisa ?? 0, tone: "plus" as const }] : []),
              ...(p.returnedPaisa > 0 ? [{ label: "Returned", paisa: p.returnedPaisa, tone: "minus" as const }] : []),
            ]}
            paidPaisa={p.paidPaisa}
            duePaisa={p.duePaisa}
          />

          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 space-y-2">
            {outstanding && (
              <>
                <button disabled={busy} onClick={() => act(() => receivePurchase(id), "Goods received — stock posted, average cost updated.")}
                  className="w-full text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                  <Icon name="check" size={13} /> Receive everything outstanding
                </button>
                <button disabled={busy}
                  onClick={() => {
                    const d: Record<string, string> = {};
                    for (const l of p.lines) {
                      const left = l.qtyMilli - l.receivedQtyMilli;
                      if (left > 0) d[l.id] = fmtQty(left);
                    }
                    setRecvQty(d); setRecvOpen(true);
                  }}
                  className="w-full border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] hover:border-orchid">
                  Only part of it arrived
                </button>
              </>
            )}
            {returnable && (
              <button disabled={busy} onClick={() => { setReturnQty({}); setReturnOpen(true); }}
                className="w-full border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] hover:border-orchid">
                Return goods to supplier
              </button>
            )}
            {(p.status === "ORDERED" || p.status === "ADVANCE_PAID") && !p.lines.some((l) => l.receivedQtyMilli > 0) && (
              <button disabled={busy}
                onClick={() => {
                  if (p.paidPaisa > 0) { setCancelNote(""); setCancelOpen(true); }
                  else act(() => cancelPurchase(id), "Purchase cancelled.");
                }}
                className="w-full border border-[#4d2e2e] bg-white text-[#e1837a] text-[13.5px] font-medium px-4 py-2.5 rounded-[10px]">
                Cancel this order
              </button>
            )}
            <Link href="/purchases/list" className="block text-center text-[12.5px] text-body-soft underline pt-1">← All purchases</Link>
          </div>

        </div>
      </div>

      {/* ---------------- cancel modal (advance was paid — note required) ---------------- */}
      {cancelOpen && (
        <Modal title="Cancel this order" onClose={() => setCancelOpen(false)}
          canSave={cancelNote.trim().length > 0} busy={busy} saveLabel="Cancel the order"
          onSave={async () => {
            await act(() => cancelPurchase(id, cancelNote.trim()), "Purchase cancelled.");
            setCancelOpen(false);
          }}>
          <Field label={`An advance of ${formatTaka(p.paidPaisa)} was paid — how was it resolved?`} required>
            <input className="ipt w-full" placeholder="Refunded in cash, kept as credit…" autoFocus
              value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
          </Field>
        </Modal>
      )}

      {/*  paying a supplier is the same act as collecting a due, so it is the same
           dialog (CLAUDE.md §14) — many methods, part payments, PUR-R04 upheld  */}
      {payOpen && (
        <PayBill purchaseId={id} owedPaisa={p.duePaisa} supplier={p.supplierName}
          onClose={() => setPayOpen(false)}
          onDone={async () => { setPayOpen(false); await load(); setOk("Payment recorded."); }} />
      )}

      {/* ---------------- part receive (DEC-PUR-013) ---------------- */}
      {recvOpen && (
        <Modal title="What arrived" wide onClose={() => setRecvOpen(false)}
          canSave={p.lines.some((l) => toMilli(recvQty[l.id] ?? "") > 0)}
          busy={busy} saveLabel="Take it in"
          onSave={async () => {
            const lines = p.lines
              .map((l) => ({ lineId: l.id, qtyMilli: toMilli(recvQty[l.id] ?? "") }))
              .filter((l) => l.qtyMilli > 0);
            setRecvPending(lines);
            await act(() => receivePurchase(id, { lines }), "Taken in — stock posted for what arrived.");
            setRecvOpen(false);
          }}>
          {p.lines.map((l) => {
            const left = l.qtyMilli - l.receivedQtyMilli;
            if (left <= 0) return null;
            return (
              <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_130px] gap-3 items-center mb-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate">{l.item?.name}</span>
                  <span className="block text-[13px] text-body-soft">
                    {fmtQty(left)} {l.unit?.name} still to come
                    {l.receivedQtyMilli > 0 ? ` · ${fmtQty(l.receivedQtyMilli)} already in` : ""}
                  </span>
                </span>
                <input className="ipt text-right" placeholder="0" inputMode="decimal"
                  value={recvQty[l.id] ?? ""}
                  onChange={(e) => setRecvQty((q) => ({ ...q, [l.id]: e.target.value }))} />
              </div>
            );
          })}
        </Modal>
      )}

      {/* ---------------- return modal ---------------- */}
      {returnOpen && (
        <Modal title="Return goods to supplier" wide onClose={() => setReturnOpen(false)}
          canSave={returnTotal > 0} busy={busy} saveLabel="Record return"
          onSave={async () => {
            const lines = p.lines
              .map((l) => ({ purchaseLineId: l.id, qtyMilli: toMilli(returnQty[l.id] ?? "") }))
              .filter((l) => l.qtyMilli > 0);
            await act(() => createPurchaseReturn({ purchaseId: id, reason: returnReason.trim() || undefined, lines }), "Return recorded.");
            setReturnOpen(false);
          }}>
          {p.lines.map((l) => {
            const max = l.receivedQtyMilli - alreadyReturned(l.id);
            if (max <= 0) return null;
            return (
              <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_130px] gap-3 items-center mb-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate">{l.item?.name}</span>
                  <span className="block text-[13px] text-body-soft">can return up to {fmtQty(max)} {l.unit?.name} · {formatTaka(l.unitPricePaisa)}/unit</span>
                </span>
                <input className="ipt text-right" placeholder="0" inputMode="decimal"
                  value={returnQty[l.id] ?? ""}
                  onChange={(e) => setReturnQty((q) => ({ ...q, [l.id]: e.target.value }))} />
              </div>
            );
          })}
          <Field label="Reason">
            <input className="ipt w-full" placeholder="Wilted, damaged, wrong item…" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
          </Field>
          {returnTotal > 0 && (
            <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px]" style={{ background: "#2b1c35" }}>
              Return value <b>{formatTaka(returnTotal)}</b> → due cut <b>{formatTaka(returnDueCut)}</b>
              {returnCredit > 0 && <> · credit with {p.supplierName} <b style={{ color: "#74f1d7" }}>{formatTaka(returnCredit)}</b></>}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/**
 * Paying the supplier — the house dialog (CLAUDE.md §14). The API takes one
 * payment at a time, so a split bill posts one call per method; PUR-R04 (never
 * more than is owed) is upheld by the dialog and by the server.
 */
function PayBill({ purchaseId, owedPaisa, supplier, onClose, onDone }: {
  purchaseId: string; owedPaisa: number; supplier: string;
  onClose: () => void; onDone: () => void;
}) {
  const pay = usePayRows(owedPaisa, "CASH");
  const billMethods = usePaymentMethods(BILL_TENDERS); // DEC-GBL-001
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function record() {
    setBusy(true); setErr(null);
    try {
      for (const r of pay.pays.filter((x) => x.amountPaisa > 0)) {
        await addPurchasePayment(purchaseId, { amountPaisa: r.amountPaisa, method: r.method as PayMethod, accountId: r.accountId });
      }
      onDone();
    } catch (e) {
      setErr(msg(e, "Could not record the payment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PayDialog
      title="Pay the supplier" who={supplier}
      owedPaisa={owedPaisa} owedLabel="Still owed"
      pay={pay} methods={billMethods} busy={busy} error={err}
      confirmLabel="Pay" leftLabel="Paying now"
      dueAfterLabel="Still owed after this" clearedLabel="Bill cleared"
      onConfirm={record} onClose={onClose} />
  );
}

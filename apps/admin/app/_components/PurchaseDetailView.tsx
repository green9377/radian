"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, DemoBar, Modal, Field, ItemThumb, msg } from "./ItemUI";
import { StatusChip, PayBadge, fmtDate } from "./PurchaseViews";
import {
  getPurchase, receivePurchase, addPurchasePayment, cancelPurchase, createPurchaseReturn, repostPurchaseStock,
  getPurchaseTimeline, isCostJumpRefusal, formatTaka, fmtQty, toMilli, PAY_METHODS,
  type ApiPurchase, type PayMethod, type ActivityEvent,
} from "../_data/api";
import { PayDialog, usePayRows } from "./MoneyBlock";

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
    try { setP(await fn()); setOk(done); await refreshEvents(); }
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
          <span className="flex items-center gap-2">
            <StatusChip status={p.status} />
            <PayBadge p={p} />
          </span>
        }
      />
      {isDemo && <DemoBar what="a sample purchase (actions need the API)" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      {costJump && (
        <div className="rounded-[14px] border-2 px-5 py-4 mb-4" style={{ background: "#fff4e6", borderColor: "#f0b95e" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#8a5209" }}>⚠ Price looks unusual</b>
          <p className="text-[13px] text-body m-0 mb-3">{costJump}</p>
          <div className="flex gap-2">
            <button onClick={() => setCostJump(null)} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px]">
              Never mind
            </button>
            <button disabled={busy}
              onClick={() => act(() => receivePurchase(id, { confirmCost: true }), "Goods received — stock posted, average cost updated.")}
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
          style={{ borderColor: "#f0c98a", background: "#fff8ec" }}>
          <b className="text-[13.5px] block mb-1" style={{ color: "#8a5a00" }}>
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
                      style={{ color: l.receivedQtyMilli >= l.qtyMilli ? "#0e7a3d" : l.receivedQtyMilli > 0 ? "#b45309" : "#9b8aa6" }}>
                      {fmtQty(l.receivedQtyMilli)}
                    </span>
                    <span className="text-[13px] text-right">{formatTaka(l.unitPricePaisa)}</span>
                    <span className="text-[13px] font-medium text-right">{formatTaka(l.lineTotalPaisa)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---------------- payments ---------------- */}
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5">
            <div className="flex items-center justify-between mb-2.5">
              <b className="text-[14px] text-purple">Payments</b>
              {p.status !== "CANCELLED" && p.duePaisa > 0 && (
                <button onClick={() => setPayOpen(true)}
                  className="text-[12.5px] font-medium px-3 py-1.5 rounded-[9px] text-white" style={{ background: ACCENT }}>
                  <Icon name="plus" size={11} /> Add payment
                </button>
              )}
            </div>
            {p.payments.length === 0 && <p className="text-[13px] text-body-soft m-0">Nothing paid yet.</p>}
            {p.payments.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0">
                <span className="text-[13px] text-body">{fmtDate(x.paidAt)} · {PAY_METHODS.find((m) => m.id === x.method)?.label ?? x.method}{x.note ? ` · ${x.note}` : ""}</span>
                <b className="text-[13px]" style={{ color: "#0e7a3d" }}>{formatTaka(x.amountPaisa)}</b>
              </div>
            ))}
          </div>

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

          {/* ---------------- timeline ---------------- */}
          {events.length > 0 && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 mb-5">
              <b className="text-[14px] text-purple block mb-3">Timeline</b>
              <div className="relative pl-5">
                <span className="absolute left-[5px] top-1 bottom-1 w-[2px] rounded-full" style={{ background: "#eadff3" }} />
                {events.map((e) => (
                  <div key={e.id} className="relative mb-3 last:mb-0">
                    <span className="absolute -left-[19px] top-[3px] w-[10px] h-[10px] rounded-full border-2 border-white"
                      style={{ background: e.kind === "payment" ? "#0e7a3d" : e.kind === "system" ? "#8d7a97" : ACCENT }} />
                    <div className="text-[13px] text-body leading-snug">{e.label}</div>
                    <div className="text-[13px] text-body-soft">
                      {new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {e.actorName ? ` · ${e.actorName}` : ""}{e.note ? ` · ${e.note}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
            <div className="flex justify-between text-[13px] py-1"><span className="text-body-soft">Subtotal</span><span>{formatTaka(p.subTotalPaisa)}</span></div>
            {p.discountPaisa > 0 && <div className="flex justify-between text-[13px] py-1"><span className="text-body-soft">Discount</span><span>− {formatTaka(p.discountPaisa)}</span></div>}
            {(p.adjustmentPaisa ?? 0) !== 0 && (
              <div className="flex justify-between text-[13px] py-1">
                <span className="text-body-soft">Adjustment</span>
                <span>{(p.adjustmentPaisa ?? 0) > 0 ? "+ " : "− "}{formatTaka(Math.abs(p.adjustmentPaisa ?? 0))}</span>
              </div>
            )}
            {p.returnedPaisa > 0 && <div className="flex justify-between text-[13px] py-1"><span className="text-body-soft">Returned</span><span>− {formatTaka(p.returnedPaisa)}</span></div>}
            <div className="flex justify-between text-[14px] py-1.5 border-t border-lavender-deep"><b className="text-purple">Payable</b><b className="text-purple">{formatTaka(p.payablePaisa)}</b></div>
            <div className="flex justify-between text-[13px] py-1"><span className="text-body-soft">Paid</span><span style={{ color: "#0e7a3d" }}>{formatTaka(p.paidPaisa)}</span></div>
            <div className="flex justify-between text-[14px] py-1.5 border-t border-lavender-deep">
              <b style={{ color: p.duePaisa > 0 ? "#c0392b" : "#0e7a3d" }}>Due</b>
              <b style={{ color: p.duePaisa > 0 ? "#c0392b" : "#0e7a3d" }}>{formatTaka(p.duePaisa)}</b>
            </div>
          </div>

          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 space-y-2">
            {outstanding && (
              <button disabled={busy} onClick={() => act(() => receivePurchase(id), "Goods received — stock posted, average cost updated.")}
                className="w-full text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[10px]" style={{ background: "#0e7a3d" }}>
                <Icon name="check" size={13} /> Receive everything outstanding
              </button>
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
                className="w-full border border-[#e0a1a1] bg-white text-[#c0392b] text-[13.5px] font-medium px-4 py-2.5 rounded-[10px]">
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
            <div className="rounded-[10px] px-3.5 py-2.5 text-[12.5px]" style={{ background: "#f7f1fb" }}>
              Return value <b>{formatTaka(returnTotal)}</b> → due cut <b>{formatTaka(returnDueCut)}</b>
              {returnCredit > 0 && <> · credit with {p.supplierName} <b style={{ color: "#0e8f74" }}>{formatTaka(returnCredit)}</b></>}
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function record() {
    setBusy(true); setErr(null);
    try {
      for (const r of pay.pays.filter((x) => x.amountPaisa > 0)) {
        await addPurchasePayment(purchaseId, { amountPaisa: r.amountPaisa, method: r.method as PayMethod });
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
      pay={pay} methods={PAY_METHODS} busy={busy} error={err}
      confirmLabel="Pay" leftLabel="Paying now"
      dueAfterLabel="Still owed after this" clearedLabel="Bill cleared"
      onConfirm={record} onClose={onClose} />
  );
}

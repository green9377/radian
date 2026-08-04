"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, DemoBar, Modal, Field, ItemThumb, msg } from "./ItemUI";
import { StatusChip, PayBadge, fmtDate } from "./PurchaseViews";
import {
  getPurchase, receivePurchase, addPurchasePayment, cancelPurchase, createPurchaseReturn,
  getPurchaseTimeline, isCostJumpRefusal, formatTaka, fmtQty, toMilli, PAY_METHODS,
  type ApiPurchase, type PayMethod, type ActivityEvent,
} from "../_data/api";

/*
  Purchase detail — receive, pay, return. RADIAN_PURCHASE_MODULE_ARCHITECTURE.md.

  · Receive       PUR-R05 — partial fine; full receive flips status to RECEIVED
  · Add payment   PUR-R04 — Σ payments can never pass what is owed
  · Return        PUR-R08 / DEC-PUR-006 — qty ≤ received − already returned;
                  money never comes back as cash: due is cut first, excess = credit
  · Cancel        PUR-R06 — only before anything was received
  · No stock move DEC-PUR-002 — Inventory's job, later
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
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [payTk, setPayTk] = useState("");

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  async function load() {
    setLoading(true);
    try {
      const fresh = await getPurchase(id);
      setP(fresh);
      setIsDemo(false);
      // D9 lesson — API is newest-first; a story reads oldest-first
      try { setEvents((await getPurchaseTimeline(id)).slice().reverse()); } catch { setEvents([]); }
    } catch {
      const { DEMO_PURCHASES } = await import("../_data/purchaseDemo");
      const demo = DEMO_PURCHASES.find((d) => d.id === id) ?? DEMO_PURCHASES[0] ?? null;
      setP(demo);
      setIsDemo(true);
      // demo timeline — reconstructed from the record itself, so the card still teaches
      if (demo) {
        const ev: ActivityEvent[] = [
          { id: "e1", kind: "general", label: `Purchase ${demo.purchaseNo} recorded — ${demo.supplierName}`, actorName: "Admin", note: null, createdAt: demo.purchaseDate },
          ...demo.payments.map((x, i) => ({
            id: `ep${i}`, kind: "payment", label: `Paid ${formatTaka(x.amountPaisa)} (${x.method})`, actorName: "Admin", note: x.note ?? null, createdAt: x.paidAt,
          })),
          ...demo.returns.map((r, i) => ({
            id: `er${i}`, kind: "general", label: `Return ${r.returnNo}: ${formatTaka(r.totalPaisa)}`, actorName: "Admin", note: r.reason ?? null, createdAt: r.returnDate,
          })),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setEvents(ev);
      }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const refreshEvents = async () => {
    try { setEvents((await getPurchaseTimeline(id)).slice().reverse()); } catch { /* demo */ }
  };

  async function act(fn: () => Promise<ApiPurchase>, done: string) {
    setBusy(true); setErr(null);
    try { setP(await fn()); setOk(done); await refreshEvents(); }
    catch (e) {
      if (isCostJumpRefusal(e)) {
        const m = msg(e, "Price far from current cost.").replace(/^COST_JUMP:/, "");
        if (confirm(`⚠ ${m}\n\nSave anyway?`)) {
          try { setP(await receivePurchase(id, { confirmCost: true })); setOk(done); await refreshEvents(); }
          catch (e2) { setErr(msg(e2, "Failed.")); }
        }
      } else setErr(msg(e, "That did not work."));
    }
    finally { setBusy(false); }
  }

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!p) return (
    <div className={WRAP}>
      <p className="text-[13px] text-body-soft">Purchase not found. <Link href="/purchases/list" className="underline">Back to the list</Link></p>
    </div>
  );

  const alreadyReturned = (lineId: string) =>
    p.returns.reduce((s, r) => s + r.lines.filter((l) => l.purchaseLineId === lineId).reduce((x, l) => x + l.qtyMilli, 0), 0);

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
                <button onClick={() => { setPayTk(String(p.duePaisa / 100)); setPayOpen(true); }}
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
          {p.notes && <p className="text-[13px] text-body-soft">📝 {p.notes}</p>}
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
              <button disabled={busy} onClick={() => act(() => receivePurchase(id), "Goods received. Average cost updated.")}
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
                  const note = p.paidPaisa > 0
                    ? prompt("An advance was paid — how was it resolved? (required)") ?? ""
                    : "";
                  if (p.paidPaisa > 0 && !note.trim()) return;
                  act(() => cancelPurchase(id, note || undefined), "Purchase cancelled.");
                }}
                className="w-full border border-[#e0a1a1] bg-white text-[#c0392b] text-[13.5px] font-medium px-4 py-2.5 rounded-[10px]">
                Cancel this order
              </button>
            )}
            <Link href="/purchases/list" className="block text-center text-[12.5px] text-body-soft underline pt-1">← All purchases</Link>
          </div>

          <div className="rounded-[14px] border px-4 py-3 text-[12px] text-body leading-relaxed" style={{ background: "#f7f1fb", borderColor: "#e3d0f2" }}>
            <b className="text-purple block mb-1">Why no stock button?</b>
            Stock's only owner is Inventory (DEC-PUR-002 / DEC-ITM-005). When it ships, receives here will post stock automatically — nothing on this page will change.
          </div>
        </div>
      </div>

      {/* ---------------- add payment modal ---------------- */}
      {payOpen && (
        <Modal title={`Add payment — due ${formatTaka(p.duePaisa)}`} onClose={() => setPayOpen(false)}
          canSave={tkToPaisa(payTk) > 0 && tkToPaisa(payTk) <= p.duePaisa} busy={busy} saveLabel="Record payment"
          onSave={async () => {
            await act(() => addPurchasePayment(id, { amountPaisa: tkToPaisa(payTk), method: payMethod }), "Payment recorded.");
            setPayOpen(false);
          }}>
          <Field label="Method" required>
            <div className="flex flex-wrap gap-1.5">
              {PAY_METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => setPayMethod(m.id)}
                  className="text-[12px] font-medium px-2.5 py-1.5 rounded-[9px] border"
                  style={payMethod === m.id
                    ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                    : { background: "#fff", borderColor: "#e3d7ec", color: "#6b5878" }}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Amount (৳)" required hint={tkToPaisa(payTk) > p.duePaisa ? "More than the due — PUR-R04 will refuse it" : undefined}>
            <input className="ipt w-full text-right" inputMode="decimal" value={payTk} onChange={(e) => setPayTk(e.target.value)} autoFocus />
          </Field>
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
          <p className="text-[12.5px] text-body-soft mt-0 mb-3">
            Money never comes back as cash (DEC-PUR-006) — the due is cut first, anything beyond it becomes <b>credit</b> for the next purchase from {p.supplierName}.
          </p>
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

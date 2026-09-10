"use client";

import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "./backdropClose";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, Field, msg } from "./ItemUI";
import { fmtDate } from "./PurchaseViews";
import {
  getSupplier, getSupplierLedger, getSupplierTimeline, removeSupplier,
  paySupplier, supplierPayPreview, adjustSupplier, applySupplierCredit,
  formatTaka, fmtQty,
  type ApiSupplierDetail, type SupplierLedger, type ActivityEvent, type PayMethod,
} from "../_data/api";
import { SupplierAvatar, StatusPill } from "./SupplierViews";
import { usePaymentMethods, BILL_TENDERS } from "./MoneyBlock";
import { MethodChip } from "./BillUI";

/*
  Supplier detail — profile · ledger · Pay (allocation confirm) · adjustment ·
  items supplied · manual order message (DEC-SUP-003).
  Architecture: RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (locked 23 Jul 2026).

  DEC-SUP-006: "Pay" takes ONE amount, shows the oldest-first split, lets the
  owner drag figures between bills before confirming. Excess parks as credit —
  money never comes back as cash (DEC-PUR-006).
*/

const tkToPaisa = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const KIND_META: Record<string, { icon: string; color: string; bg: string }> = {
  OPENING:      { icon: "book",  color: "#b0a1ba", bg: "#29242e" },
  PURCHASE:     { icon: "box",   color: "#ce6ef7", bg: "#2e1a38" },
  PAYMENT:      { icon: "cash",  color: "#76efab", bg: "#1f3529" },
  BILL_PAYMENT: { icon: "cash",  color: "#76efab", bg: "#1f3529" },
  RETURN:       { icon: "truck", color: "#f7a96e", bg: "#3b2b17" },
  ADJUSTMENT:   { icon: "edit",  color: "#79abe2", bg: "#1b2838" },
};

export default function SupplierDetailView({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [s, setS] = useState<ApiSupplierDetail | null>(null);
  const [ledger, setLedger] = useState<SupplierLedger | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"ledger" | "items" | "credits" | "timeline">("ledger");

  async function load() {
    setLoading(true);
    try {
      const [d, l] = await Promise.all([getSupplier(supplierId), getSupplierLedger(supplierId)]);
      setS(d); setLedger(l);
      getSupplierTimeline(supplierId).then(setTimeline).catch(() => setTimeline([]));
    } catch (e) { setErr(msg(e, "Could not load this supplier.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [supplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [payOpen, setPayOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!s) return (
    <div className={WRAP}>
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      <p className="text-[13px] text-body-soft">Not found. <Link className="underline" href="/suppliers/list">Back to suppliers</Link></p>
    </div>
  );

  const isVendor = !!s.type?.isFulfillment; // DEC-SUP-009 — vendor face

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow={`Master Data · Suppliers · ${isVendor ? "Vendors · " : ""}${s.supplierNo}`}
        title={s.nickname ? `${s.name} (${s.nickname})` : s.name}
        blurb={`${s.type?.name ?? ""}${s.market ? ` · ${s.market}` : ""}${s.phone ? ` · ${s.phone}` : ""}`}
        right={
          <span className="flex gap-2">
            <button onClick={() => setPayOpen(true)}
              className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
              style={{ background: ACCENT }}>
              <Icon name="cash" size={13} /> Pay supplier
            </button>
            <Link href={`/suppliers/${s.id}/edit`}
              className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2">
              <Icon name="edit" size={13} /> Edit
            </Link>
          </span>
        }
      />
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}

      {/* ---------------- balance strip ---------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { l: "Due (we owe)", v: formatTaka(s.duePaisa), c: s.duePaisa > 0 ? "#c0392b" : "#0e7a3d", bg: s.duePaisa > 0 ? "#3b1a16" : "#1f3427", icon: "wallet" },
          { l: "Credit we hold", v: formatTaka(s.creditPaisa), c: "#0e8f74", bg: "#20332e", icon: "gem" },
          { l: "Bought (all time)", v: formatTaka(s.totalBoughtPaisa), c: "#470066", bg: "#2e1a38", icon: "cart" },
          { l: "Purchases", v: String(s.purchaseCount), sub: s.lastPurchaseAt ? `last ${fmtDate(s.lastPurchaseAt)}` : "", c: "#2563a8", bg: "#1b2838", icon: "box" },
        ].map((k) => (
          <div key={k.l} className="rounded-[14px] px-4 py-3.5 flex items-center gap-3" style={{ background: k.bg }}>
            <span className="w-[36px] h-[36px] rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: k.c }}>
              <Icon name={k.icon} size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: k.c }}>{k.l}</span>
              <b className="block text-[18px] leading-[1.2] font-display" style={{ color: k.c, fontVariantNumeric: "tabular-nums" }}>{k.v}</b>
              {"sub" in k && k.sub ? <span className="block text-[10.5px]" style={{ color: k.c, opacity: 0.75 }}>{k.sub}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div>
          {/* ---------------- tabs ---------------- */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {([
              ["ledger", `Ledger`],
              ["items", `${isVendor ? "Products" : "What we buy"} (${isVendor ? s.items.length : (s.bought?.length ?? 0)})`],
              ["credits", `Credits (${s.credits.filter((c) => !c.appliedPurchaseId && !c.appliedAt).length})`],
              ["timeline", "Timeline"],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border"
                style={tab === id
                  ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                  : { background: "#fff", borderColor: "#3f3248", color: "#b0a1ba" }}>
                {label}
              </button>
            ))}
            <button onClick={() => setAdjOpen(true)}
              className="ml-auto text-[12.5px] font-medium px-3.5 py-2 rounded-[10px] border border-lavender-deep bg-white text-purple">
              + Adjustment
            </button>
          </div>

          {/* ---------------- ledger — a bank book you can actually read:
               day headings, a coloured bead per event, the method as a chip,
               and the running "owed after this" under every amount  ---------------- */}
          {tab === "ledger" && ledger && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
              <div className="flex items-center justify-between pl-4 pr-4 py-2" style={{ background: "#470066" }}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-white inline-flex items-center gap-2">
                  <Icon name="book" size={13} /> Ledger
                </span>
                <span className="text-[11px] font-semibold text-white/90">
                  {s.duePaisa > 0 ? `Owed now ${formatTaka(s.duePaisa)}` : "Nothing owed"}
                </span>
              </div>

              <div className="px-4 py-3">
                {ledger.events.length === 0 && (
                  <p className="text-[13px] text-body-soft m-0 py-2">Nothing yet — the first purchase or opening due starts the story.</p>
                )}
                {(() => {
                  /*  running balance: events arrive newest-first and each amount is
                      signed against the due, so walking down the list unwinds it  */
                  let bal = ledger.netDuePaisa;
                  let lastDay = "";
                  return ledger.events.map((e, i) => {
                    const after = bal;
                    bal -= e.amountPaisa;
                    const m = KIND_META[e.kind] ?? KIND_META.ADJUSTMENT;
                    const day = fmtDate(e.at);
                    const showDay = day !== lastDay;
                    lastDay = day;
                    /*  the server label carries "(CASH)" — that becomes a chip  */
                    const methodMatch = /\(([A-Z]+)\)\s*$/.exec(e.label);
                    const label = e.label.replace(/\s*\([A-Z]+\)\s*$/, "").replace(/^Payment on /, "Paid ");
                    return (
                      <div key={i}>
                        {showDay && (
                          <div className={"flex items-center gap-2 " + (i === 0 ? "pt-1" : "pt-3")}>
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
                              style={{ background: "#2b1c35", color: "#ce6ef7" }}>{day}</span>
                            <span className="flex-1 h-px" style={{ background: "#2c1e37" }} />
                          </div>
                        )}
                        <div className="flex items-center gap-3 py-2.5 border-b border-lavender-deep/50 last:border-0">
                          <span className="w-[32px] h-[32px] rounded-full grid place-items-center shrink-0" style={{ background: m.bg, color: m.color }}>
                            <Icon name={m.icon} size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-medium text-body">
                                {e.refId
                                  ? <Link className="hover:underline" style={{ color: ACCENT }} href={`/purchases/${e.refId}`}>{label}</Link>
                                  : label}
                              </span>
                              {methodMatch && <MethodChip method={methodMatch[1]} />}
                            </span>
                            {(e.detail?.note || (e.kind === "PAYMENT" && (e.detail?.allocations?.length ?? 0) > 1) || e.kind === "RETURN") && (
                              <span className="block text-[11.5px] text-body-soft mt-0.5">
                                {e.detail?.note ? e.detail.note : ""}
                                {e.kind === "PAYMENT" && (e.detail?.allocations?.length ?? 0) > 1
                                  ? `${e.detail?.note ? " · " : ""}split over ${e.detail?.allocations?.length} bills` : ""}
                                {e.kind === "RETURN" && e.detail
                                  ? `${e.detail?.note ? " · " : ""}due cut ${formatTaka(e.detail.dueCutPaisa ?? 0)}${(e.detail.creditPaisa ?? 0) > 0 ? ` · credit ${formatTaka(e.detail.creditPaisa ?? 0)}` : ""}` : ""}
                              </span>
                            )}
                          </span>
                          <span className="text-right shrink-0">
                            <b className="block text-[14px]" style={{ color: e.amountPaisa >= 0 ? "#e1837a" : "#76efab", fontVariantNumeric: "tabular-nums" }}>
                              {e.amountPaisa >= 0 ? "+" : "−"}{formatTaka(Math.abs(e.amountPaisa))}
                            </b>
                            <span className="block text-[10.5px] text-body-soft" style={{ fontVariantNumeric: "tabular-nums" }}>
                              owed {formatTaka(Math.max(0, after))}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {ledger.months.length > 0 && (
                <div className="px-4 py-3 border-t border-lavender-deep bg-[#271c32]">
                  <b className="text-[11px] font-semibold uppercase tracking-[0.05em] text-purple block mb-2">Month by month</b>
                  {ledger.months.map((m) => (
                    <div key={m.month} className="flex items-center justify-between text-[12px] py-1">
                      <span className="font-semibold text-purple">{m.month}</span>
                      <span className="flex gap-2">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: "#2e1a38", color: "#ce6ef7" }}>
                          bought <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(m.bought)}</b>
                        </span>
                        <span className="px-2 py-0.5 rounded-full" style={{ background: "#1f3427", color: "#76efab" }}>
                          paid <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(m.paid)}</b>
                        </span>
                        {m.returned > 0 && (
                          <span className="px-2 py-0.5 rounded-full" style={{ background: "#3b2617", color: "#f7a96e" }}>
                            returned <b style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(m.returned)}</b>
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------- items / products (DEC-SUP-004 · DEC-SUP-009 A) ----------------
               Vendor price = Item.standardCostPaisa (one cost, one owner — no second
               "vendorPrice" column to drift). Selling side comes from linked Products. */}
          {tab === "items" && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
              {/*  DEC-SUP-011 — for a goods supplier this is his history with us:
                   what, how often, and what he charged last. A vendor keeps the
                   old view, because there the item IS his product (DEC-SUP-009).  */}
              {!isVendor && (
                <>
                  {(s.bought?.length ?? 0) === 0 && (
                    <p className="text-[13px] font-medium text-body m-0">Nothing bought from him yet.</p>
                  )}
                  {(s.bought?.length ?? 0) > 0 && (
                    <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px_92px] gap-2 px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
                      <span>Item</span>
                      <span className="text-right">Bills</span>
                      <span className="text-right">Bought</span>
                      <span className="text-right">Last price</span>
                      <span className="text-right">Average</span>
                    </div>
                  )}
                  {(s.bought ?? []).map((b) => (
                    <Link key={b.itemId} href={`/items/${b.itemId}`}
                      className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px_92px] gap-2 items-center py-2 border-b border-lavender-deep/60 last:border-0 hover:bg-lavender/20 rounded-[8px] px-2">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="w-[34px] h-[34px] rounded-[9px] overflow-hidden bg-lavender/40 grid place-items-center shrink-0">
                          {b.imageUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <Icon name="box" size={15} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-body truncate">{b.name}</span>
                          <span className="block text-[11.5px] text-body-soft truncate">
                            {b.sku}
                            {b.lastPurchaseNo ? ` · last on ${b.lastPurchaseNo}` : ""}
                            {b.lastAt ? ` · ${new Date(b.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="text-[13px] text-right">{b.timesBought}</span>
                      <span className="text-[13px] text-right">{fmtQty(b.qtyMilli)}{b.unitName ? ` ${b.unitName}` : ""}</span>
                      <span className="text-[13px] text-right font-medium">{formatTaka(b.lastPricePaisa)}</span>
                      <span className="text-[13px] text-right text-body-soft">{formatTaka(b.avgPricePaisa)}</span>
                    </Link>
                  ))}
                </>
              )}

              {isVendor && (
                <>
                  {s.items.length === 0 && (
                    <p className="text-[13px] font-medium text-body m-0">
                      Nothing yet — set “Supplier” on an item to link it here.
                    </p>
                  )}
                  {s.items.length > 0 && (
                    <div className="grid grid-cols-[minmax(0,1fr)_92px_92px_92px] gap-2 px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
                      <span>Product</span>
                      <span className="text-right">Vendor price</span>
                      <span className="text-right">Selling</span>
                      <span className="text-right">Margin</span>
                    </div>
                  )}
                  {s.items.map((it) => {
                    const product = it.products.find((p) => p.isPublished) ?? it.products[0] ?? null;
                    const selling = product?.sellingPricePaisa ?? null;
                    const margin = selling != null ? selling - it.standardCostPaisa : null;
                    return (
                      <Link key={it.id} href={`/items/${it.id}`}
                        className="grid grid-cols-[minmax(0,1fr)_92px_92px_92px] gap-2 items-center py-2 border-b border-lavender-deep/60 last:border-0 hover:bg-lavender/20 rounded-[8px] px-2">
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="w-[34px] h-[34px] rounded-[9px] overflow-hidden bg-lavender/40 grid place-items-center shrink-0">
                            {it.imageUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <Icon name="box" size={15} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-body truncate">{it.name}</span>
                            <span className="block text-[11.5px] text-body-soft truncate">
                              {it.sku}
                              {product ? (product.isPublished ? " · live on site" : " · product unpublished") : " · no product yet"}
                            </span>
                          </span>
                        </span>
                        <span className="text-[13px] text-right">{formatTaka(it.standardCostPaisa)}</span>
                        <span className="text-[13px] text-right">{selling != null ? formatTaka(selling) : "—"}</span>
                        <span className="text-[13px] font-semibold text-right"
                          style={{ color: margin == null ? "#b0a2b8" : margin >= 0 ? "#0e7a3d" : "#c0392b" }}>
                          {margin != null ? formatTaka(margin) : "—"}
                        </span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {tab === "credits" && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
              {s.credits.length === 0 && <p className="text-[13px] text-body-soft m-0">No credit history yet. Credits appear from over-payment or large returns.</p>}
              {s.credits.map((c) => {
                const consumed = !!(c.appliedPurchaseId || c.appliedAt);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0">
                    <span className="min-w-0">
                      <span className="block text-[13px] text-body">{c.note ?? "Credit"}</span>
                      <span className="block text-[11.5px] text-body-soft">{fmtDate(c.createdAt)}{consumed ? " · consumed" : " · open"}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <b className="text-[13px]" style={{ color: consumed ? "#b0a2b8" : "#74f1d7" }}>{formatTaka(c.amountPaisa)}</b>
                      {!consumed && (
                        <button
                          onClick={async () => {
                            try { await applySupplierCredit(s.id, c.id); load(); }
                            catch (e) { setErr(msg(e, "Could not apply the credit.")); }
                          }}
                          disabled={s.duePaisa <= 0}
                          title={s.duePaisa <= 0 ? "No due right now — it waits for the next purchase" : "Cut this credit from the current due"}
                          className="text-[12px] font-medium px-3 py-1.5 rounded-[9px] border border-lavender-deep bg-white text-purple disabled:opacity-50">
                          Apply to due
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {s.credits.some((c) => !c.appliedPurchaseId && !c.appliedAt) && s.duePaisa <= 0 && (
                <p className="text-[12px] text-body-soft mt-3 mb-0">Open credit waits for the next purchase — the moment there is due, "Apply to due" wakes up.</p>
              )}
            </div>
          )}

          {/* ---------------- timeline ---------------- */}
          {tab === "timeline" && (
            <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
              {timeline.length === 0 && <p className="text-[13px] text-body-soft m-0">No events yet.</p>}
              {timeline.map((t) => (
                <div key={t.id} className="py-2 border-b border-lavender-deep/60 last:border-0">
                  <span className="block text-[13px] text-body">{t.label}</span>
                  <span className="block text-[11.5px] text-body-soft">{fmtDate(t.createdAt)} · {t.actorName}{t.note ? ` · ${t.note}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- profile rail ---------------- */}
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <SupplierAvatar s={s} size={48} />
            <span>
              <b className="block text-[14px] text-purple">{s.name}</b>
              <StatusPill status={s.status} />
            </span>
          </div>
          <dl className="m-0 text-[12.5px]">
            {[
              ["Phone", s.phone],
              ["Contact", s.contactPerson],
              ["Market", s.market],
              ["Address", s.address],
              ["Terms", s.paymentTerms],
              ["Payout", s.payoutInfo],
              ["Lead time", s.leadTimeHours != null ? `${s.leadTimeHours}h` : null],
              ["Notify", s.notifyChannel === "OFF" ? "Off" : `${s.notifyChannel === "WHATSAPP" ? "WhatsApp" : "SMS"} · ${s.notifyMode.toLowerCase()}${s.notifyPhone ? ` · ${s.notifyPhone}` : ""}`],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l as string} className="flex gap-2 py-1 border-b border-lavender-deep/40 last:border-0">
                <dt className="w-[72px] shrink-0 text-body-soft">{l}</dt>
                <dd className="m-0 text-body min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {s.notes && <p className="text-[12.5px] text-body-soft mt-2 mb-0">{s.notes}</p>}

          {/* DEC-SUP-003 — manual order message, today's tool */}
          {s.notifyChannel !== "OFF" && (
            <button onClick={() => setMsgOpen(true)}
              className="w-full mt-4 border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2.5 rounded-[12px] inline-flex items-center justify-center gap-2">
              <Icon name="mail" size={13} /> Send order message
            </button>
          )}
          <button
            onClick={async () => {
              if (!confirm(`Delete ${s.name}? History stays (soft delete). A supplier with due cannot be deleted.`)) return;
              try { await removeSupplier(s.id); router.push("/suppliers/list"); }
              catch (e) { setErr(msg(e, "Could not delete.")); }
            }}
            className="w-full mt-2 text-[12.5px] text-body-soft underline">
            Delete supplier
          </button>
        </div>
      </div>

      {payOpen && <PayModal s={s} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); load(); }} />}
      {adjOpen && <AdjustModal s={s} onClose={() => setAdjOpen(false)} onDone={() => { setAdjOpen(false); load(); }} />}
      {msgOpen && <OrderMessageModal s={s} onClose={() => setMsgOpen(false)} />}
    </div>
  );
}

/* ================================================================ pay modal
   DEC-SUP-006 — one amount in, oldest-first split shown, every line editable,
   excess parks as credit. Confirm writes SupplierPayment + real PurchasePayments. */

function PayModal({ s, onClose, onDone }: { s: ApiSupplierDetail; onClose: () => void; onDone: () => void }) {
  const [amountTk, setAmountTk] = useState("");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const payMethods = usePaymentMethods(BILL_TENDERS); // DEC-GBL-001
  const [note, setNote] = useState("");
  const [split, setSplit] = useState<{ purchaseId: string | null; purchaseNo: string | null; duePaisa: number; amountTk: string }[]>([]);
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = tkToPaisa(amountTk);
  const allocated = split.reduce((sum, a) => sum + tkToPaisa(a.amountTk), 0);
  const excess = Math.max(amount - allocated, 0);

  async function preview() {
    if (amount <= 0) { setErr("Enter the amount first."); return; }
    setErr(null);
    try {
      const p = await supplierPayPreview(s.id, amount);
      setSplit(p.split.map((x) => ({
        purchaseId: x.purchaseId,
        purchaseNo: x.purchaseNo,
        duePaisa: x.duePaisa,
        amountTk: x.amountPaisa > 0 ? String(x.amountPaisa / 100) : "",
      })));
      setPreviewed(true);
    } catch (e) { setErr(msg(e, "Could not build the split.")); }
  }

  async function confirmPay() {
    if (allocated > amount) { setErr("The split adds up to more than the amount."); return; }
    setBusy(true); setErr(null);
    try {
      await paySupplier(s.id, {
        amountPaisa: amount,
        method,
        note: note.trim() || undefined,
        allocations: split
          .filter((a) => tkToPaisa(a.amountTk) > 0)
          .map((a) => ({ purchaseId: a.purchaseId, amountPaisa: tkToPaisa(a.amountTk) })),
      });
      onDone();
    } catch (e) { setErr(msg(e, "Could not record the payment.")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Pay ${s.nickname || s.name}`} onClose={onClose}>
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      <p className="text-[12.5px] text-body-soft mt-0 mb-3">
        Current due <b style={{ color: "#e1837a" }}>{formatTaka(s.duePaisa)}</b>
        {s.creditPaisa > 0 && <> · credit already held <b style={{ color: "#74f1d7" }}>{formatTaka(s.creditPaisa)}</b></>}
        {s.payoutInfo && <> · payout: <b>{s.payoutInfo}</b></>}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <Field label="Amount (tk)" required>
          <input className="ipt w-full" inputMode="decimal" placeholder="5000" autoFocus
            value={amountTk} onChange={(e) => { setAmountTk(e.target.value); setPreviewed(false); }} />
        </Field>
        <Field label="Method">
          <div className="flex gap-1.5 flex-wrap">
            {payMethods.map((m) => (
              <button key={m.id} type="button" onClick={() => setMethod(m.id as PayMethod)}
                className="text-[12px] font-medium px-3 py-1.5 rounded-[9px] border"
                style={method === m.id
                  ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                  : { background: "#fff", borderColor: "#3f3248", color: "#b0a1ba" }}>
                {m.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Note">
        <input className="ipt w-full" placeholder="Friday settle-up" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {!previewed ? (
        <button onClick={preview} disabled={amount <= 0}
          className="w-full text-white text-[13.5px] font-semibold px-4 py-3 rounded-[12px] disabled:opacity-60 mt-1"
          style={{ background: ACCENT }}>
          Show the split →
        </button>
      ) : (
        <>
          {/* SUP-R05 — oldest first, hand-adjustable */}
          <div className="rounded-[12px] border border-lavender-deep px-4 py-3 mb-3">
            <b className="text-[12.5px] text-purple block mb-2">Where it lands — oldest first, edit freely</b>
            {split.length === 0 && <p className="text-[12.5px] text-body-soft m-0">No open dues — the whole amount parks as credit.</p>}
            {split.map((a, i) => (
              <div key={a.purchaseId ?? "opening"} className="flex items-center gap-2 py-1.5">
                <span className="text-[12.5px] text-body flex-1 min-w-0 truncate">
                  {a.purchaseNo ?? "Opening due"} <span className="text-body-soft">· due {formatTaka(a.duePaisa)}</span>
                </span>
                <input className="ipt w-[110px] text-right" inputMode="decimal" value={a.amountTk}
                  onChange={(e) => setSplit((p) => p.map((x, xi) => (xi === i ? { ...x, amountTk: e.target.value } : x)))} />
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-lavender-deep/60 text-[12.5px]">
              <span className="text-body-soft">Allocated {formatTaka(allocated)} of {formatTaka(amount)}</span>
              {excess > 0 && <b style={{ color: "#74f1d7" }}>{formatTaka(excess)} → credit (no cash back)</b>}
              {allocated > amount && <b style={{ color: "#e1837a" }}>over by {formatTaka(allocated - amount)}</b>}
            </div>
          </div>
          <button onClick={confirmPay} disabled={busy || amount <= 0 || allocated > amount}
            className="w-full text-white text-[13.5px] font-semibold px-4 py-3 rounded-[12px] disabled:opacity-60"
            style={{ background: ACCENT }}>
            {busy ? "Recording…" : `Record payment ${formatTaka(amount)}`}
          </button>
        </>
      )}
    </Modal>
  );
}

/* ================================================================ adjustment */

function AdjustModal({ s, onClose, onDone }: { s: ApiSupplierDetail; onClose: () => void; onDone: () => void }) {
  const [sign, setSign] = useState<1 | -1>(-1);
  const [amountTk, setAmountTk] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveAdj() {
    const amt = sign * Math.abs(tkToPaisa(amountTk));
    if (amt === 0) { setErr("Enter an amount."); return; }
    if (!note.trim()) { setErr("Write why — an unexplained correction is not a correction (SUP-R04)."); return; }
    setBusy(true); setErr(null);
    try { await adjustSupplier(s.id, { amountPaisa: amt, note: note.trim() }); onDone(); }
    catch (e) { setErr(msg(e, "Could not save the adjustment.")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Adjustment entry" onClose={onClose}>
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      <p className="text-[12.5px] font-medium text-body mt-0 mb-3">
        Minus = due goes down, plus = due goes up.
      </p>
      <div className="flex gap-2 items-start">
        <div className="flex rounded-[10px] border border-lavender-deep overflow-hidden shrink-0 mt-[26px]">
          {([-1, 1] as const).map((v) => (
            <button key={v} type="button" onClick={() => setSign(v)}
              className="px-3.5 py-2 text-[14px] font-bold"
              style={sign === v ? { background: ACCENT, color: "#fff" } : { background: "#fff", color: "#b0a1ba" }}>
              {v === -1 ? "−" : "+"}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Field label="Amount (tk)" required>
            <input className="ipt w-full" inputMode="decimal" autoFocus value={amountTk} onChange={(e) => setAmountTk(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Why" required>
        <input className="ipt w-full" placeholder="Opening due was 500 too high — old khata recount" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button onClick={saveAdj} disabled={busy}
        className="w-full text-white text-[13.5px] font-semibold px-4 py-3 rounded-[12px] disabled:opacity-60"
        style={{ background: ACCENT }}>
        {busy ? "Saving…" : "Save adjustment"}
      </button>
    </Modal>
  );
}

/* ================================================================ order message
   DEC-SUP-003 / SUP-R07 — product info ONLY, never the customer. Manual today:
   compose → opens WhatsApp (wa.me) or the phone's SMS app with the text ready. */

function OrderMessageModal({ s, onClose }: { s: ApiSupplierDetail; onClose: () => void }) {
  const [itemName, setItemName] = useState(s.items[0]?.name ?? "");
  const [qty, setQty] = useState("1");
  const [readyBy, setReadyBy] = useState(() => {
    const d = new Date(Date.now() + (s.leadTimeHours ?? 4) * 3600_000);
    return d.toISOString().slice(0, 16);
  });
  const [extra, setExtra] = useState("");

  const text = useMemo(() => {
    const when = new Date(readyBy);
    const whenTxt = isNaN(when.getTime()) ? readyBy : when.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    // SUP-R07 — product, qty, time. NOTHING about the customer.
    return `Radian order: ${itemName} × ${qty}. Please have it ready by ${whenTxt}.${extra.trim() ? ` ${extra.trim()}` : ""}`;
  }, [itemName, qty, readyBy, extra]);

  const phone = (s.notifyPhone || s.phone || "").replace(/[^\d+]/g, "");
  const waPhone = phone.startsWith("+") ? phone.slice(1) : phone.startsWith("0") ? `880${phone.slice(1)}` : phone;
  const href = s.notifyChannel === "WHATSAPP"
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
    : `sms:${phone}?body=${encodeURIComponent(text)}`;

  return (
    <Modal title={`Message ${s.nickname || s.name}`} onClose={onClose}>
      <p className="text-[12.5px] font-medium text-body mt-0 mb-3">
        Product info only — customer details <b>never</b> go to a vendor (SUP-R07).
      </p>
      <Field label="Product">
        {s.items.length > 0 ? (
          <select className="ipt w-full" value={itemName} onChange={(e) => setItemName(e.target.value)}>
            {s.items.map((it) => <option key={it.id} value={it.name}>{it.name}</option>)}
            <option value="">(type below)</option>
          </select>
        ) : (
          <input className="ipt w-full" placeholder="Chocolate cake 1kg" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        )}
      </Field>
      {s.items.length > 0 && itemName === "" && (
        <Field label="Product name">
          <input className="ipt w-full" placeholder="Chocolate cake 1kg" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Qty">
          <input className="ipt w-full" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Ready by" hint={s.leadTimeHours ? `Lead time ${s.leadTimeHours}h — pre-filled.` : undefined}>
          <input type="datetime-local" className="ipt w-full" value={readyBy} onChange={(e) => setReadyBy(e.target.value)} />
        </Field>
      </div>
      <Field label="Extra note">
        <input className="ipt w-full" placeholder="Write 'Happy Birthday' on top" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      <div className="rounded-[12px] px-4 py-3 mb-3 text-[12.5px] text-body" style={{ background: "#282031" }}>{text}</div>
      <a href={href} target="_blank" rel="noreferrer"
        className="block text-center text-white text-[13.5px] font-semibold px-4 py-3 rounded-[12px]"
        style={{ background: s.notifyChannel === "WHATSAPP" ? "#25D366" : ACCENT }}>
        Open {s.notifyChannel === "WHATSAPP" ? "WhatsApp" : "SMS"} →
      </a>
    </Modal>
  );
}

/* ================================================================ shared modal */

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(40,20,60,0.45)" }} {...backdropClose(onClose)}>
      <div className="bg-white rounded-[18px] shadow-soft w-full max-w-[520px] max-h-[90vh] overflow-y-auto px-6 py-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <b className="text-[15px] text-purple">{title}</b>
          <button onClick={onClose} className="text-body-soft hover:text-body text-[16px] leading-none" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

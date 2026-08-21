"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  formatTaka,
  getOrder,
  getOrderTimeline,
  type ApiOrder,
} from "../_data/api";

/*
  The counter bill, after the sale (owner, 21 Aug: "pos a order complete krle o
  jn amn page ase" — the same page a purchase gets). One record, read the same
  way on both sides of the shop: what was on it, what was paid, what happened.

  It is an Order (DEC-POS-001), so nothing new is stored for this screen; it
  reads the same row the online order page reads and lays it out the way the
  purchase bill does.
*/

const WRAP = "px-5 md:px-7 pt-5 pb-10 max-w-[1500px]";
const CARD = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";
const ACCENT = "#7a2ea8";

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export default function PosSaleView({ id }: { id: string }) {
  const [o, setO] = useState<ApiOrder | null>(null);
  const [events, setEvents] = useState<{ createdAt?: string; kind: string; label: string; actorName?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setO(await getOrder(id));
      // oldest first — a bill reads as a story
      try { setEvents((await getOrderTimeline(id)).slice().reverse()); } catch { setEvents([]); }
    } catch { setO(null); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!o) return (
    <div className={WRAP}>
      <p className="text-[13px] text-body-soft">That bill was not found. <Link href="/pos/sales" className="underline">All counter sales</Link></p>
    </div>
  );

  const lines = o.lines ?? [];
  const txns = (o.transactions ?? []).filter((t) => t.kind !== "REFUND");
  const due = Math.max(0, o.totalPaisa - o.paidPaisa);
  const advance = o.salesStatus === "placed";

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
          </p>
        </div>

        {/*  the two doors the owner asked for: from a bill, straight back to
             work — sell the next one, or buy the next one  */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/pos/sell"
            className="text-[13px] font-medium text-white px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={14} /> Sell (counter)
          </Link>
          <Link href="/purchases/new"
            className="text-[13px] font-medium text-purple border border-lavender-deep px-4 py-2.5 rounded-[10px] inline-flex items-center gap-1.5 hover:bg-lavender/40">
            <Icon name="plus" size={14} /> New purchase
          </Link>
          <span className={"text-[12px] font-medium px-3 py-1.5 rounded-full " + (advance
            ? "bg-[#fff4e2] text-[#b45309]"
            : "bg-[#e9f9ef] text-[#0e7a3d]")}>
            {advance ? "Advance — not handed over" : "Completed"}
          </span>
          <span className={"text-[12px] font-medium px-3 py-1.5 rounded-full " + (due > 0
            ? "bg-[#fff4e2] text-[#b45309]"
            : "bg-[#e9f9ef] text-[#0e7a3d]")}>
            {due > 0 ? `Due ${formatTaka(due)}` : "Paid"}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div>
          {/* ---------------- items ---------------- */}
          <div className={CARD + " overflow-hidden mb-5"}>
            <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-3 items-center px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white/95" style={{ background: "#470066" }}>
              <span>Item</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span>
            </div>
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_90px_110px_110px] gap-3 items-center px-4 py-3 border-t border-lavender-deep">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-purple truncate">{l.name}</div>
                  {l.sizeLabel && <div className="text-[11.5px] text-body-soft">{l.sizeLabel}</div>}
                </div>
                <div className="text-center text-[13px]">{l.qty}</div>
                <div className="text-right text-[13px]">{formatTaka(l.unitPaisa)}</div>
                <div className="text-right text-[13.5px] font-semibold text-purple" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatTaka(l.linePaisa)}
                </div>
              </div>
            ))}
            {lines.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-body-soft">No lines on this bill.</div>}
          </div>

          {/* ---------------- payments ---------------- */}
          <div className={CARD + " px-5 py-4 mb-5"}>
            <b className="text-[14px] text-purple block mb-2.5">Payments</b>
            {txns.length === 0 && <p className="text-[13px] text-body-soft m-0">Nothing paid yet.</p>}
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-lavender-deep/60 last:border-0">
                <span className="text-[13px] text-body">
                  {fmtWhen(t.createdAt)} · {t.method}
                  {t.actorName ? <span className="text-body-soft"> · {t.actorName}</span> : null}
                </span>
                <b className="text-[13px]" style={{ color: "#0e7a3d" }}>{formatTaka(t.amountPaisa)}</b>
              </div>
            ))}
          </div>

          {/* ---------------- timeline ---------------- */}
          {events.length > 0 && (
            <div className={CARD + " px-5 py-4"}>
              <b className="text-[14px] text-purple block mb-2.5">Timeline</b>
              {events.map((e, i) => (
                <div key={i} className="flex gap-3 py-1.5">
                  <span className="w-[7px] h-[7px] rounded-full mt-[6px] shrink-0" style={{ background: ACCENT }} />
                  <div>
                    <div className="text-[13px] text-body">{e.label}</div>
                    <div className="text-[11.5px] text-body-soft">{fmtWhen(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- money ---------------- */}
        <div className="space-y-4">
          <div className={CARD + " px-5 py-4 text-[13px] space-y-1.5"}>
            <div className="flex justify-between"><span className="text-body-soft">Subtotal</span><span>{formatTaka(o.subtotalPaisa)}</span></div>
            {o.discountPaisa > 0 && <div className="flex justify-between"><span className="text-body-soft">Discount</span><span className="text-[#0e7a3d]">− {formatTaka(o.discountPaisa)}</span></div>}
            <div className="flex justify-between pt-1.5 border-t border-lavender-deep">
              <b style={{ color: ACCENT }}>Grand total</b><b style={{ color: ACCENT }}>{formatTaka(o.totalPaisa)}</b>
            </div>
            <div className="flex justify-between"><span className="text-body-soft">Paid</span><span>{formatTaka(o.paidPaisa)}</span></div>
            <div className="flex justify-between">
              <span className={due > 0 ? "text-[#b45309] font-medium" : "text-[#0e7a3d] font-medium"}>{due > 0 ? "Due" : "Nothing owed"}</span>
              <span className={due > 0 ? "text-[#b45309] font-medium" : "text-[#0e7a3d] font-medium"}>{formatTaka(due)}</span>
            </div>
          </div>

          {o.internalNote && (
            <div className={CARD + " px-5 py-4"}>
              <b className="text-[13px] text-purple block mb-1">Note</b>
              <p className="text-[12.5px] text-body-soft m-0">{o.internalNote}</p>
            </div>
          )}

          <div className={CARD + " px-5 py-4 flex flex-col gap-2 text-center"}>
            {due > 0 && <Link href="/pos/due" className="text-[13px] text-purple border border-lavender-deep rounded-[10px] py-2.5 hover:bg-lavender/40">Collect the due</Link>}
            {advance && <Link href="/pos/advance" className="text-[13px] text-purple border border-lavender-deep rounded-[10px] py-2.5 hover:bg-lavender/40">Advance orders</Link>}
            <Link href="/pos/sales" className="text-[12.5px] text-body-soft underline">← All counter sales</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

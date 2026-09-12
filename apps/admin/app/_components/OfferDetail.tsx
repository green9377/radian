"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  getOffer, offerRedemptions, offerTimeline, offersAnalytics,
  type ApiOffer, type ApiOfferRedemption,
} from "../_data/api";

/*
  Marketing · Offers → one offer's performance.

  ⚠️ REBUILT 22 Aug 2026, and the reason matters. Every number on this page
  used to come from `_data/offers.ts` — invented redeemers, an invented
  revenue trend, an invented ROI. It looked like a working report and it was
  a drawing. That breaks the owner's rule of 19 August: no screen may present
  made-up data as if it were real.

  Everything below is now read from the API the engine actually writes to:
    GET /offers/:id              the offer itself
    GET /offers/:id/redemptions  who used it, on which order, for how much
    GET /offers/:id/timeline     what happened to it, and who did it
    GET /offers/analytics        this offer's row in the shop-wide leaderboard

  An offer nobody has used yet says exactly that. An empty report is worth
  more than a convincing false one.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const taka = (p: number) => "৳ " + Math.round(p / 100).toLocaleString("en-IN");
const day = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

const STATE: Record<string, { label: string; c: string; bg: string }> = {
  active: { label: "Live", c: "var(--t-ok)", bg: "var(--s-ok)" },
  scheduled: { label: "Scheduled", c: "var(--t-info)", bg: "var(--s-info)" },
  paused: { label: "Paused", c: "var(--t-warn)", bg: "var(--s-warn)" },
  expired: { label: "Ended", c: "var(--t-soft)", bg: "var(--s-warn)" },
  draft: { label: "Draft", c: "var(--t-soft)", bg: "var(--s-warn)" },
  pending_approval: { label: "Waiting for approval", c: "var(--t-warn)", bg: "var(--s-warn)" },
  archived: { label: "Archived", c: "var(--t-soft)", bg: "var(--s-warn)" },
};

export default function OfferDetail({ id }: { id: string }) {
  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [reds, setReds] = useState<ApiOfferRedemption[]>([]);
  const [events, setEvents] = useState<{ id: string; label: string; actorName: string | null; createdAt: string }[]>([]);
  const [mine, setMine] = useState<{ revenuePaisa: number; discountPaisa: number; newCustomers: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [o, r, t, a] = await Promise.all([
        getOffer(id),
        offerRedemptions(id).catch(() => []),
        offerTimeline(id).catch(() => []),
        offersAnalytics(90).catch(() => null),
      ]);
      setOffer(o);
      setReds(r);
      setEvents(t);
      setMine(a?.leaderboard.find((x) => x.offerId === id) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this offer.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  /*  Revenue and discount come from the leaderboard when the offer has been
      used inside the window; otherwise they are summed from the redemptions
      themselves, so a 100-day-old offer still shows its own total.  */
  const money = useMemo(() => {
    if (mine) return mine;
    return {
      revenuePaisa: reds.reduce((s, r) => s + (r.order?.totalPaisa ?? 0), 0),
      discountPaisa: reds.reduce((s, r) => s + r.discountPaisa, 0),
      newCustomers: 0,
    };
  }, [mine, reds]);

  const benefit = (o: ApiOffer) =>
    o.discountType === "FREE_DELIVERY"
      ? "Free delivery"
      : o.discountType === "PERCENT"
        ? `${o.discountValue / 100}% off`
        : `${taka(o.discountValue)} off`;

  if (loading) return <div className={WRAP}><div className="text-[13px] text-body-soft">Loading…</div></div>;
  if (err || !offer)
    return (
      <div className={WRAP}>
        <div className="bg-[var(--s-bad)] border border-[var(--l-bad)] text-[var(--t-bad)] rounded-[12px] px-4 py-3 text-[13px]">
          {err ?? "Offer not found."}
        </div>
      </div>
    );

  const st = STATE[offer.liveState] ?? STATE.draft;

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Offers · performance
          </div>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <h1 className="font-display text-[28px] text-purple m-0 leading-tight">{offer.name}</h1>
            <span className="text-[12px] font-bold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.c }}>
              {st.label}
            </span>
            {offer.code && (
              <span className="text-[12.5px] font-mono font-bold px-2.5 py-1 rounded-full bg-lavender text-purple">
                {offer.code}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Link href={`/marketing/offers/${offer.id}`}
            className="border-2 border-lavender-deep bg-white text-purple text-[14px] font-bold px-5 py-3 rounded-[12px] hover:border-orchid">
            Edit offer
          </Link>
          <Link href="/marketing/offers/list"
            className="border-2 border-lavender-deep bg-white text-purple text-[14px] font-bold px-5 py-3 rounded-[12px] hover:border-orchid">
            All offers
          </Link>
        </div>
      </div>

      {/* the four counts, in the house shape */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        {[
          { l: "Times used", v: String(offer.redeemedCount), c: "var(--t-accent)", edge: "var(--l-accent)", bg: "var(--s-accent)", icon: "bolt" },
          { l: "Revenue", v: taka(money.revenuePaisa), c: "var(--t-accent)", edge: "var(--l-orchid)", bg: "var(--s-accent)", icon: "cash" },
          { l: "Given away", v: taka(money.discountPaisa), c: "var(--t-gold)", edge: "var(--l-gold)", bg: "var(--s-bad)", icon: "tag" },
          { l: "New customers", v: String(money.newCustomers), c: "var(--t-accent)", edge: "var(--l-accent)", bg: "var(--s-accent)", icon: "user" },
        ].map((k, i) => (
          <div key={i} className="relative rounded-[16px] border border-white/70 shadow-soft overflow-hidden px-4 py-3.5"
            style={{ background: `linear-gradient(150deg,${k.bg},#ffffff 130%)` }}>
            <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: k.edge }} />
            <div className="flex items-center justify-between gap-2">
              <span className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-white shrink-0"
                style={{ background: k.edge, boxShadow: `0 3px 9px ${k.edge}45` }}>
                <Icon name={k.icon} size={14} />
              </span>
            </div>
            <div className="font-display text-[27px] leading-none mt-3 tabular-nums" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[12px] font-semibold mt-1.5" style={{ color: k.c, opacity: 0.65 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        {/* who used it */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
          <div className="px-5 py-3.5 border-b border-lavender-deep flex items-center gap-2">
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white shrink-0"
              style={{ background: "var(--s-accent)" }}><Icon name="user" size={15} /></span>
            <span className="font-display text-[17px] text-purple">Who used it</span>
            <span className="ml-auto text-[12.5px] font-bold text-purple/50 tabular-nums">{reds.length}</span>
          </div>

          {reds.length === 0 ? (
            <div className="text-center py-12">
              <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center mx-auto mb-2.5"
                style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}><Icon name="bolt" size={19} /></span>
              <div className="text-[13.5px] text-body-soft">Nobody has used this offer yet</div>
            </div>
          ) : (
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-lavender/40 text-[11.5px] font-bold uppercase tracking-[0.06em] text-body">
                  <th className="text-left px-5 py-2.5">Customer</th>
                  <th className="text-left px-4 py-2.5">Order</th>
                  <th className="text-right px-4 py-2.5">Order value</th>
                  <th className="text-right px-5 py-2.5">Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lavender-deep">
                {reds.map((r) => (
                  <tr key={r.id} className="hover:bg-lavender/20">
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-purple">{r.customer?.name || "—"}</div>
                      <div className="text-[12.5px] text-body-soft">{r.customer?.phone || ""}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.order ? (
                        <Link href={`/orders/${r.order.id}`} className="text-orchid font-semibold hover:underline">
                          {r.order.orderNo}
                        </Link>
                      ) : "—"}
                      <div className="text-[12.5px] text-body-soft">{day(r.order?.placedAt ?? r.createdAt)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{taka(r.order?.totalPaisa ?? 0)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-purple">
                      {r.discountPaisa ? taka(r.discountPaisa) : "free delivery"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          {/* the rules, read back in plain words */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
            <div className="px-5 py-3.5 border-b border-lavender-deep font-display text-[17px] text-purple">
              What it does
            </div>
            <div className="p-5 space-y-2.5 text-[13.5px]">
              <Line k="Reward" v={benefit(offer)} />
              <Line k="Applies to" v={
                offer.shape === "CATEGORY" ? offer.category?.name ?? "a category"
                  : offer.shape === "PRODUCT" ? `${offer.products?.length ?? 0} product(s)`
                  : offer.shape === "FIRST_ORDER" ? "a customer's first order"
                  : offer.shape === "PAYMENT" ? `paying by ${offer.paymentMethod}`
                  : offer.shape === "FREE_DELIVERY" ? "the delivery charge"
                  : "the whole shop"
              } />
              {offer.minSpendPaisa ? <Line k="Min spend" v={taka(offer.minSpendPaisa)} /> : null}
              {offer.maxDiscountPaisa ? <Line k="Max discount" v={taka(offer.maxDiscountPaisa)} /> : null}
              {offer.perCustomerLimit ? <Line k="Per customer" v={`${offer.perCustomerLimit} time(s)`} /> : null}
              {offer.totalLimit ? <Line k="Total limit" v={`${offer.totalLimit}`} /> : null}
              <Line k="How it starts" v={offer.mechanism === "COUPON" ? "customer types the code" : "by itself"} />
              <Line k="Runs" v={`${day(offer.startsAt) } → ${offer.endsAt ? day(offer.endsAt) : "no end"}`} />
            </div>
          </div>

          {/* what happened to it */}
          <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
            <div className="px-5 py-3.5 border-b border-lavender-deep font-display text-[17px] text-purple">
              History
            </div>
            <div className="p-5">
              {events.length === 0 ? (
                <div className="text-[13px] text-body-soft">Nothing recorded yet.</div>
              ) : (
                <div className="space-y-3">
                  {events.slice(0, 12).map((e) => (
                    <div key={e.id} className="flex gap-2.5">
                      <span className="w-[7px] h-[7px] rounded-full bg-orchid mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] text-body">{e.label}</div>
                        <div className="text-[12px] text-body-soft">
                          {day(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-body-soft shrink-0">{k}</span>
      <span className="font-semibold text-purple text-right">{v}</span>
    </div>
  );
}

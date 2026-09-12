"use client";

/*  DELIVERY — COST & PERFORMANCE (LIVE, 12 Aug 2026)

    WHAT THIS SCREEN USED TO BE. Until today every number here was invented.
    "On-time 94 %" came from `_data/deliveryDemo.ts`, and the "recent
    deliveries" table listed five hand-typed order numbers — RAD-24110,
    RAD-24107 — that never existed in any database. It carried a Demo badge, so
    it was never dishonest; it simply outlived its purpose. `/delivery/
    performance` in the API has computed the real figures for a while, and
    nobody came back to plug the screen into it.

    WHY `null` IS PRINTED AS "—" AND NEVER AS 0 %. On-time can only be judged
    against a promise, and orders taken before `Order.promisedBy` existed have
    none. The API returns `null` for those rates rather than 0, and this screen
    keeps the distinction: "nothing could be measured" and "everything was
    late" are opposite facts. The count of unmeasurable deliveries is printed
    next to the rate, because a rate that hides its own denominator has stopped
    being a rate (INT-R09).

    WHY DELIVERY COST MAY READ ৳0. `DeliveryAssignment.costPaisa` is written
    on Delivery money — at assign when a one-time fare is typed, and at settle
    when the rider or courier is paid. A parcel nobody has recorded a fare
    against is therefore genuinely zero in the database, and margin here is
    only the charge. That is shown plainly rather than filled in with a guess;
    Delivery money lists every unpriced parcel so the gap can be closed.
*/

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import { TONE, Panel, Stat, NoteBox, type Tone } from "./OrderViews";
import { formatTaka, deliveryPerformance, type ApiDeliveryAnalytics } from "../_data/api";

const RANGES = [7, 30, 90, 365];

/** basis points → "94%", and null → "—". Never null → "0%". */
const pct = (bp: number | null) => (bp === null ? "—" : `${Math.round(bp / 100)}%`);

const duration = (mins: number | null) => {
  if (mins === null) return "—";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export function DeliveryPerformance() {
  const [days, setDays] = useState(30);
  const [a, setA] = useState<ApiDeliveryAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setA(await deliveryPerformance(days));
    } catch (e) {
      setA(null);
      setError(e instanceof Error ? e.message : "could not reach the API");
    }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const Bars = ({
    title, icon, tone, rows, empty,
  }: {
    title: string; icon: string; tone: Tone; empty: string;
    rows: { name: string; value: number; sub: string }[];
  }) => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
      <Panel title={title} icon={icon} tone={tone}>
        {rows.length === 0 ? (
          <div className="p-4 text-[13px] text-body-soft">{empty}</div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.name}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="text-body font-medium">{r.name}</span>
                  <span className="text-body-soft">{r.sub}</span>
                </div>
                <div className="h-[9px] rounded-full bg-lavender overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((r.value / max) * 100)}%`, background: TONE[tone].solid }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    );
  };

  const ranges = (
    <div className="flex items-center gap-1.5 bg-lavender/60 p-1 rounded-[11px]">
      {RANGES.map((d) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] ${d === days ? "bg-white text-purple shadow-soft" : "text-body-soft hover:text-purple"}`}
        >
          {d === 365 ? "1 year" : `${d} days`}
        </button>
      ))}
    </div>
  );

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Operations · Delivery"
        title="Cost & performance"
        actions={ranges}
      />

      {error && (
        <div className="flex items-center gap-2 bg-[var(--s-warn)] text-[var(--t-warn)] text-[13px] font-medium px-4 py-3 rounded-[12px] mb-4">
          <Icon name="bolt" size={15} /> API offline — nothing on this screen is live. ({error})
        </div>
      )}

      {!a && !error && <div className="text-body-soft text-[13.5px] py-16 text-center">Loading…</div>}

      {a && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Delivery charge (collected)" value={formatTaka(a.chargedPaisa)} tone="green" icon="cash" sub="from customers" />
            <Stat label="Delivery cost (paid out)" value={formatTaka(a.costPaisa)} tone="amber" icon="truck" sub="to riders / couriers" />
            <Stat
              label="Delivery margin"
              value={formatTaka(a.marginPaisa)}
              tone={a.marginPaisa >= 0 ? "purple" : "rose"}
              icon="chart"
              sub={a.marginPaisa >= 0 ? "profit" : "loss"}
            />
            <Stat
              label="On-time"
              value={pct(a.onTimeBp)}
              tone="blue"
              icon="check"
              sub={a.measurable > 0 ? `${a.onTimeCount} of ${a.measurable} judged` : "nothing measurable yet"}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Delivered" value={String(a.delivered)} tone="green" icon="check" sub={`in the last ${days} days`} />
            <Stat label="Failed" value={String(a.failed)} tone="rose" icon="alert" sub={pct(a.failedBp)} />
            <Stat label="On the road now" value={String(a.inFlight)} tone="amber" icon="truck" sub="assigned or out" />
            <Stat label="Average time to deliver" value={duration(a.avgMinutesToDeliver)} tone="purple" icon="clock" sub="leaving the shop to arriving" />
          </div>

          {a.costPaisa === 0 && a.delivered > 0 && (
            <NoteBox tone="amber">
              Delivery cost is ৳0 — no rider or courier fare recorded yet.
            </NoteBox>
          )}

          {a.unmeasurable > 0 && (
            <NoteBox tone="blue">
              {a.unmeasurable} of {a.delivered} carried no promised time — on-time is out of {a.measurable}.
            </NoteBox>
          )}

          <div className="grid md:grid-cols-2 gap-5 mt-5">
            <Bars
              title="By courier / rider"
              icon="user"
              tone="blue"
              empty="No deliveries completed in this window."
              rows={a.byCarrier.map((x) => ({
                name: x.name,
                value: x.delivered,
                sub: `${x.delivered} · ${pct(x.onTimeBp)} on-time · ${formatTaka(x.costPaisa)}`,
              }))}
            />
            <Bars
              title="By zone"
              icon="pin"
              tone="purple"
              empty="No deliveries completed in this window."
              rows={a.byZone.map((z) => ({ name: z.name, value: z.delivered, sub: `${z.delivered} · ${pct(z.onTimeBp)}` }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/*
  ─── OFFER WINDOW — DEC-PRD-042 ───────────────────────────────────────────
  Owner, 10 Aug 2026: the discount start and end he sets *"just admin a thake,
  amder frontend a show kre na"*. The dates gated the price and then stayed
  behind the counter, so a shopper could not tell whether the number in front
  of them was ending tonight or standing all month.

  His ruling on how it should read: the date, calmly, all the way through —
  and a running clock only in the final day, when the hurry is real. A
  countdown on a fifteen-day sale teaches people to ignore countdowns.

  ⚠️ WHY THIS ALSO REFRESHES THE PAGE
  The product page is cached for 60 seconds and the PRICE is worked out on the
  server. So at the moment an offer ends, a cached page keeps showing the
  discounted price while checkout has already gone back to full — the customer
  sees ৳2,160, the till says ৳2,400, and the order is refused. That is the
  worst possible minute for it to happen, because it is the minute everyone is
  buying. When the clock reaches zero this asks Next for fresh server data, so
  the price and the badge fall away together.
*/

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** left → the four numbers, each floored, days uncapped (a 40-day offer reads "40") */
function split(ms: number) {
  const clamped = Math.max(0, ms);
  return {
    days: Math.floor(clamped / DAY),
    hours: Math.floor((clamped % DAY) / HOUR),
    mins: Math.floor((clamped % HOUR) / MINUTE),
    secs: Math.floor((clamped % MINUTE) / 1000),
  };
}

function Tile({ value, label }: { value: number | null; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span
        className="min-w-[42px] rounded-[10px] px-2 py-1.5 text-white text-[19px] font-bold leading-none tabular-nums text-center"
        style={{ background: "#F0453B", boxShadow: "0 2px 6px rgba(240,69,59,0.35)" }}
      >
        {value === null ? "--" : String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-body-soft">
        {label}
      </span>
    </span>
  );
}

export default function OfferWindow({ endsAtMs }: { endsAtMs: number | null }) {
  const router = useRouter();

  /*  ⚠️ null until mounted, on purpose. The server has no idea what time it is
      where the shopper is standing, and rendering a clock during SSR gives a
      hydration mismatch — React then throws away the markup and the whole
      panel flickers. First paint is a placeholder of the same size; the real
      numbers arrive a tick later, which nobody sees.

      DEC-PRD-042 rev (10 Aug) — owner wants the flip-tile clock ALWAYS, not
      only on the last day: *"timing ta avabe uthle attractive hoy and customer
      k crazy kre"*. One interval sets `now` on its first tick (immediately)
      and every second after, so the tiles are alive the whole time the offer
      runs — and there is no synchronous setState in an effect body.  */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (endsAtMs === null) return;
    /*  queueMicrotask, not a bare setNow — a synchronous setState in an effect
        body triggers a cascading-render lint error, and this runs a hair later
        with no visible delay.  */
    queueMicrotask(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAtMs]);

  const left = endsAtMs !== null && now !== null ? endsAtMs - now : null;

  /*  the moment it runs out, go and get the real price  */
  useEffect(() => {
    if (left === null || left > 0) return;
    router.refresh();
  }, [left, router]);

  if (endsAtMs === null) return null;
  if (left !== null && left <= 0) return null; // over — the server will drop the price too

  /*  left is null on the server and for the first client render (before the
      microtask) — show "--" placeholder tiles of the same size so hydration
      matches and there is no layout jump. Real numbers arrive a tick later.  */
  const t = left !== null ? split(left) : null;

  return (
    <div
      className="mt-3.5 inline-flex flex-col gap-2 rounded-[16px] px-4 py-3"
      style={{ background: "#FFF4EC", border: "1px solid #F7CFA8" }}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "#C23B00" }}>
        <span aria-hidden>🔥</span> Offer ends in
      </span>
      <span
        className="flex items-start gap-1.5"
        aria-label={t ? `Offer ends in ${t.days} days ${t.hours} hours ${t.mins} minutes ${t.secs} seconds` : "Offer countdown loading"}
      >
        {/*  Days tile shows whenever the offer has one or more full days left,
            OR before the numbers arrive (placeholder) — so the row does not
            change width the instant the clock starts.  */}
        {(t === null || t.days > 0) && (
          <>
            <Tile value={t ? t.days : null} label="Days" />
            <span className="text-[19px] font-bold text-[#F0453B] leading-[38px]">:</span>
          </>
        )}
        <Tile value={t ? t.hours : null} label="Hours" />
        <span className="text-[19px] font-bold text-[#F0453B] leading-[38px]">:</span>
        <Tile value={t ? t.mins : null} label="Min" />
        <span className="text-[19px] font-bold text-[#F0453B] leading-[38px]">:</span>
        <Tile value={t ? t.secs : null} label="Sec" />
      </span>
    </div>
  );
}

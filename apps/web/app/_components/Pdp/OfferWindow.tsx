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

/** "12 August, 9:00 PM" — always Dhaka, whoever is looking */
function readDhaka(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  });
}

function readLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  const s = Math.floor((ms % MINUTE) / 1000);
  /*  Under an hour the seconds matter — that is when someone is deciding.
      Above it they are noise that makes the page feel frantic.  */
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function OfferWindow({ endsAtMs }: { endsAtMs: number | null }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  /*  ⚠️ null until mounted, on purpose. The server has no idea what time it is
      where the shopper is standing, and rendering a clock during SSR gives a
      hydration mismatch — React then throws away the markup and the whole
      panel flickers. First paint shows the date; the clock arrives a tick
      later, which nobody sees.  */
  useEffect(() => { setNow(Date.now()); }, []);

  const left = endsAtMs !== null && now !== null ? endsAtMs - now : null;
  const finalDay = left !== null && left > 0 && left < DAY;

  useEffect(() => {
    if (!finalDay) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finalDay]);

  /*  the moment it runs out, go and get the real price  */
  useEffect(() => {
    if (left === null || left > 0) return;
    router.refresh();
  }, [left, router]);

  if (endsAtMs === null) return null;
  if (left !== null && left <= 0) return null; // over — the server will drop the price too

  if (finalDay && left !== null) {
    return (
      <div
        className="mt-3 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5"
        style={{ background: "#FFF1E6", border: "1px solid #F6C79A" }}
      >
        <span
          className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-white text-[13px]"
          style={{ background: "#D97706" }}
          aria-hidden
        >
          ⏱
        </span>
        <span className="text-[13.5px]" style={{ color: "#8A4B00" }}>
          <b className="font-bold">Offer ends in {readLeft(left)}</b>
          <span className="hidden sm:inline"> · {readDhaka(endsAtMs)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-[13.5px] text-body-soft">
      <span aria-hidden>🗓</span>
      <span>
        Offer price until <b className="text-ink font-semibold">{readDhaka(endsAtMs)}</b>
      </span>
    </div>
  );
}

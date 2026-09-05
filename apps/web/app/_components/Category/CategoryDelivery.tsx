"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import type { CategorySection } from "../../_data/categories";
import { getDeliveryModes, zoneCode, type DeliveryMode as ApiMode } from "../../_data/shop";
import { SectionHead } from "./SectionShell";

/*
  এখানে কোনো product দেখানো হয় না — শুধু delivery mode.
  Card-এ click করলে filtered product page-এ যাবে (approved board decision).
  Compact band — clean look, বেশি জায়গা নেয় না।

  ══════════════════════════════════════════════════════════════════════════
  LIVE SINCE 2 AUG 2026 — the names, the lines and the countdown now come from
  the Delivery module, exactly as the homepage band has since 31 Jul.

  ⚠️ WHAT WAS WRONG. Every word in this band was typed here: "before 8 PM",
  "Order before 6 PM", and a countdown that read "3h 42m" at every hour of
  every day. The owner's own instruction on the Delivery module was that a
  change there must reach the whole system — and this was the one page still
  making its own delivery promises, from a file only a developer can edit.

  It is the SAME `getDeliveryModes` the homepage reads. Two bands, one set of
  claims: switch midnight delivery off in the admin and it stops being offered
  in both places, in one edit.

  The list below stays as the FALLBACK and as the map from a method to the
  product flag its link filters on — matched by keyword, because the owner may
  rename "Same Day" to "Today" and the products it should show do not change.
  ══════════════════════════════════════════════════════════════════════════
*/

type Mode = { id: string; title: string; note: string; cta: string; href: string; icon: "bolt" | "sun" | "moon" | "truck" | "clock" | "box" };

/*
  ⚠️ `?speed=`, NOT `?delivery=` — 2 Aug 2026.

  These cards linked to `?delivery=express`, and the category page has never
  read a parameter by that name. Every one of them reloaded the same page with
  the same products: a button that looks like it filters and does not. The page
  still accepts the old spelling so links already sent out keep working.

  The three nationwide cards are not delivery SPEEDS — a courier product is not
  a two-hour product — so they point at the grid rather than at a filter the
  API does not have.
*/
const MODES: Record<"dhaka" | "bangladesh", Mode[]> = {
  dhaka: [
    /*  ⚠️ Three invented clocks lived on this line — "2-Hour", "before 8 PM",
        "before 6 PM". None was the shop's: the express is three hours and both
        cut-offs are slot settings the owner edits himself. The live cards use
        the admin's own names (see the merge below); this is the fallback, and
        a fallback may describe the service without timing it.  */
    { id: "express", title: "Express Delivery", note: "Inside Dhaka · fastest option", cta: "See Express Products", href: "?speed=express", icon: "bolt" },
    { id: "same_day", title: "Same Day", note: "Ordered today · any area", cta: "See Same Day Products", href: "?speed=same_day", icon: "sun" },
    { id: "midnight", title: "Midnight Surprise", note: "12:00–12:30 AM · pre-book", cta: "See Midnight Products", href: "?speed=midnight", icon: "moon" },
  ],
  bangladesh: [
    { id: "courier", title: "Nationwide Courier", note: "64 districts · 1–3 days", cta: "See Courier-Safe Products", href: "#all-products", icon: "truck" },
    { id: "scheduled", title: "Scheduled Date", note: "Pick the exact delivery day", cta: "See Scheduled Products", href: "#all-products", icon: "clock" },
    { id: "packing", title: "Courier-Safe Packing", note: "Hard-packed, travel-tested", cta: "How We Pack", href: "/delivery-info", icon: "box" },
  ],
};

const PATHS: Record<Mode["icon"], string> = {
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H13z",
  sun: "M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19",
  moon: "M20 13.5A8.3 8.3 0 0 1 10.5 4 8.3 8.3 0 1 0 20 13.5z",
  truck: "M2 6h12v11H2zM14 10h4l3 3.4V17h-7",
  clock: "M12 7.5V12l3 2",
  box: "M4 8h16v12H4zM4 8l2-4h12l2 4M12 4v16",
};

function ModeIcon({ icon }: { icon: Mode["icon"] }) {
  return (
    <svg className="w-5 h-5 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      {icon === "sun" && <circle cx="12" cy="12" r="4.2" />}
      {icon === "clock" && <circle cx="12" cy="12" r="8.6" />}
      <path d={PATHS[icon]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** which of the design's cards a live method wears, from its name */
function designFor(label: string, isDhaka: boolean): Mode {
  const l = label.toLowerCase();
  const pool = MODES[isDhaka ? "dhaka" : "bangladesh"];
  const hit = l.includes("midnight")
    ? pool.find((m) => m.id === "midnight")
    : l.includes("2") || l.includes("two") || l.includes("express")
      ? pool.find((m) => m.id === "express")
      : l.includes("courier") || l.includes("nationwide")
        ? pool.find((m) => m.id === "courier")
        : l.includes("schedul")
          ? pool.find((m) => m.id === "scheduled")
          : undefined;
  return hit ?? pool[0];
}

/** 204 → "3 hrs 24 min" · 45 → "45 min" — the homepage band's wording, unchanged */
function humanMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest} min`;
  return rest === 0 ? `${h} hr${h > 1 ? "s" : ""}` : `${h} hr${h > 1 ? "s" : ""} ${rest} min`;
}

export default function CategoryDelivery({
  section,
  zone,
}: {
  section: CategorySection;
  zone: Zone | null;
}) {
  const isDhaka = zone !== "bangladesh";
  const [live, setLive] = useState<ApiMode[] | null>(null);

  useEffect(() => {
    let alive = true;
    getDeliveryModes(zoneCode(zone)).then((m) => {
      if (alive && m) setLive(m);
    });
    return () => {
      alive = false;
    };
  }, [zone]);

  /* the admin's words on the design's card. A method switched off in the admin
     simply stops appearing; nothing here decides what the shop offers. */
  const modes: (Mode & { minutesLeft: number | null })[] = useMemo(() => {
    if (!live || live.length === 0) {
      return MODES[isDhaka ? "dhaka" : "bangladesh"].map((m) => ({ ...m, minutesLeft: null }));
    }
    return live.slice(0, 3).map((m) => {
      const d = designFor(m.label, isDhaka);
      return { ...d, title: m.label, note: m.eta ?? d.note, minutesLeft: m.minutesLeft };
    });
  }, [live, isDhaka]);

  /*
    Three honest states where a typed string used to be:
      time left today · today's cutoff has passed · this one has no cutoff.

    Nothing is drawn for the third — "1–3 days by courier" has no countdown,
    and inventing one for it was the original mistake.
  */
  const soonest = modes
    .map((m) => m.minutesLeft)
    .filter((n): n is number => n !== null && n > 0)
    .sort((a, b) => a - b)[0];
  const allPassed =
    modes.length > 0 && modes.every((m) => m.minutesLeft !== null && m.minutesLeft <= 0);

  return (
    <section className="relative mt-[72px] py-[52px] overflow-hidden text-white bg-[linear-gradient(150deg,#320049_0%,#470066_55%,#5B1279_100%)]">
      <span className="pointer-events-none absolute -top-56 -right-40 w-[560px] h-[560px] rounded-[50%_50%_50%_0] -rotate-45 bg-orchid/15" />

      <div className="relative max-w-[var(--page-w)] mx-auto px-6">
        <div className="mb-[26px]">
          {/* the wording is the shop's, like every other section — it was
              hard-coded here, so the three boxes the admin offers for this
              band changed nothing on the page */}
          <SectionHead
            eyebrow={section.eyebrow ?? "Delivery, done right"}
            heading={section.heading}
            subheading={section.subheading}
            onDark
          />
        </div>

        {(soonest !== undefined || allPassed) && (
          <div className="w-fit mx-auto mb-[26px] flex items-center gap-3 px-6 py-[10px] rounded-full border border-orchid/35 bg-orchid/15 text-[13.5px] whitespace-nowrap">
            {soonest !== undefined ? (
              <>
                Order within{" "}
                <b className="font-semibold text-orchid-mid">{humanMinutes(soonest)}</b> for
                delivery today
              </>
            ) : (
              <>
                Today&apos;s cutoff has passed —{" "}
                <b className="font-semibold text-orchid-mid">ordering now delivers tomorrow</b>
              </>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-4 mb-[26px]">
          {modes.map((m) => (
            <Link
              /* the name, not the design id — two live methods can wear the
                 same card (both "express"-ish) and duplicate keys would make
                 React drop one of them */
              key={`${m.id}-${m.title}`}
              href={m.href}
              className="group flex items-center gap-4 p-5 rounded-[18px] border border-white/15 bg-white/[0.07] backdrop-blur-sm transition-all duration-300 hover:-translate-y-[3px] hover:bg-white/[0.12]"
            >
              <span className="shrink-0 w-[46px] h-[46px] rounded-full bg-orchid/20 text-orchid-mid grid place-items-center">
                <ModeIcon icon={m.icon} />
              </span>
              <span className="min-w-0">
                <h3 className="font-display text-[17px] font-medium">{m.title}</h3>
                <p className="text-[12.5px] text-white/75 truncate">{m.note}</p>
                <span className="inline-flex items-center gap-[6px] mt-[6px] text-[12px] font-semibold text-orchid-mid whitespace-nowrap transition-all duration-300 group-hover:gap-3 group-hover:text-white">
                  {m.cta} →
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/delivery-info"
            className="inline-flex items-center gap-[10px] px-11 py-[15px] rounded-full border-[1.5px] border-white/85 text-white text-[15px] font-medium whitespace-nowrap transition-all duration-300 hover:bg-white hover:text-purple"
          >
            See Delivery Areas &amp; Charges →
          </Link>
        </div>
      </div>
    </section>
  );
}

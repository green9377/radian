"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import type { CategorySection } from "../../_data/categories";
import { getDeliveryModes, zoneCode, type DeliveryMode as ApiMode } from "../../_data/shop";
import { SectionHead } from "./SectionShell";

/*
  The delivery band — no products, just the ways a gift can travel. A card
  filters this page by that speed (`?speed=`).

  Everything a customer reads here is the Delivery module's: the method's
  name, its line (the ETA), the countdown to today's cutoff — the same
  `getDeliveryModes` the homepage band reads, so switching a method off in
  the admin removes it from both places in one edit. Nothing is typed here
  any more (owner, 6 Sep 2026): until the methods arrive the band is not
  drawn, and a shop with no methods has no band.

  The table below only maps a live method onto a card DESIGN (icon + which
  product flag its link filters on), by the method's own timing — see
  `designFor`. A scheduled or courier method is not a delivery SPEED — a
  courier product is not a two-hour product — so those point at the grid
  rather than at a filter the API does not have.
*/

type Design = { id: string; href: string; icon: "bolt" | "sun" | "moon" | "truck" | "clock" };

const DESIGNS: Record<"dhaka" | "bangladesh", Design[]> = {
  dhaka: [
    { id: "express", href: "?speed=express#all-products", icon: "bolt" },
    { id: "same_day", href: "?speed=same_day#all-products", icon: "sun" },
    { id: "midnight", href: "?speed=midnight#all-products", icon: "moon" },
  ],
  bangladesh: [
    { id: "courier", href: "#all-products", icon: "truck" },
    { id: "scheduled", href: "#all-products", icon: "clock" },
  ],
};

const PATHS: Record<Design["icon"], string> = {
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H13z",
  sun: "M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19",
  moon: "M20 13.5A8.3 8.3 0 0 1 10.5 4 8.3 8.3 0 1 0 20 13.5z",
  truck: "M2 6h12v11H2zM14 10h4l3 3.4V17h-7",
  clock: "M12 7.5V12l3 2",
};

function ModeIcon({ icon }: { icon: Design["icon"] }) {
  return (
    <svg className="w-5 h-5 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      {icon === "sun" && <circle cx="12" cy="12" r="4.2" />}
      {icon === "clock" && <circle cx="12" cy="12" r="8.6" />}
      <path d={PATHS[icon]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Which card a live method wears. The Delivery module's own `timing` decides
 * first — it is a fact about the method, not a word in its name:
 *   FROM_CONFIRM → express (a promise in minutes)   TODAY_SLOT → same day
 *   PICK_DATE_*  → scheduled (no speed filter exists for it: it lands on the
 *   grid)         LEAD_DAYS → courier
 * The name only settles "midnight", which is a TODAY_SLOT with its own card.
 * Nothing falls back to the express card any more — a "Schedule it" method
 * used to link to `?speed=express` and show the wrong products.
 */
function designFor(m: ApiMode, isDhaka: boolean): Design {
  const pool = [...DESIGNS.dhaka, ...DESIGNS.bangladesh];
  const by = (id: string) => pool.find((d) => d.id === id)!;
  const l = m.label.toLowerCase();
  if (l.includes("midnight")) return by("midnight");
  switch (m.timing) {
    case "FROM_CONFIRM":
      return by("express");
    case "TODAY_SLOT":
      return by("same_day");
    case "PICK_DATE_SLOT":
    case "PICK_DATE_FIXED":
      return by("scheduled");
    case "LEAD_DAYS":
      return by("courier");
    default:
      return isDhaka ? by("same_day") : by("courier");
  }
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
  const modes = useMemo(
    () =>
      (live ?? []).slice(0, 3).map((m) => {
        const d = designFor(m, isDhaka);
        return { ...d, title: m.label, note: m.eta, minutesLeft: m.minutesLeft };
      }),
    [live, isDhaka],
  );

  // not drawn until the Delivery module has answered; absent when it has nothing
  if (modes.length === 0) return null;

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
    <section className="relative py-[var(--section-y)] overflow-hidden text-white bg-[linear-gradient(150deg,#320049_0%,#470066_55%,#5B1279_100%)]">
      <span className="pointer-events-none absolute -top-56 -right-40 w-[560px] h-[560px] rounded-[50%_50%_50%_0] -rotate-45 bg-orchid/15" />

      <div className="relative max-w-[var(--page-w)] mx-auto px-6">
        {/* the wording is the shop's (Section text → Category page → Delivery band) */}
        <SectionHead eyebrow={section.eyebrow} heading={section.heading} subheading={section.subheading} onDark />

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
                {m.note && <p className="text-[12.5px] text-white/75 truncate">{m.note}</p>}
                <span className="inline-flex items-center gap-[6px] mt-[6px] text-[12px] font-semibold text-orchid-mid whitespace-nowrap transition-all duration-300 group-hover:gap-3 group-hover:text-white">
                  {m.href.includes("?speed=") ? `See ${m.title} products` : "Browse the collection"} →
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

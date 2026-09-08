"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Zone } from "../../_store/useZoneStore";
import type { CategorySection } from "../../_data/categories";
import { promisePhrase } from "../../_data/deliveryClaims";
import type { Product } from "../../_data/products";
import { toProduct } from "../../_data/categoryApi";
import {
  getDeliveryModes,
  getShopProducts,
  zoneCode,
  type DeliveryMode as ApiMode,
} from "../../_data/shop";
import ProductCard from "../Product/ProductCard";
import { SectionHead } from "./SectionShell";

/*
  The category page's delivery band — THE HOMEPAGE'S BAND, scoped to this
  category (owner, 9 Sep 2026: *"category ar section to home page ar moto howa
  dorkar but hocche na … ata purai ulta palta"*).

  What it was: a centred heading, a countdown, and three link-cards that only
  filtered the grid further down. Three purple boxes saying "3 Hours Delivery →
  See 3 Hours Delivery products", one under a heading the admin had left as
  test text. Nothing to buy, and nothing the homepage does.

  What it is now, exactly like `Delivery/DeliverySection`:
    · the heading on the left, the live countdown pill on the right
    · the delivery methods as TABS, one chosen at a time
    · under them, real products from THIS CATEGORY that can travel that fast
    · one button out to the delivery information

  ⚠️ Everything readable is the Delivery module's own: the method's name, its
  ETA, the minutes left before today's cutoff. A method switched off in the
  admin disappears from the homepage and from here in one edit — and if there
  are no methods at all, the band is not drawn.

  ⚠️ The products are filtered by BOTH the category and the speed, so a card
  under "Midnight Delivery" on the Fresh Flower page is a fresh flower that
  can actually go at midnight. The old band could not do this at all.
*/

type IconName = "bolt" | "sun" | "moon" | "truck" | "clock";

const PATHS: Record<IconName, string> = {
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H13z",
  sun: "M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19",
  moon: "M20 13.5A8.3 8.3 0 0 1 10.5 4 8.3 8.3 0 1 0 20 13.5z",
  truck: "M2 6h12v11H2zM14 10h4l3 3.4V17h-7",
  clock: "M12 7.5V12l3 2",
};

function Ic({ name }: { name: IconName }) {
  return (
    <svg className="w-5 h-5 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      {name === "sun" && <circle cx="12" cy="12" r="4.2" />}
      {name === "clock" && <circle cx="12" cy="12" r="8.6" />}
      <path d={PATHS[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Which card a live method wears, and which product flag its tab filters on.
 *
 * The module's own `timing` decides — it is a fact about the method, not a
 * word in its name. The name only settles "midnight", which is a TODAY_SLOT
 * with its own icon. A scheduled or courier method is not a delivery SPEED, so
 * its tab filters on nothing and simply shows the category's own popular gifts.
 */
function designFor(m: ApiMode): { speed?: string; icon: IconName } {
  if (/midnight/i.test(m.label) || /midnight/i.test(m.typeName ?? ""))
    return { speed: "midnight", icon: "moon" };
  switch (m.timing) {
    case "FROM_CONFIRM":
      return { speed: "express", icon: "bolt" };
    case "TODAY_SLOT":
      return { speed: "same_day", icon: "sun" };
    case "LEAD_DAYS":
      return { icon: "truck" };
    default:
      return { icon: "clock" };
  }
}

/** 204 → "3 hrs 24 min" · 45 → "45 min" — the homepage band's wording */
function humanMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest} min`;
  return rest === 0 ? `${h} hr${h > 1 ? "s" : ""}` : `${h} hr${h > 1 ? "s" : ""} ${rest} min`;
}

export default function CategoryDelivery({
  section,
  zone,
  categorySlug,
  subSlug,
  perTab = 4,
}: {
  section: CategorySection;
  zone: Zone | null;
  /** this page's category — the products under the tabs never leave it */
  categorySlug?: string;
  subSlug?: string;
  perTab?: number;
}) {
  const [modes, setModes] = useState<ApiMode[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    let alive = true;
    getDeliveryModes(zoneCode(zone)).then((m) => {
      if (alive && m) setModes(m);
    });
    return () => {
      alive = false;
    };
  }, [zone]);

  const tabs = useMemo(
    () =>
      (modes ?? []).map((m) => {
        const d = designFor(m);
        return {
          key: m.id,
          title: m.typeName || m.label,
          sub: m.eta ?? promisePhrase(m.promiseMinutes) ?? null,
          speed: d.speed,
          icon: d.icon,
          minutesLeft: m.minutesLeft,
        };
      }),
    [modes],
  );

  /*  The remembered tab may not exist once the live list arrives — fall back
      to the first, exactly as the homepage band does.  */
  const active = tabs.find((t) => t.key === picked) ?? tabs[0] ?? null;

  useEffect(() => {
    if (!active) return;
    let stale = false;
    getShopProducts({
      category: categorySlug,
      sub: subSlug,
      speed: active.speed,
      zone: zoneCode(zone) ?? undefined,
      sort: "popular",
      limit: perTab,
    }).then((res) => {
      if (!stale) setItems(res ? res.items.map(toProduct) : []);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, active?.speed, categorySlug, subSlug, zone, perTab]);

  // not drawn until the Delivery module answers; absent when it has nothing
  if (tabs.length === 0) return null;

  const left = active?.minutesLeft ?? null;
  const countdown =
    left === null ? (
      active?.sub ? (
        <>
          <b className="text-orchid-mid font-semibold">{active.title}</b> · {active.sub}
        </>
      ) : null
    ) : left > 0 ? (
      <>
        Order within <b className="text-orchid-mid font-semibold">{humanMinutes(left)}</b> for
        delivery today
      </>
    ) : (
      <>
        Today&apos;s cutoff has passed —{" "}
        <b className="text-orchid-mid font-semibold">ordering now delivers tomorrow</b>
      </>
    );

  const tabBase =
    "flex items-center gap-3 text-left rounded-[18px] px-[15px] py-[9px] border backdrop-blur-[6px] transition-all duration-300 cursor-pointer hover:-translate-y-[3px] min-w-0";

  return (
    <section className="relative py-[var(--section-y)] overflow-hidden text-white bg-[linear-gradient(150deg,#320049_0%,#470066_55%,#5B1279_100%)]">
      <span className="pointer-events-none absolute -top-56 -right-40 w-[560px] h-[560px] rounded-[50%_50%_50%_0] -rotate-45 bg-orchid/15" />

      <div className="relative z-[2] max-w-[var(--page-w)] mx-auto px-6">
        {/* head — the shop's words on the left, the live countdown on the right */}
        <div className="flex items-center justify-between gap-6 flex-wrap mb-3">
          <SectionHead
            eyebrow={section.eyebrow}
            heading={section.heading}
            subheading={section.subheading}
            onDark
            align="left"
            className="mb-0"
          />
          {countdown && (
            <div className="flex items-center gap-2 sm:gap-3 rounded-full px-4 sm:px-[26px] py-2.5 sm:py-3 text-[12.5px] sm:text-[14px] whitespace-nowrap border border-orchid/35 bg-orchid/15">
              <span className="text-orchid-mid">
                <Ic name="clock" />
              </span>
              <span>{countdown}</span>
            </div>
          )}
        </div>

        {/* the methods, as tabs */}
        <div
          className="flex overflow-x-auto gap-2 mb-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-[repeat(var(--tabs),minmax(0,1fr))] sm:gap-[12px] sm:overflow-visible sm:pb-0"
          style={{ ["--tabs" as string]: String(Math.max(tabs.length, 1)) }}
        >
          {tabs.map((t) => {
            const on = active?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setPicked(t.key)}
                aria-pressed={on}
                className={`${tabBase} shrink-0 sm:shrink ${
                  on
                    ? "bg-orchid/25 border-orchid-mid"
                    : "bg-white/[0.07] border-white/15 hover:bg-white/[0.12]"
                }`}
              >
                <span className="w-[38px] h-[38px] rounded-full grid place-items-center text-orchid-mid shrink-0 bg-orchid/20">
                  <Ic name={t.icon} />
                </span>
                <span className="min-w-0">
                  <h3 className="font-display text-[15px] sm:text-[16px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    {t.title}
                  </h3>
                  {t.sub && (
                    <p className="text-[11.5px] text-white/75 whitespace-nowrap hidden sm:block overflow-hidden text-ellipsis">
                      {t.sub}
                    </p>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/*  what can actually come that fast, from THIS category — mobile
             swipes, desktop is one row  */}
        {items.length > 0 ? (
          <div
            className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-[24px] lg:overflow-visible lg:pb-0"
            style={{ ["--cols" as string]: String(Math.min(perTab, 6)) }}
          >
            {items.map((p) => (
              <div key={p.slug} className="w-[195px] shrink-0 snap-start lg:w-auto lg:shrink">
                <ProductCard product={p} zone={zone} />
              </div>
            ))}
          </div>
        ) : (
          /*  An honest empty state: this speed exists, but nothing in this
              category can take it. Better than an empty row, and better than
              quietly showing products that cannot travel that way.  */
          <p className="text-center text-[13.5px] text-white/70 py-6">
            Nothing in this collection can go by {active?.title.toLowerCase()} today.
          </p>
        )}

        <div className="text-center mt-4">
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

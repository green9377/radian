"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import { type Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";
import SectionHead from "../ui/SectionHead";
import { getDeliveryModes, getShopProducts, zoneCode, type DeliveryMode as ApiMode } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import { promisePhrase } from "../../_data/deliveryClaims";

/*
  Delivery Section — Radian's biggest selling point, dark purple band.
  Zone-aware (from approved board):
  - Inside Dhaka: 3 clickable mode tabs (Express / Same Day / Midnight),
    countdown pill, 4 products filtered by mode
  - All Bangladesh: single Nationwide mode, 4 courier-safe products
  Countdown text is a placeholder — real cutoff logic comes with the backend.
*/

type DeliveryMode = "2hr" | "sameday" | "midnight";

function Ic({ name }: { name: string }) {
  const cls = "w-[17px] h-[17px] stroke-current fill-none stroke-[1.8]";
  if (name === "bolt")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "sun")
    return <svg className={cls} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" strokeLinecap="round" /></svg>;
  if (name === "moon")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "truck")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="17.7" r="1.8" /><circle cx="17.5" cy="17.7" r="1.8" /></svg>;
  // clock
  return <svg className={cls} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* The names and lines are the admin's (DeliveryMethod). These stay as the
   fallback, and as the map from a method to the product flag it filters on —
   matched by keyword, because the owner may rename "Same Day" to "Today" and
   the products it should show do not change. */
/*
  ⚠️ NO CLOCK IN THE FALLBACK — 3 Aug 2026.

  These read "2-Hour Delivery" and "Order by 6 PM, delivered tonight". Neither
  number was the shop's: the express is three hours in the admin, and the 6 PM
  is a slot cut-off the owner can move from his own screen. They showed
  whenever the API was slow, and the sub-lines showed ALWAYS, because
  `etaLabel` is blank on every method — so the false cut-off was the permanent
  state, not the fallback one.
*/
const MODES: { key: DeliveryMode; icon: string; title: string; sub: string }[] = [
  { key: "2hr", icon: "bolt", title: "Express Delivery", sub: "Anywhere inside Dhaka city" },
  { key: "sameday", icon: "sun", title: "Same Day", sub: "Ordered today, delivered today" },
  { key: "midnight", icon: "moon", title: "Midnight Delivery", sub: "Surprises at the stroke of 12" },
];

/** which product flag a live method filters on, from its name */
function modeKeyFor(label: string): DeliveryMode {
  const l = label.toLowerCase();
  if (l.includes("midnight")) return "midnight";
  if (l.includes("2") || l.includes("two") || l.includes("express")) return "2hr";
  return "sameday";
}

/** 204 → "3 hrs 24 min" · 45 → "45 min" */
function humanMinutes(m: number): string {
  const h = Math.floor(m / 60), rest = m % 60;
  if (h <= 0) return `${rest} min`;
  return rest === 0 ? `${h} hr${h > 1 ? "s" : ""}` : `${h} hr${h > 1 ? "s" : ""} ${rest} min`;
}

export default function DeliverySection({ zone, config = {} }: { zone: Zone | null; config?: Record<string, unknown> }) {
  /*  The section's own settings (Storefront → Homepage → Layout → Delivery
      band, 4 Sep 2026): how many cards under the tabs, and the button.  */
  const perTab = Math.min(Math.max(Number(config.perTab) || 4, 2), 8);
  const viewAll = config.showViewAll === false
    ? null
    : { text: String(config.viewAllText || "View All Products"), href: String(config.viewAllHref || "/products") };
  const [mode, setMode] = useState<DeliveryMode>("2hr");
  const [apiModes, setApiModes] = useState<ApiMode[] | null>(null);
  const isBd = zone === "bangladesh";

  /*
    LIVE since 31 Jul 2026 — names, lines and the countdown come from the
    Delivery module.

    ⚠️ THE COUNTDOWN USED TO BE A TYPED STRING: "Order within 3 hrs 24 min",
    identical at nine in the morning and at eleven at night, and wrong at both.
    It is now the real minutes to that method's cutoff, worked out on the server
    in Bangladesh time — the browser's clock belongs to the visitor, not to the
    shop.
  */
  useEffect(() => {
    let alive = true;
    getDeliveryModes(zoneCode(zone)).then((m) => { if (alive && m) setApiModes(m); });
    return () => { alive = false; };
  }, [zone]);

  /* Merge: the admin's words, the design's icon, and the product flag the tab
     filters on. A method the admin has switched off simply stops appearing. */
  const tabs = useMemo(() => {
    if (!apiModes || apiModes.length === 0) return MODES.map((m) => ({ ...m, minutesLeft: null as number | null }));
    return apiModes.map((m) => {
      const key = modeKeyFor(m.label);
      const design = MODES.find((d) => d.key === key) ?? MODES[0];
      /*  ⚠️ The owner's `etaLabel` first, then the type's own promise — "within
          3 hours", built from `promiseMinutes`. Only when neither exists does
          the design's wording show, and that wording no longer names a time.
          Before this the promise line was never reached at all: `etaLabel` is
          blank on every method today, so every card silently showed the
          hard-coded sub-line.  */
      const sub = m.eta ?? promisePhrase(m.promiseMinutes) ?? design.sub;
      return { key, icon: design.icon, title: m.typeName || m.label, sub, minutesLeft: m.minutesLeft };
    });
  }, [apiModes]);

  useEffect(() => {
    // the remembered tab may not exist any more once the live list arrives
    if (tabs.length > 0 && !tabs.some((t) => t.key === mode)) setMode(tabs[0].key);
  }, [tabs, mode]);

  /*
    ═══ THE FOUR CARDS UNDER THE TABS ARE REAL NOW — 4 Aug 2026 ═══

    They were `PRODUCTS.filter(p.exp / p.sd / p.mn)` — mock products with mock
    speed flags, on the band whose whole promise is "these can actually come
    this fast". The REAL flags live on the real products (`supportsExpress`
    etc, admin-ticked), and `/shop/products?speed=` filters on exactly them —
    the same query the category pages' speed filter uses.
  */
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    let stale = false;
    const speed =
      isBd ? undefined : mode === "2hr" ? "express" : mode === "sameday" ? "same_day" : "midnight";
    getShopProducts({
      speed,
      zone: isBd ? "bangladesh" : "dhaka",
      sort: "popular",
      limit: perTab,
    }).then((res) => {
      if (!stale) setItems(res ? res.items.map(toProduct) : []);
    });
    return () => {
      stale = true;
    };
  }, [isBd, mode, perTab]);

  /*  The nationwide card says what the nationwide delivery method says — its
      own name and ETA from the Delivery module — the same way the Dhaka tabs
      do. "Nationwide, 1–3 Days / Courier-safe gifts to all 64 districts" was
      typed here and never read the admin (4 Sep 2026). The typed words remain
      only for the moment before the masters answer.  */
  const bdMode = isBd ? apiModes?.[0] ?? null : null;
  const bdTitle = bdMode ? bdMode.typeName || bdMode.label : "Nationwide, 1–3 Days";
  const bdSub = bdMode
    ? bdMode.eta ?? promisePhrase(bdMode.promiseMinutes) ?? "Courier-safe gifts across Bangladesh"
    : "Courier-safe gifts to all 64 districts";

  /*
    Three honest states, where there used to be one invented one:
      time left today · the cutoff has passed · this method has no cutoff.
    Null means the pill is not drawn at all — "1–3 days by courier" has no
    countdown, and inventing one for it was the original mistake.
  */
  const active = tabs.find((t) => t.key === mode);
  const left = active?.minutesLeft ?? null;
  const countdown =
    left === null ? (
      active?.sub ? <>{active.sub}</> : null
    ) : left > 0 ? (
      <>Order within <b className="text-orchid-mid font-semibold">{humanMinutes(left)}</b> for delivery today</>
    ) : (
      <>Today&apos;s cutoff has passed — <b className="text-orchid-mid font-semibold">ordering now delivers tomorrow</b></>
    );

  const modeBase =
    "flex items-center gap-3 text-left rounded-[18px] px-[17px] py-[13px] border backdrop-blur-[6px] transition-all duration-300 cursor-pointer hover:-translate-y-[3px]";

  return (
    <section
      className="relative overflow-hidden py-11 text-white"
      id="delivery"
      style={{
        background:
          "linear-gradient(150deg,#320049 0%,#470066 55%,#5B1279 100%)",
      }}
    >
      {/* Decorative petal */}
      <div
        className="absolute w-[560px] h-[560px] rounded-[50%_50%_50%_0] -rotate-45 pointer-events-none"
        style={{ background: "rgba(207,67,234,.14)", top: -220, right: -160 }}
      />

      <div className="relative z-[2] max-w-[1200px] mx-auto px-6">
        {/* Head */}
        <div className="flex items-center justify-between gap-6 flex-wrap mb-6">
          {/* The two zone wordings become a zone override on `home.delivery`:
              set one for All Bangladesh in the admin and it replaces the
              default here, exactly as the ternary used to. */}
          <SectionHead
            sectionKey="home.delivery"
            eyebrow="Radian's promise"
            title={isBd ? "Gifts That Travel Well, Nationwide" : "Need It Today? We've Got You"}
            tone="dark"
            align="left"
            className="mb-0"
          />
          {countdown && (
          <div
            className="flex items-center gap-2 sm:gap-3 rounded-full px-4 sm:px-[26px] py-2.5 sm:py-3 text-[12.5px] sm:text-[14px] whitespace-nowrap"
            style={{
              background: "rgba(207,67,234,.16)",
              border: "1px solid rgba(207,67,234,.35)",
            }}
          >
            <span className="text-orchid-mid"><Ic name="clock" /></span>
            <span>{countdown}</span>
          </div>
          )}
        </div>

        {/* Mode tabs */}
        {isBd ? (
          <div className="mb-6 grid">
            <div
              className={`${modeBase} max-w-[520px] w-full mx-auto`}
              style={{
                background: "rgba(207,67,234,.25)",
                borderColor: "#e9a8f5",
              }}
            >
              <div className="w-[38px] h-[38px] rounded-full grid place-items-center text-orchid-mid shrink-0" style={{ background: "rgba(207,67,234,.22)" }}>
                <Ic name="truck" />
              </div>
              <div>
                <h3 className="font-display text-[16px] font-medium whitespace-nowrap">{bdTitle}</h3>
                <p className="text-[11.5px] text-white/75 whitespace-nowrap">{bdSub}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex overflow-x-auto gap-2 mb-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:gap-[14px] sm:mb-6 sm:overflow-visible sm:pb-0">
            {tabs.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`${modeBase} shrink-0 sm:shrink`}
                style={
                  mode === m.key
                    ? { background: "rgba(207,67,234,.25)", borderColor: "#e9a8f5" }
                    : { background: "rgba(255,255,255,.07)", borderColor: "rgba(255,255,255,.14)" }
                }
              >
                <div className="w-[38px] h-[38px] rounded-full grid place-items-center text-orchid-mid shrink-0" style={{ background: "rgba(207,67,234,.22)" }}>
                  <Ic name={m.icon} />
                </div>
                <div>
                  <h3 className="font-display text-[15px] sm:text-[16px] font-medium whitespace-nowrap">{m.title}</h3>
                  <p className="text-[11.5px] text-white/75 whitespace-nowrap hidden sm:block">{m.sub}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Products — mobile: horizontal swipe · desktop: grid */}
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-4 lg:gap-[22px] lg:overflow-visible lg:pb-0">
          {items.map((p) => (
            <div key={p.slug} className="w-[195px] shrink-0 snap-start lg:w-auto lg:shrink">
              <ProductCard product={p} zone={zone} />
            </div>
          ))}
        </div>

        {/* View all — the owner's words and link, or no button at all */}
        {viewAll && (
          <div className="flex justify-center mt-[26px]">
            <Link
              href={viewAll.href}
              className="inline-flex items-center gap-[10px] px-10 py-[14px] border-[1.5px] border-white/85 rounded-full text-white font-medium text-[15px] tracking-[0.04em] transition-all duration-300 hover:bg-white hover:text-purple whitespace-nowrap"
            >
              {viewAll.text} <ArrowIcon />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

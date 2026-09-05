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

/** which product flag a tab filters on; null = every product (a scheduled or courier method) */
type Speed = "express" | "same_day" | "midnight" | null;

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
  if (name === "calendar")
    return <svg className={cls} viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="2.2" /><path d="M4 10.5h16M8.5 4v4M15.5 4v4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
const MODES: { key: string; speed: Speed; icon: string; title: string; sub: string }[] = [
  { key: "express", speed: "express", icon: "bolt", title: "Express Delivery", sub: "Anywhere inside Dhaka city" },
  { key: "same_day", speed: "same_day", icon: "sun", title: "Same Day", sub: "Ordered today, delivered today" },
  { key: "midnight", speed: "midnight", icon: "moon", title: "Midnight Delivery", sub: "Surprises at the stroke of 12" },
];

/*  Which product flag a live method filters on, and which icon it wears —
    from the method's TIMING first, its name second.

    ⚠️ 5 Sep 2026: this used to key the tabs by a guess from the NAME, and
    "3 Hours Delivery", "same day Delivery" and "Schedule it" all guessed
    "sameday" — three tabs, one key, so clicking one lit all three and the
    pill beside the heading never changed. Tabs are keyed by the method's own
    id now; this only decides the filter and the icon.  */
function speedFor(m: ApiMode): { speed: Speed; icon: string } {
  const name = `${m.typeName} ${m.label}`.toLowerCase();
  if (name.includes("midnight")) return { speed: "midnight", icon: "moon" };
  if (m.timing === "FROM_CONFIRM") return { speed: "express", icon: "bolt" };
  if (m.timing === "TODAY_SLOT") return { speed: "same_day", icon: "sun" };
  if (m.timing === "LEAD_DAYS") return { speed: null, icon: "truck" };
  if (m.timing === "PICK_DATE_SLOT" || m.timing === "PICK_DATE_FIXED") return { speed: null, icon: "calendar" };
  if (name.includes("same day") || name.includes("sameday") || name.includes("today")) return { speed: "same_day", icon: "sun" };
  if (name.includes("hour") || name.includes("express")) return { speed: "express", icon: "bolt" };
  return { speed: null, icon: "clock" };
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
  const [picked, setMode] = useState<string>("express");
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
      const { speed, icon } = speedFor(m);
      const design = MODES.find((d) => d.speed === speed) ?? MODES[0];
      /*  ⚠️ The owner's `etaLabel` first, then the type's own promise — "within
          3 hours", built from `promiseMinutes`. Only when neither exists does
          the design's wording show, and that wording no longer names a time.
          Before this the promise line was never reached at all: `etaLabel` is
          blank on every method today, so every card silently showed the
          hard-coded sub-line.  */
      const sub = m.eta ?? promisePhrase(m.promiseMinutes) ?? design.sub;
      return { key: m.id, speed, icon, title: m.typeName || m.label, sub, minutesLeft: m.minutesLeft };
    });
  }, [apiModes]);

  // the remembered tab may not exist once the live list arrives — fall back to the first
  const mode = tabs.some((t) => t.key === picked) ? picked : (tabs[0]?.key ?? picked);

  /*
    ═══ THE FOUR CARDS UNDER THE TABS ARE REAL NOW — 4 Aug 2026 ═══

    They were `PRODUCTS.filter(p.exp / p.sd / p.mn)` — mock products with mock
    speed flags, on the band whose whole promise is "these can actually come
    this fast". The REAL flags live on the real products (`supportsExpress`
    etc, admin-ticked), and `/shop/products?speed=` filters on exactly them —
    the same query the category pages' speed filter uses.
  */
  const [items, setItems] = useState<Product[]>([]);
  const activeSpeed = tabs.find((t) => t.key === mode)?.speed ?? null;
  useEffect(() => {
    let stale = false;
    const speed = isBd ? undefined : activeSpeed ?? undefined;
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
  }, [isBd, activeSpeed, perTab]);

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
      active ? <><b className="text-orchid-mid font-semibold">{active.title}</b> · {active.sub}</> : null
    ) : left > 0 ? (
      <>Order within <b className="text-orchid-mid font-semibold">{humanMinutes(left)}</b> for delivery today</>
    ) : (
      <>Today&apos;s cutoff has passed — <b className="text-orchid-mid font-semibold">ordering now delivers tomorrow</b></>
    );

  const modeBase =
    "flex items-center gap-3 text-left rounded-[18px] px-[15px] py-[9px] border backdrop-blur-[6px] transition-all duration-300 cursor-pointer hover:-translate-y-[3px] min-w-0";

  return (
    <section
      className="relative overflow-hidden py-8 lg:py-5 text-white"
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

      <div className="relative z-[2] max-w-[var(--page-w)] mx-auto px-6">
        {/* Head */}
        <div className="flex items-center justify-between gap-6 flex-wrap mb-2.5">
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
          <div
            className="flex overflow-x-auto gap-2 mb-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-[repeat(var(--tabs),minmax(0,1fr))] sm:gap-[12px] sm:overflow-visible sm:pb-0"
            style={{ ["--tabs" as string]: String(Math.max(tabs.length, 1)) }}
          >
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
                <div className="min-w-0">
                  <h3 className="font-display text-[15px] sm:text-[16px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">{m.title}</h3>
                  <p className="text-[11.5px] text-white/75 whitespace-nowrap hidden sm:block overflow-hidden text-ellipsis">{m.sub}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Products — mobile: horizontal swipe · desktop: ONE row, as many
            columns as the admin's "cards per tab" (owner, 5 Sep 2026: the
            whole band must fit one screen — five cards make a shorter row
            than four) */}
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

        {/* View all — the owner's words and link, or no button at all */}
        {viewAll && (
          <div className="flex justify-center mt-3.5">
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

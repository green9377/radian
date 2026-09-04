"use client";

import { useEffect, useState } from "react";
import type { Zone } from "../Header/Header";
import ShopIcon from "../ui/ShopIcon";
import { getTrustBadges, zoneCode } from "../../_data/shop";
import { HERO_FOOT } from "../Hero/HeroSection";

/*
  ⚠️ NO SPEED IN THE FALLBACK — 3 Aug 2026.

  The live strip comes from the admin's trust badges, so this list is only what
  shows in the moment before they arrive, or if none are configured. It used to
  open with "2-Hour Delivery", which meant a shop with no badges set up
  advertised a service it did not run, and every visitor saw it for a beat
  before the real ones loaded. A fallback is allowed to say less; it is not
  allowed to say something the shop cannot do.
*/
const DHAKA_ITEMS = [
  {
    icon: "bolt",
    title: "Fast Dhaka Delivery",
    sub: "Anywhere inside Dhaka",
  },
  {
    icon: "heart",
    title: "Freshness Promise",
    sub: "Arranged the same day",
  },
  {
    icon: "lock",
    title: "Secure Payment",
    sub: "bKash, Nagad and cards",
  },
  {
    icon: "store",
    title: "Real Store in Dhaka",
    sub: "Visit us seven days a week",
  },
];

const BD_ITEMS = [
  {
    icon: "truck",
    title: "Nationwide Delivery",
    sub: "All 64 districts, 1–3 days",
  },
  {
    icon: "gift",
    title: "Courier-Safe Packing",
    sub: "Arrives beautiful, always",
  },
  {
    icon: "lock",
    title: "Secure Payment",
    sub: "bKash, Nagad and cards",
  },
  {
    icon: "store",
    title: "Real Store in Dhaka",
    sub: "Visit us seven days a week",
  },
];

function Icon({ name }: { name: string }) {
  const cls = "w-9 h-9 stroke-current fill-none stroke-[1.8]";
  if (name === "bolt") return <svg className={cls} viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "heart") return <svg className={cls} viewBox="0 0 24 24"><path d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "lock") return <svg className={cls} viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 10.5V7.7a4 4 0 0 1 8 0v2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "truck") return <svg className={cls} viewBox="0 0 24 24"><path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="17.7" r="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="17.5" cy="17.7" r="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "gift") return <svg className={cls} viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 13v7h13v-7M12 9v11M12 9C9 9 7.2 7.6 7.6 5.8 8 4.2 10.4 4 12 6.6 13.6 4 16 4.2 16.4 5.8 16.8 7.6 15 9 12 9z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg className={cls} viewBox="0 0 24 24"><path d="M4 9.5 5.4 4h13.2L20 9.5M5.5 12v8h13v-8M10 20v-5h4v5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/*
  4 Sep 2026 — on desktop the strip is a floating white card, and when it
  comes straight after the hero it sits in the hero's foot: pulled up by
  HERO_FOOT and exactly that tall, so the block after it starts where the
  hero's background ends. The picture runs under the card; the card is the
  picture's bottom edge. Mobile keeps the flat bar it always had.
*/
export default function TrustStrip({ zone, overlapsHero = false }: { zone: Zone | null; overlapsHero?: boolean }) {
  const fallback = zone === "bangladesh" ? BD_ITEMS : DHAKA_ITEMS;
  const [items, setItems] = useState<{ key: string; icon: string | null; iconUrl: string | null; title: string; sub: string }[]>(
    fallback.map((i) => ({ key: i.title, icon: i.icon, iconUrl: null, title: i.title, sub: i.sub })),
  );

  /*
    LIVE since 30 Jul 2026. These were marked "leave as fixed text" in the
    homepage audit and the owner overruled it, correctly: they are the shop's
    biggest claims and they change when a payment method or a delivery promise
    does.

    An empty result keeps the fallback. The strip sits directly under the hero
    and carries the border that separates them; removing it leaves the page
    looking cut off rather than clean.
  */
  useEffect(() => {
    let alive = true;
    getTrustBadges(zoneCode(zone)).then((rows) => {
      if (!alive || rows === null || rows.length === 0) return;
      setItems(rows.map((r) => ({
        key: r.id, icon: r.icon, iconUrl: r.iconUrl, title: r.title, sub: r.subtitle ?? "",
      })));
    });
    return () => { alive = false; };
  }, [zone]);

  return (
    <div
      className={overlapsHero ? "relative z-[3] lg:-mt-[var(--hero-foot)] lg:h-[var(--hero-foot)]" : "relative z-[3]"}
      style={{ ["--hero-foot" as string]: HERO_FOOT }}
    >
      <div className="bg-white border-b border-lavender-deep lg:bg-transparent lg:border-0">
        <div className="max-w-[1200px] mx-auto px-6 lg:max-w-none lg:mx-[3.6vw] lg:px-[18px] lg:py-[22px] lg:bg-white lg:rounded-[24px] lg:shadow-lift">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 py-3 md:flex md:justify-between md:gap-5 md:py-[18px] lg:grid lg:grid-cols-5 lg:gap-0 lg:py-0">
            {items.map((item, i) => (
              <div key={item.key} className={`flex items-center gap-2 md:gap-3 lg:gap-3.5 lg:px-5 ${i > 0 ? "lg:border-l lg:border-lavender-deep" : ""}`}>
                <div className="text-orchid shrink-0 scale-75 md:scale-100 origin-left lg:w-[46px] lg:h-[46px] lg:rounded-[14px] lg:bg-lavender lg:text-purple lg:grid lg:place-items-center lg:origin-center">
                  <ShopIcon name={item.icon} url={item.iconUrl} className="w-9 h-9 lg:w-6 lg:h-6" />
                </div>
                <div className="min-w-0">
                  <b className="block text-[12.5px] md:text-[14.5px] lg:text-[15px] text-purple lg:text-ink font-semibold leading-snug whitespace-nowrap">
                    {item.title}
                  </b>
                  <span className="text-[11px] md:text-[13px] lg:text-[12.5px] text-body-soft whitespace-nowrap block overflow-hidden text-ellipsis">
                    {item.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import type { Zone } from "../Header/Header";
import ShopIcon from "../ui/ShopIcon";
import { getTrustBadges, zoneCode } from "../../_data/shop";
import { HERO_FOOT } from "../Hero/HeroSection";

/*
  The trust strip — the admin's trust badges (Homepage → Trust strip): icon or
  uploaded icon, title, small line, zone, order, on/off. Whether the strip is
  on the page at all is the layout's (Homepage → Layout). Nothing is typed in
  here: no badges means no card.

  4 Sep 2026 — on desktop the strip is a floating white card, and when it
  comes straight after the hero it sits in the hero's foot: pulled up by
  HERO_FOOT and exactly that tall, so the block after it starts where the
  hero's background ends. The picture runs under the card; the card is the
  picture's bottom edge. Phones keep the flat bar under the hero.
*/
type Item = { key: string; icon: string | null; iconUrl: string | null; title: string; sub: string };

export default function TrustStrip({ zone, overlapsHero = false }: { zone: Zone | null; overlapsHero?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let alive = true;
    getTrustBadges(zoneCode(zone)).then((rows) => {
      if (!alive || rows === null) return;
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
      {items.length > 0 && (
        <div className="bg-white border-b border-lavender-deep lg:bg-transparent lg:border-0">
          <div className="max-w-[1200px] mx-auto px-6 lg:max-w-none lg:mx-[3.6vw] lg:px-[18px] lg:py-[22px] lg:bg-white lg:rounded-[24px] lg:shadow-lift">
            <div
              className="grid grid-cols-2 gap-x-3 gap-y-3 py-3 md:flex md:justify-between md:gap-5 md:py-[18px] lg:grid lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-0 lg:py-0"
              style={{ ["--cols" as string]: String(items.length) }}
            >
              {items.map((item, i) => (
                <div key={item.key} className={`flex items-center gap-2 md:gap-3 lg:gap-3.5 lg:px-5 lg:min-w-0 ${i > 0 ? "lg:border-l lg:border-lavender-deep" : ""}`}>
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
      )}
    </div>
  );
}
